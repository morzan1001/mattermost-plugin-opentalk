import type {Store, Action} from 'redux';

import {OpenTalkConferenceClient} from './client';
import {isElectron, getDesktopSources, captureDesktopStream} from './livekit/desktop_capturer';
import {getMuteOnJoin} from './livekit/devices';
import {LiveKitRoom} from './livekit/room';
import {pickScreenSource} from './livekit/screen_picker';
import * as trackRegistry from './livekit/track_registry';
import type {Participant} from './signaling/modules/core';

import {getOrCreateDeviceSecret, heartbeat} from '../client/rest';
import {
    participantAdded,
    participantRemoved,
    participantsBulkSet,
    speakingChanged,
    participantsReset,
    handRaised,
    handLowered,
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

// While in a meeting, set a custom MM status so the user appears busy.
// Cleared on any session end. Fire-and-forget — failures are non-blocking.
function setOpenTalkStatus(): void {
    fetch('/api/v4/users/me/status/custom', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        body: JSON.stringify({
            emoji: 'phone',
            text: t({de: 'Im OpenTalk-Meeting', en: 'In an OpenTalk meeting'}),
            duration: 'four_hours',
        }),
    }).catch(() => { /* swallow */ });
}

function clearOpenTalkStatus(): void {
    fetch('/api/v4/users/me/status/custom', {
        method: 'DELETE',
        headers: {'X-Requested-With': 'XMLHttpRequest'},
        credentials: 'include',
    }).catch(() => { /* swallow */ });
}

// MM RootComponents do not have a Redux Provider in scope, so useStore()
// returns null. The store is captured at plugin bootstrap and reused here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let activeStore: Store<any, Action> | null = null;

type TearDownReason = 'leave' | 'closed' | 'error' | 'livekit';

async function tearDownActiveConference(reason: TearDownReason): Promise<void> {
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
        if (reason === 'leave' && c) {
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

        // Self is always the first entry: ConferenceRoom.connect() prepends it
        // from the joinSuccess top-level id.
        const localParticipantId = data.participants[0]?.id;

        store.dispatch(connected({
            participantCount: data.participants.length,
            isHost,
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
    };

    client.on('closed', () => {
        void tearDownActiveConference('closed');
    });
    client.on('error', (err) => {
        dispatchConnectError(err.message);
        void tearDownActiveConference('error');
    });

    store.dispatch(connectStarted({channelID, roomID}));

    try {
        await client.connect(roomID, channelID, displayName, getOrCreateDeviceSecret());

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
        dispatchConnectError(e?.message ?? String(e));
        await tearDownActiveConference('error');
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
        void tearDownActiveConference('livekit');
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

    lk.connect(url, token).catch((err: Error) => {
        // eslint-disable-next-line no-console
        console.warn('[opentalk] LiveKit connect failed:', err.message);
        store.dispatch(setLivekitConnected(false));
        activeLiveKit = null;
    });
}

export async function leaveActiveConference(): Promise<void> {
    await tearDownActiveConference('leave');
}

// endActiveMeeting terminates the meeting for everyone. Sends a server-side
// POST so the custom-post is marked ENDED and other participants receive the
// meeting_ended WS event.
export async function endActiveMeeting(): Promise<void> {
    if (!activeStore) {
        await leaveActiveConference();
        return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channelID: string | undefined = activeStore.getState()?.[PLUGIN_STATE_KEY]?.session?.channelID;

    // Kick all participants on the OpenTalk side before we leave. Best-effort:
    // failure must not block teardown.
    activeClient?.sendDebrief();

    await leaveActiveConference();
    if (!channelID) {
        return;
    }
    try {
        await fetch('/plugins/com.github.morzan1001.mattermost-plugin-opentalk/api/v1/meetings/end', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            },
            credentials: 'include',
            body: JSON.stringify({channel_id: channelID}),
        });
    } catch (err) {
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
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                trackRegistry.register(trackId, lk.camTrack as any);
                activeStore.dispatch(trackSubscribed({participantId: localId, kind: 'video', trackId}));
            }
            activeStore.dispatch(setCamEnabled(true));
        }
    })().finally(() => {
        camToggleInFlight = null;
    });
    return camToggleInFlight;
}

// applyMicDeviceChange / applyCamDeviceChange — re-publish the active track
// against the newly-selected device. Called by the settings panel after
// writing the preference to localStorage. No-op if not in a live call or if
// the device isn't currently active.
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            trackRegistry.register(newTrackId, lk.camTrack as any);
            activeStore.dispatch(trackSubscribed({participantId: localId, kind: 'video', trackId: newTrackId}));
        }
    } catch (err) {
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
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                trackRegistry.register(trackId, screenTrack as any);
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

// Test-only helper: reset module state.
// eslint-disable-next-line no-underscore-dangle, @typescript-eslint/naming-convention
export function _reset(): void {
    activeClient = null;
    activeLiveKit = null;
    activeStore = null;
    stopHeartbeat();
}

// Returns a JSON string (not a live object) so devtools doesn't truncate arrays.
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
