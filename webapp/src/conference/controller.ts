import type {Store, Action} from 'redux';

import {OpenTalkConferenceClient} from './client';
import {isElectron, getDesktopSources, captureDesktopStream} from './livekit/desktop_capturer';
import {getMuteOnJoin} from './livekit/devices';
import {LiveKitRoom, participantIdFromIdentity} from './livekit/room';
import {pickScreenSource} from './livekit/screen_picker';
import * as trackRegistry from './livekit/track_registry';
import {JoinCancelledError} from './signaling/conference_room';
import type {Participant} from './signaling/modules/core';
import {clearOpenTalkStatus, setOpenTalkStatus} from './status';

import {getOrCreateDeviceSecret, heartbeat} from '../client/rest';
import {noticeSet} from '../store/slice_notice';
import {
    participantAdded,
    participantRemoved,
    participantsBulkSet,
    speakingChanged,
    participantsReset,
    handRaised,
    handLowered,
    participantMediaChanged,
    participantRoleChanged,
    type ParticipantInfo,
} from '../store/slice_participants';
import {
    connectStarted,
    connected,
    participantsChanged,
    disconnected,
    connectError,
    setMicEnabled,
    setCamEnabled,
    setScreenShareEnabled,
    setLivekitConnected,
    setRaiseHandsEnabled,
    setIsHost,
    setReconnectAttempt,
} from '../store/slice_session';
import {
    trackSubscribed,
    trackUnsubscribed,
    activeSpeakersChanged,
    tracksReset,
    type TrackKind,
} from '../store/slice_tracks';
import {t} from '../util/i18n';
import {PLUGIN_STATE_KEY} from '../util/selectors';

const ALLOWED_ROLES = new Set<string>(['moderator', 'user', 'guest']);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyStore = Store<any, Action>;

function toParticipantInfo(p: Participant): ParticipantInfo {
    const role = (p.role && ALLOWED_ROLES.has(p.role)) ? p.role as ParticipantInfo['role'] : undefined;
    return {id: p.id, displayName: p.displayName, role};
}

let activeClient: OpenTalkConferenceClient | null = null;
let activeLiveKit: LiveKitRoom | null = null;
let heartbeatIntervalId: number | null = null;
let tearingDown = false;

// Auto-rejoin after a recoverable drop; the resumption token survives an unexpected close.
const REJOIN_MAX_ATTEMPTS = 5;
const REJOIN_DELAY_MS = 5000;

type LocalMediaState = {mic: boolean; cam: boolean};

interface PendingRejoin {
    roomID: string;
    channelID: string;
    displayName: string;
    store: AnyStore;
    attempt: number;
    timer?: ReturnType<typeof setTimeout>;

    // The first attempt waits on this so a leave racing the gap can still cancel.
    after?: Promise<void>;
}

let pendingRejoin: PendingRejoin | null = null;
let pendingMediaRestore: LocalMediaState | null = null;

function startHeartbeat(channelID: string): void {
    stopHeartbeat();

    // Fire one immediately so the reaper sees freshness right away.
    heartbeat(channelID).catch(() => {/* swallow */});
    heartbeatIntervalId = window.setInterval(() => {
        heartbeat(channelID).catch((e: Error) => {
            // eslint-disable-next-line no-console
            console.warn('[opentalk] heartbeat failed:', e.message);
        });
    }, 30000);
}

function stopHeartbeat(): void {
    if (heartbeatIntervalId !== null) {
        window.clearInterval(heartbeatIntervalId);
        heartbeatIntervalId = null;
    }
}

// Root components don't have a Redux Provider; hold the store module-level.
let activeStore: AnyStore | null = null;

async function tearDownActiveConference(): Promise<void> {
    if (tearingDown) {
        return;
    }
    tearingDown = true;
    try {
        const lk = activeLiveKit;
        const c = activeClient;
        activeLiveKit = null;
        activeClient = null;

        // UI must observe disconnect synchronously; socket teardown happens after.
        stopHeartbeat();
        clearOpenTalkStatus();
        trackRegistry.clear();
        if (activeStore) {
            activeStore.dispatch(tracksReset());
            activeStore.dispatch(participantsReset());
            activeStore.dispatch(setMicEnabled(false));
            activeStore.dispatch(setCamEnabled(false));
            activeStore.dispatch(setScreenShareEnabled(false));
            activeStore.dispatch(setLivekitConnected(false));
            activeStore.dispatch(disconnected());
        }

        if (lk) {
            try {
                await lk.disconnect();
            } catch {
                // already disconnecting
            }
        }

        // A LiveKit drop leaves the socket joined; leave() closes it and no-ops when closed.
        if (c) {
            try {
                await c.leave();
            } catch {
                // socket may already be closed
            }
        }
    } finally {
        tearingDown = false;
    }
}

function readLocalMediaState(store: AnyStore): LocalMediaState {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = store.getState()?.[PLUGIN_STATE_KEY]?.session ?? {};
    return {mic: session.micEnabled === true, cam: session.camEnabled === true};
}

function cancelPendingRejoin(): void {
    const rejoin = pendingRejoin;
    pendingRejoin = null;
    pendingMediaRestore = null;
    if (rejoin?.timer !== undefined) {
        clearTimeout(rejoin.timer);
    }
}

function runRejoinAttempt(rejoin: PendingRejoin): void {
    const proceed = () => {
        if (pendingRejoin !== rejoin) {
            return;
        }
        rejoin.attempt += 1;
        rejoin.store.dispatch(setReconnectAttempt(rejoin.attempt));
        establishConference(rejoin.roomID, rejoin.channelID, rejoin.displayName, rejoin.store, {notifyOnFailure: false}).then((joined) => {
            if (pendingRejoin !== rejoin) {
                return;
            }
            if (joined) {
                pendingRejoin = null;
                return;
            }
            if (rejoin.attempt >= REJOIN_MAX_ATTEMPTS) {
                pendingRejoin = null;
                rejoin.store.dispatch(setReconnectAttempt(0));
                rejoin.store.dispatch(noticeSet({
                    kind: 'error',
                    message: t({de: 'Verbindung konnte nicht wiederhergestellt werden', en: 'Could not restore the meeting connection'}),
                }));
                return;
            }
            rejoin.timer = setTimeout(() => {
                rejoin.timer = undefined;
                runRejoinAttempt(rejoin);
            }, REJOIN_DELAY_MS);
        }).catch((e: unknown) => {
            // A terminal close ends the meeting for good; stop retrying and say so.
            if (pendingRejoin !== rejoin || !(e instanceof TerminalCloseError)) {
                return;
            }
            pendingRejoin = null;
            rejoin.store.dispatch(setReconnectAttempt(0));
            rejoin.store.dispatch(noticeSet({kind: 'error', message: e.message}));
        });
    };
    if (rejoin.after) {
        rejoin.after.then(proceed);
    } else {
        proceed();
    }
}

function beginRejoin(roomID: string, channelID: string, displayName: string,
    store: AnyStore, media: LocalMediaState, after?: Promise<void>): void {
    cancelPendingRejoin();
    pendingMediaRestore = media;
    const rejoin: PendingRejoin = {roomID, channelID, displayName, store, attempt: 0, after};
    pendingRejoin = rejoin;
    runRejoinAttempt(rejoin);
}

export function setActiveStore(store: AnyStore): void {
    activeStore = store;
}

export async function startConferenceConnection(
    roomID: string,
    channelID: string,
    displayName: string,
    store: AnyStore,
): Promise<void> {
    // A manual join supersedes an in-flight rejoin; its client must be torn
    // down first or the join below would silently no-op.
    const rejoining = (store.getState()?.[PLUGIN_STATE_KEY]?.session?.reconnectAttempt ?? 0) > 0;
    cancelPendingRejoin();
    store.dispatch(setReconnectAttempt(0));
    if (rejoining && activeClient) {
        await tearDownActiveConference();
    }
    try {
        await establishConference(roomID, channelID, displayName, store, {notifyOnFailure: true});
    } catch (e: unknown) {
        if (e instanceof TerminalCloseError) {
            store.dispatch(noticeSet({kind: 'error', message: e.message}));
        }
    }
}

// Thrown when a non-recoverable close ends the join: stops the loop, reports terminally.
class TerminalCloseError extends Error {}

// Resolves true on 'connected', false on failure or cancellation; rejoin attempts report through their loop.
async function establishConference(
    roomID: string,
    channelID: string,
    displayName: string,
    store: AnyStore,
    opts: {notifyOnFailure: boolean},
): Promise<boolean> {
    if (activeClient) {
        return false;
    }
    setActiveStore(store);
    const client = new OpenTalkConferenceClient('');
    activeClient = client;

    const rejoinAfterDrop = () => {
        // Capture media intent before teardown wipes it, keep the resumption
        // token alive, and register the rejoin so a racing leave can cancel it.
        const mediaWanted = readLocalMediaState(store);
        client.markUnexpectedDrop();
        const teardown = tearDownActiveConference();
        beginRejoin(roomID, channelID, displayName, store, mediaWanted, teardown);
    };

    client.on('connected', (data) => {
        // Moderation rights: ownership or moderator role at join; promotions arrive via role_updated.
        const localUser = data.participants[0];
        const isModerator = data.isHost === true || localUser?.role === 'moderator';
        const localParticipantId = localUser?.id;

        store.dispatch(connected({
            participantCount: data.participants.length,
            isHost: isModerator,
            isRoomOwner: data.isHost === true,
            localParticipantId,
        }));

        store.dispatch(participantsBulkSet({
            participants: data.participants.map(toParticipantInfo),
        }));

        // Some OpenTalk builds inline livekit credentials in joinSuccess; most send a separate frame.
        if (data.livekit?.url && data.livekit?.token) {
            bringUpLiveKit(data.livekit.url, data.livekit.token, store, rejoinAfterDrop, opts.notifyOnFailure);
        }

        startHeartbeat(channelID);
        setOpenTalkStatus();

        // Raise-hands is OFF per room; moderators enable it so raiseHand works.
        if (isModerator) {
            client.enableRaiseHands();
        }
    });
    client.on('livekit_credentials', ({url, token}) => {
        if (activeLiveKit) {
            // Already up via the joinSuccess fallback; re-credentialing would drop publications.
            return;
        }
        bringUpLiveKit(url, token, store, rejoinAfterDrop, opts.notifyOnFailure);
    });
    client.on('participant_joined', (p) => {
        store.dispatch(participantsChanged({participantCount: client.getParticipants().length}));
        store.dispatch(participantAdded({participant: toParticipantInfo(p)}));
    });
    client.on('hand_raised', ({participantId}) => {
        store.dispatch(handRaised({participantID: participantId}));
    });
    client.on('hand_lowered', ({participantId}) => {
        store.dispatch(handLowered({participantID: participantId}));
    });
    client.on('raise_hands_toggled', ({enabled}) => {
        store.dispatch(setRaiseHandsEnabled(enabled));
    });
    client.on('force_muted', () => {
        // Server-side force-mute via RoomService; sync button, release the device.
        if (!activeLiveKit) {
            return;
        }
        activeLiveKit.disableMic().catch(() => { /* already muted / no track */ });
        store.dispatch(setMicEnabled(false));
    });
    client.on('role_updated', ({participantId, newRole}) => {
        store.dispatch(participantRoleChanged({id: participantId, role: newRole}));
        const localId = store.getState()?.[PLUGIN_STATE_KEY]?.session?.localParticipantId;
        if (participantId === localId) {
            store.dispatch(setIsHost(newRole === 'moderator'));
        }
    });
    client.on('participant_left', ({id}) => {
        store.dispatch(participantsChanged({participantCount: client.getParticipants().length}));
        store.dispatch(participantRemoved({id}));
    });
    let connectErrorDispatched = false;
    const dispatchConnectError = (message: string) => {
        if (connectErrorDispatched) {
            return;
        }
        connectErrorDispatched = true;
        store.dispatch(connectError({error: message}));

        // Teardown hides the widget, so surface the error here; rejoin attempts stay silent.
        if (opts.notifyOnFailure) {
            store.dispatch(noticeSet({
                kind: 'error',
                message: `${t({de: 'Meeting-Beitritt fehlgeschlagen', en: 'Could not join the meeting'})}: ${message}`,
            }));
        }
    };
    let joinSettled = false;
    let terminalCloseDuringJoin = false;

    client.on('closed', (data) => {
        // Stale events must not touch state that may belong to a newer call.
        if (activeClient !== client) {
            return;
        }
        if (!joinSettled) {
            // The join-phase close rejects connect(); its catch owns reporting
            // and needs the final-vs-transient classification.
            terminalCloseDuringJoin = !data.recoverable;
            return;
        }

        if (data.recoverable) {
            rejoinAfterDrop();
            return;
        }
        tearDownActiveConference().finally(() => {
            store.dispatch(noticeSet({
                kind: 'error',
                message: t({de: 'Die Meetingverbindung wurde beendet', en: 'The meeting connection was closed'}),
            }));
        });
    });
    client.on('error', (err) => {
        // Every socket error is followed by a classified close; once joined,
        // that close owns reporting — an error here would mislabel a drop.
        if (activeClient !== client || joinSettled) {
            return;
        }

        // Dispatch after teardown or disconnected() wipes it in the same tick.
        tearDownActiveConference().finally(() => dispatchConnectError(err.message));
    });

    store.dispatch(connectStarted({channelID, roomID}));

    try {
        await client.connect(roomID, channelID, displayName, getOrCreateDeviceSecret());
        joinSettled = true;
        return true;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
        // A superseded attempt (manual join took over) must stay fully inert.
        if (activeClient !== client) {
            return false;
        }
        await tearDownActiveConference();
        if (e instanceof JoinCancelledError) {
            return false;
        }
        if (terminalCloseDuringJoin) {
            throw new TerminalCloseError(t({de: 'Die Meetingverbindung wurde beendet', en: 'The meeting connection was closed'}));
        }
        dispatchConnectError(e?.message ?? String(e));
        return false;
    }
}

function bringUpLiveKit(url: string, token: string, store: AnyStore, onMediaDrop: () => void, notifyOnFailure: boolean): void {
    const lk = new LiveKitRoom();
    activeLiveKit = lk;

    lk.on('connected', () => {
        // Restore the pre-drop camera; the mic only if mute-on-join permits.
        // Screen share is never restored (browsers require a user gesture).
        const restore = pendingMediaRestore;
        pendingMediaRestore = null;
        const publishMic = restore ? restore.mic && !getMuteOnJoin() : !getMuteOnJoin();

        if (publishMic) {
            // Publish before surfacing connected so a racing user toggle cannot double-publish.
            lk.enableMic().
                then(() => {
                    store.dispatch(setMicEnabled(true));
                }).
                catch((err: Error) => {
                    // Mic-permission denial just leaves us muted; no need to crash.
                    // eslint-disable-next-line no-console
                    console.warn('[opentalk] enableMic failed:', err.message);
                }).
                finally(() => {
                    store.dispatch(setLivekitConnected(true));
                });
        } else {
            store.dispatch(setLivekitConnected(true));
        }

        if (!restore?.cam) {
            return;
        }
        lk.enableCam().
            then(() => {
                registerLocalCamTrack(store, lk);
                store.dispatch(setCamEnabled(true));
            }).
            catch((err: Error) => {
                // eslint-disable-next-line no-console
                console.warn('[opentalk] enableCam failed:', err.message);
            });
    });

    lk.on('disconnected', () => {
        // Teardown nulls activeLiveKit first; only an unexpected drop sees it.
        if (activeLiveKit !== lk) {
            return;
        }
        onMediaDrop();
    });

    // Screen share is also kind:'video'; branch on source or it overwrites the camera tile.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const trackKindOf = (sub: any): TrackKind => {
        if (sub.track?.kind === 'audio') {
            return 'audio';
        }
        const source = sub.publication?.source ?? sub.track?.source;
        if (source === 'screen_share' || source === 'screenShare' || source === 'screen-share') {
            return 'screen';
        }
        return 'video';
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lk.on('track_subscribed', (sub: any) => {
        const trackId: string = sub.publication?.trackSid ?? sub.track?.sid;
        if (!trackId) {
            return;
        }
        trackRegistry.register(trackId, sub.track);
        store.dispatch(trackSubscribed({
            participantId: participantIdFromIdentity(sub.participant.identity),
            kind: trackKindOf(sub),
            trackId,
        }));
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lk.on('track_unsubscribed', (sub: any) => {
        const trackId: string = sub.publication?.trackSid ?? sub.track?.sid;
        if (trackId) {
            trackRegistry.unregister(trackId);
        }
        store.dispatch(trackUnsubscribed({
            participantId: participantIdFromIdentity(sub.participant.identity),
            kind: trackKindOf(sub),
        }));
    });

    lk.on('active_speakers_changed', (speakers: unknown) => {
        store.dispatch(activeSpeakersChanged({speakers: speakers as string[]}));
        store.dispatch(speakingChanged({speakers: speakers as string[]}));
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lk.on('track_muted', (data: any) => {
        const source = data?.source as string | undefined;
        if (source === 'microphone') {
            store.dispatch(participantMediaChanged({id: data.participantId, muted: data.muted}));

            // Server-side force-mute of our own track drives the mic button even
            // when the force_muted signaling frame never arrives. Idempotent
            // with the user's own mute.
            if (data.muted && data.participantId === lk.getLocalIdentity()) {
                store.dispatch(setMicEnabled(false));
            }
        } else if (source === 'camera') {
            store.dispatch(participantMediaChanged({id: data.participantId, cameraOff: data.muted}));
        }
    });

    // OS share controls end the screen track outside our toggle path; clear
    // the publication out of Redux and the registry.
    lk.on('local_screen_share_ended', () => {
        const trackId = localTrackId(lk, 'screen');
        trackRegistry.unregister(trackId);
        store.dispatch(trackUnsubscribed({participantId: lk.getLocalIdentity(), kind: 'screen'}));
        store.dispatch(setScreenShareEnabled(false));
    });

    lk.connect(url, token).catch((err: Error) => {
        if (activeLiveKit !== lk) {
            return;
        }
        // eslint-disable-next-line no-console
        console.warn('[opentalk] LiveKit connect failed:', err.message);
        store.dispatch(setLivekitConnected(false));
        activeLiveKit = null;

        // The OpenTalk session stays up, so nothing else tells the user media is
        // dead. Silent for auto-rejoin attempts; their loop reports once.
        if (notifyOnFailure) {
            store.dispatch(noticeSet({
                kind: 'error',
                message: t({
                    de: 'Keine Medienverbindung zum Meeting. Audio und Video funktionieren nicht — bitte verlassen und erneut beitreten.',
                    en: 'No media connection to the meeting. Audio and video will not work — please leave and rejoin.',
                }),
            }));
        }
    });
}

export async function leaveActiveConference(): Promise<void> {
    cancelPendingRejoin();
    activeStore?.dispatch(setReconnectAttempt(0));
    await tearDownActiveConference();
}

export async function endActiveMeeting(): Promise<void> {
    const store = activeStore;
    if (!store) {
        await leaveActiveConference();
        return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channelID: string | undefined = store.getState()?.[PLUGIN_STATE_KEY]?.session?.channelID;

    // Kick everyone on the OpenTalk side first. Best-effort: never block teardown.
    activeClient?.sendDebrief();

    await leaveActiveConference();
    if (!channelID) {
        return;
    }
    try {
        const res = await fetch('/plugins/com.github.morzan1001.mattermost-plugin-opentalk/api/v1/meetings/end', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            },
            credentials: 'include',
            body: JSON.stringify({channel_id: channelID}),
        });
        if (!res.ok) {
            throw new Error(`endMeeting failed: ${res.status}`);
        }
    } catch (err) {
        // The server-side meeting stays "in progress" until the reaper; surface
        // it so the user knows the channel is still blocked for a restart.
        store.dispatch(noticeSet({
            kind: 'error',
            message: t({de: 'Meeting konnte nicht beendet werden', en: 'Failed to end the meeting'}),
        }));
        // eslint-disable-next-line no-console
        console.warn('[opentalk] endActiveMeeting failed:', (err as Error).message);
    }
}

let micToggleInFlight: Promise<void> | null = null;
let camToggleInFlight: Promise<void> | null = null;
let screenToggleInFlight: Promise<void> | null = null;

export function toggleMic(): Promise<void> {
    if (micToggleInFlight) {
        return micToggleInFlight;
    }
    micToggleInFlight = (async () => {
        if (!activeLiveKit || !activeStore) {
            return;
        }
        if (activeLiveKit.isMicEnabled()) {
            await activeLiveKit.disableMic();
            activeStore.dispatch(setMicEnabled(false));
        } else {
            await activeLiveKit.enableMic();
            activeStore.dispatch(setMicEnabled(true));
        }
    })().finally(() => {
        micToggleInFlight = null;
    });
    return micToggleInFlight;
}

// Synthetic id: LiveKit's LocalTrack.sid is undefined until publication round-trips.
function localTrackId(lk: LiveKitRoom, kind: 'video' | 'screen'): string {
    return `local:${lk.getLocalIdentity()}:${kind}`;
}

// Publishes the enabled camera into registry and slice so self-view tiles
// resolve a track; shared by toggle, device-change and rejoin paths.
function registerLocalCamTrack(store: AnyStore, lk: LiveKitRoom): void {
    if (!lk.camTrack) {
        return;
    }
    const trackId = localTrackId(lk, 'video');
    trackRegistry.register(trackId, lk.camTrack);
    store.dispatch(trackSubscribed({participantId: lk.getLocalIdentity(), kind: 'video', trackId}));
}

export function toggleCam(): Promise<void> {
    if (camToggleInFlight) {
        return camToggleInFlight;
    }
    camToggleInFlight = (async () => {
        if (!activeLiveKit || !activeStore) {
            return;
        }
        const lk = activeLiveKit;
        const localId = lk.getLocalIdentity();
        if (lk.isCamEnabled()) {
            const trackId = localTrackId(lk, 'video');
            trackRegistry.unregister(trackId);
            activeStore.dispatch(trackUnsubscribed({participantId: localId, kind: 'video'}));
            await lk.disableCam();
            activeStore.dispatch(setCamEnabled(false));
        } else {
            await lk.enableCam();
            registerLocalCamTrack(activeStore, lk);
            activeStore.dispatch(setCamEnabled(true));
        }
    })().finally(() => {
        camToggleInFlight = null;
    });
    return camToggleInFlight;
}

// Re-publish the active track against the newly-selected device. No-op if
// not in a live call or if the device is not currently active.
export async function applyMicDeviceChange(): Promise<void> {
    if (!activeLiveKit || !activeStore) {
        return;
    }
    if (!activeLiveKit.isMicEnabled()) {
        return;
    }
    try {
        await activeLiveKit.disableMic();
        await activeLiveKit.enableMic();
    } catch (err) {
        // Re-enable failed (permission revoked, device unplugged, etc.); the
        // mic is gone, so Redux must reflect that or the UI will show an
        // active mic indicator without an actual stream.
        activeStore.dispatch(setMicEnabled(false));
        // eslint-disable-next-line no-console
        console.warn('[opentalk] applyMicDeviceChange failed:', (err as Error).message);
    }
}

export async function applyCamDeviceChange(): Promise<void> {
    if (!activeLiveKit || !activeStore) {
        return;
    }
    const lk = activeLiveKit;
    if (!lk.isCamEnabled()) {
        return;
    }
    const localId = lk.getLocalIdentity();
    const oldTrackId = localTrackId(lk, 'video');
    try {
        trackRegistry.unregister(oldTrackId);
        activeStore.dispatch(trackUnsubscribed({participantId: localId, kind: 'video'}));
        await lk.disableCam();
        await lk.enableCam();
        registerLocalCamTrack(activeStore, lk);
    } catch (err) {
        activeStore.dispatch(setCamEnabled(false));
        // eslint-disable-next-line no-console
        console.warn('[opentalk] applyCamDeviceChange failed:', (err as Error).message);
    }
}

export function toggleScreenShare(): Promise<void> {
    if (screenToggleInFlight) {
        return screenToggleInFlight;
    }
    screenToggleInFlight = doToggleScreenShare().finally(() => {
        screenToggleInFlight = null;
    });
    return screenToggleInFlight;
}

async function doToggleScreenShare(): Promise<void> {
    if (!activeLiveKit || !activeStore) {
        return;
    }
    const lk = activeLiveKit;
    const localId = lk.getLocalIdentity();
    if (lk.isScreenShareEnabled()) {
        const trackId = localTrackId(lk, 'screen');
        trackRegistry.unregister(trackId);
        activeStore.dispatch(trackUnsubscribed({participantId: localId, kind: 'screen'}));
        await lk.disableScreenShare();
        activeStore.dispatch(setScreenShareEnabled(false));
    } else {
        try {
            let usedGetDisplayMedia = false;
            try {
                const stream = await navigator.mediaDevices.getDisplayMedia({video: true, audio: false});
                await lk.enableScreenShareFromStream(stream);
                usedGetDisplayMedia = true;
            } catch (gdmErr) {
                if (!isElectron()) {
                    throw gdmErr;
                }
                // eslint-disable-next-line no-console
                console.warn('[opentalk] getDisplayMedia failed, trying Electron postMessage bridge', gdmErr);
            }
            if (!usedGetDisplayMedia) {
                const sources = await getDesktopSources().catch((e: Error) => {
                    // eslint-disable-next-line no-console
                    console.warn('[opentalk] getDesktopSources failed:', e.message);
                    throw e;
                });
                if (sources.length === 0) {
                    // eslint-disable-next-line no-alert
                    window.alert(t({de: 'Keine Bildschirme/Fenster verfügbar zum Teilen.', en: 'No screens or windows available to share.'}));
                    return;
                }
                const sourceId = await pickScreenSource(sources);
                if (!sourceId) {
                    return;
                }
                const stream = await captureDesktopStream(sourceId);
                await lk.enableScreenShareFromStream(stream);
            }

            const screenTrack = lk.getLocalScreenTrack();
            if (screenTrack) {
                const trackId = localTrackId(lk, 'screen');
                trackRegistry.register(trackId, screenTrack);
                activeStore.dispatch(trackSubscribed({participantId: localId, kind: 'screen', trackId}));
            }
            activeStore.dispatch(setScreenShareEnabled(true));
        } catch (err) {
            // eslint-disable-next-line no-console
            console.warn('[opentalk] enableScreenShare failed:', (err as Error).message);
        }
    }
}

// Runs an action against the live client; no-op when not in a meeting.
function withClient(fn: (client: OpenTalkConferenceClient) => void): void {
    if (activeClient) {
        fn(activeClient);
    }
}

export function raiseLocalHand(): void {
    withClient((client) => client.raiseHand());
}

export function lowerLocalHand(): void {
    withClient((client) => client.lowerHand());
}

export function forceMute(participantId: string): void {
    withClient((client) => client.forceMute([participantId]));
}

export function muteAll(): void {
    if (!activeClient) {
        return;
    }
    const selfId = activeStore?.getState()?.[PLUGIN_STATE_KEY]?.session?.localParticipantId;
    const others = activeClient.getParticipants().map((p) => p.id).filter((id) => id !== selfId);
    activeClient.forceMute(others);
}

export function kick(participantId: string): void {
    withClient((client) => client.kick(participantId));
}

export function ban(participantId: string): void {
    withClient((client) => client.ban(participantId));
}

export function grantModerator(participantId: string): void {
    withClient((client) => client.grantModerator(participantId));
}

export function revokeModerator(participantId: string): void {
    withClient((client) => client.revokeModerator(participantId));
}

export function resetHand(participantId: string): void {
    withClient((client) => client.resetRaisedHands(participantId));
}

export function grantScreenShare(participantId: string): void {
    withClient((client) => client.grantScreenShare([participantId]));
}

export function revokeScreenShare(participantId: string): void {
    withClient((client) => client.revokeScreenShare([participantId]));
}

// eslint-disable-next-line no-underscore-dangle, @typescript-eslint/naming-convention
export function _reset(): void {
    cancelPendingRejoin();
    activeClient = null;
    activeLiveKit = null;
    activeStore = null;
    stopHeartbeat();
}

// JSON string so devtools doesn't truncate large arrays.
export function debugState(): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stateSlice: any = activeStore?.getState()?.[PLUGIN_STATE_KEY] ?? {};
    const snapshot = {
        hasClient: activeClient !== null,
        hasLiveKit: activeLiveKit !== null,
        hasStore: activeStore !== null,
        liveKit: activeLiveKit ? {
            identity: activeLiveKit.getLocalIdentity(),
            mic: activeLiveKit.isMicEnabled(),
            cam: activeLiveKit.isCamEnabled(),
            screenShare: activeLiveKit.isScreenShareEnabled(),
        } : null,
        session: stateSlice.session,
        participants: stateSlice.participants,
        tracks: stateSlice.tracks,
    };
    return JSON.stringify(snapshot, null, 2);
}
