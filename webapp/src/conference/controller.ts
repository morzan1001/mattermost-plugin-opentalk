import type {Store, Action} from 'redux';

import {OpenTalkConferenceClient} from './client';
import {isElectron, getDesktopSources, captureDesktopStream} from './livekit/desktop_capturer';
import {getMuteOnJoin} from './livekit/devices';
import {LiveKitRoom} from './livekit/room';
import {pickScreenSource} from './livekit/screen_picker';
import * as trackRegistry from './livekit/track_registry';
import type {Participant} from './signaling/modules/core';

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

function toParticipantInfo(p: Participant): ParticipantInfo {
    const role = (p.role && ALLOWED_ROLES.has(p.role)) ? p.role as ParticipantInfo['role'] : undefined;
    return {id: p.id, displayName: p.displayName, role};
}

let activeClient: OpenTalkConferenceClient | null = null;
let activeLiveKit: LiveKitRoom | null = null;
let heartbeatIntervalId: number | null = null;
let tearingDown = false;

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

const PRIOR_STATUS_KEY = 'opentalk:prior-status:v1';

type CustomStatus = {emoji?: string; text?: string; duration?: string; expires_at?: string};

function readPriorStatus(): CustomStatus | null {
    try {
        const raw = window.localStorage.getItem(PRIOR_STATUS_KEY);
        return raw ? JSON.parse(raw) as CustomStatus : null;
    } catch {
        return null;
    }
}

function writePriorStatus(status: CustomStatus | null): void {
    try {
        if (status === null) {
            window.localStorage.removeItem(PRIOR_STATUS_KEY);
        } else {
            window.localStorage.setItem(PRIOR_STATUS_KEY, JSON.stringify(status));
        }
    } catch {
        // quota / private mode
    }
}

async function fetchCurrentStatus(): Promise<CustomStatus | null> {
    try {
        const r = await fetch('/api/v4/users/me', {
            method: 'GET',
            headers: {'X-Requested-With': 'XMLHttpRequest'},
            credentials: 'include',
        });
        if (!r.ok) {
            return null;
        }
        const me = await r.json() as {props?: {customStatus?: string}};
        const s = me.props?.customStatus;
        if (typeof s !== 'string' || s === '') {
            return null;
        }
        return JSON.parse(s) as CustomStatus;
    } catch {
        return null;
    }
}

const OPENTALK_STATUS_EMOJI = 'phone';

// Bumped by both set and clear. setOpenTalkStatusAsync captures the value at
// call time and bails before its PUT if it changed, so a late set cannot
// overwrite a clear that ran while its GET was in flight (status stuck 4h).
let statusEpoch = 0;

async function setOpenTalkStatusAsync(epoch: number): Promise<void> {
    const prior = await fetchCurrentStatus();
    if (epoch !== statusEpoch) {
        return;
    }
    if (prior && prior.emoji !== OPENTALK_STATUS_EMOJI) {
        writePriorStatus(prior);
    }

    // MM 6+ rejects custom-status PUTs with a duration but no expires_at
    // (400 Bad Request). Send both.
    const expiresAt = new Date(Date.now() + (4 * 60 * 60 * 1000)).toISOString();
    await fetch('/api/v4/users/me/status/custom', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        body: JSON.stringify({
            emoji: OPENTALK_STATUS_EMOJI,
            text: t({de: 'Im OpenTalk-Meeting', en: 'In an OpenTalk meeting'}),
            duration: 'four_hours',
            expires_at: expiresAt,
        }),
    }).catch(() => { /* swallow */ });
}

function setOpenTalkStatus(): void {
    const epoch = ++statusEpoch;
    setOpenTalkStatusAsync(epoch).catch(() => { /* swallow */ });
}

function clearOpenTalkStatus(): void {
    statusEpoch++;
    const prior = readPriorStatus();
    writePriorStatus(null);
    if (!prior || !prior.emoji) {
        fetch('/api/v4/users/me/status/custom', {
            method: 'DELETE',
            headers: {'X-Requested-With': 'XMLHttpRequest'},
            credentials: 'include',
        }).catch(() => { /* swallow */ });
        return;
    }
    fetch('/api/v4/users/me/status/custom', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        body: JSON.stringify(prior),
    }).catch(() => { /* swallow */ });
}

// Root components don't have a Redux Provider; hold the store module-level.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let activeStore: Store<any, Action> | null = null;

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

        // UI must observe disconnect synchronously; the actual socket teardown
        // happens after.
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

        // Always close the signaling room, not just on explicit leave. A
        // LiveKit drop or a signaling error leaves the OpenTalk socket joined,
        // so without this the user stays visible in the room after hangup.
        // ConferenceRoom.leave() is a no-op when already closed.
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setActiveStore(store: Store<any, Action>): void {
    activeStore = store;
}

export async function startConferenceConnection(
    roomID: string,
    channelID: string,
    displayName: string,

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store: Store<any, Action>,
): Promise<void> {
    if (activeClient) {
        // Already connected/connecting; ignore duplicate clicks.
        return;
    }
    setActiveStore(store);
    const client = new OpenTalkConferenceClient('');
    activeClient = client;

    client.on('connected', (data) => {
        const isHost = data.isHost === true;

        const localParticipantId = data.participants[0]?.id;

        store.dispatch(connected({
            participantCount: data.participants.length,
            isHost,
            isRoomOwner: isHost,
            localParticipantId,
        }));

        store.dispatch(participantsBulkSet({
            participants: data.participants.map(toParticipantInfo),
        }));

        // Some OpenTalk builds inline livekit credentials in joinSuccess;
        // most send a separate livekit:credentials frame. Keep both paths.
        if (data.livekit?.url && data.livekit?.token) {
            bringUpLiveKit(data.livekit.url, data.livekit.token, store);
        }

        startHeartbeat(channelID);
        setOpenTalkStatus();

        // OpenTalk's raise-hands feature is OFF by default per room. Hosts
        // turn it on so participants' raiseHand calls aren't silently dropped.
        if (isHost) {
            client.enableRaiseHands();
        }
    });
    client.on('livekit_credentials', ({url, token}) => {
        if (activeLiveKit) {
            // Already up via the joinSuccess fallback — re-credentialing would
            // tear down active publications.
            return;
        }
        bringUpLiveKit(url, token, store);
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
        // LiveKit does not auto-mute the publisher on a moderator force-mute;
        // stop the local mic and reflect it in Redux.
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

        // Surface it: teardown resets the session to idle and the widget
        // vanishes, so the error would otherwise be invisible.
        store.dispatch(noticeSet({
            kind: 'error',
            message: `${t({de: 'Meeting-Beitritt fehlgeschlagen', en: 'Could not join the meeting'})}: ${message}`,
        }));
    };

    client.on('closed', () => {
        tearDownActiveConference().catch(() => { /* swallow */ });
    });
    client.on('error', (err) => {
        // Dispatch the error AFTER teardown: teardown's disconnected() resets
        // the session to initial (clearing error), so an error dispatched
        // before it would be wiped in the same tick and the user would see no
        // feedback for a failed join.
        tearDownActiveConference().finally(() => dispatchConnectError(err.message));
    });

    store.dispatch(connectStarted({channelID, roomID}));

    try {
        await client.connect(roomID, channelID, displayName, getOrCreateDeviceSecret());

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
        await tearDownActiveConference();
        dispatchConnectError(e?.message ?? String(e));
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function bringUpLiveKit(url: string, token: string, store: Store<any, Action>): void {
    const lk = new LiveKitRoom();
    activeLiveKit = lk;

    lk.on('connected', () => {
        if (getMuteOnJoin()) {
            store.dispatch(setLivekitConnected(true));
            return;
        }

        // Publish the mic before we surface "livekit connected" so a user
        // toggle racing this path cannot trigger a parallel publish.
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
    });

    lk.on('disconnected', () => {
        tearDownActiveConference().catch(() => { /* swallow */ });
    });

    // Differentiate screen-share from camera: both have kind:'video' in LiveKit
    // but different sources. Without this the screen-track would overwrite the
    // cam-track in the slice, hiding the remote camera during screen-share.
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
            participantId: sub.participant.identity,
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
            participantId: sub.participant.identity,
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
        } else if (source === 'camera') {
            store.dispatch(participantMediaChanged({id: data.participantId, cameraOff: data.muted}));
        }
    });

    // OS share-controls / dismissed-tab stops the screen track outside our
    // toggle path; we still need to clear the publication out of Redux and
    // the track registry.
    lk.on('local_screen_share_ended', () => {
        const trackId = localTrackId(lk, 'screen');
        trackRegistry.unregister(trackId);
        store.dispatch(trackUnsubscribed({participantId: lk.getLocalIdentity(), kind: 'screen'}));
        store.dispatch(setScreenShareEnabled(false));
    });

    lk.connect(url, token).catch((err: Error) => {
        // eslint-disable-next-line no-console
        console.warn('[opentalk] LiveKit connect failed:', err.message);
        store.dispatch(setLivekitConnected(false));
        activeLiveKit = null;
    });
}

export async function leaveActiveConference(): Promise<void> {
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

    // Kick all participants on the OpenTalk side before we leave. Best-effort:
    // failure must not block teardown.
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

// Stable synthetic id for a local track: LiveKit's LocalTrack.sid is
// undefined until the publication round-trips.
function localTrackId(lk: LiveKitRoom, kind: 'video' | 'screen'): string {
    return `local:${lk.getLocalIdentity()}:${kind}`;
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
            if (lk.camTrack) {
                const trackId = localTrackId(lk, 'video');
                trackRegistry.register(trackId, lk.camTrack);
                activeStore.dispatch(trackSubscribed({participantId: localId, kind: 'video', trackId}));
            }
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
        if (lk.camTrack) {
            const newTrackId = localTrackId(lk, 'video');
            trackRegistry.register(newTrackId, lk.camTrack);
            activeStore.dispatch(trackSubscribed({participantId: localId, kind: 'video', trackId: newTrackId}));
        }
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

export function raiseLocalHand(): void {
    if (!activeClient) {
        return;
    }
    activeClient.raiseHand();
}

export function lowerLocalHand(): void {
    if (!activeClient) {
        return;
    }
    activeClient.lowerHand();
}

export function forceMute(participantId: string): void {
    if (!activeClient) {
        return;
    }
    activeClient.forceMute([participantId]);
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
    if (!activeClient) {
        return;
    }
    activeClient.kick(participantId);
}

export function ban(participantId: string): void {
    if (!activeClient) {
        return;
    }
    activeClient.ban(participantId);
}

export function grantModerator(participantId: string): void {
    if (!activeClient) {
        return;
    }
    activeClient.grantModerator(participantId);
}

export function revokeModerator(participantId: string): void {
    if (!activeClient) {
        return;
    }
    activeClient.revokeModerator(participantId);
}

export function resetHand(participantId: string): void {
    if (!activeClient) {
        return;
    }
    activeClient.resetRaisedHands(participantId);
}

export function resetAllHands(): void {
    if (!activeClient) {
        return;
    }
    activeClient.resetRaisedHands();
}

export function grantScreenShare(participantId: string): void {
    if (!activeClient) {
        return;
    }
    activeClient.grantScreenShare([participantId]);
}

export function revokeScreenShare(participantId: string): void {
    if (!activeClient) {
        return;
    }
    activeClient.revokeScreenShare([participantId]);
}

// eslint-disable-next-line no-underscore-dangle, @typescript-eslint/naming-convention
export function _reset(): void {
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
        liveKitLocalIdentity: activeLiveKit ? activeLiveKit.getLocalIdentity() : null,
        liveKitMicEnabled: activeLiveKit ? activeLiveKit.isMicEnabled() : null,
        liveKitCamEnabled: activeLiveKit ? activeLiveKit.isCamEnabled() : null,
        liveKitScreenShareEnabled: activeLiveKit ? activeLiveKit.isScreenShareEnabled() : null,
        session: {
            status: stateSlice.session?.status,
            participantCount: stateSlice.session?.participantCount,
            localParticipantId: stateSlice.session?.localParticipantId,
            isHost: stateSlice.session?.isHost,
            micEnabled: stateSlice.session?.micEnabled,
            camEnabled: stateSlice.session?.camEnabled,
            screenShareEnabled: stateSlice.session?.screenShareEnabled,
            livekitConnected: stateSlice.session?.livekitConnected,
            joinedAt: stateSlice.session?.joinedAt,
        },
        participantsOrder: stateSlice.participants?.order,
        participantsById: stateSlice.participants?.byId,
        tracksPerParticipant: stateSlice.tracks?.perParticipant,
        tracksActiveSpeakers: stateSlice.tracks?.activeSpeakers,
    };
    return JSON.stringify(snapshot, null, 2);
}
