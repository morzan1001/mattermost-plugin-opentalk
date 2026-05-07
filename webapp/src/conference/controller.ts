import type {Store, Action} from 'redux';

import {OpenTalkConferenceClient} from './client';
import {LiveKitRoom} from './livekit/room';
import * as trackRegistry from './livekit/track_registry';
import type {Participant} from './signaling/modules/core';

import {getOrCreateDeviceSecret} from '../client/rest';
import {
    participantAdded,
    participantRemoved,
    participantsBulkSet,
    speakingChanged,
    participantsReset,
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
} from '../store/slice_session';
import {
    trackSubscribed,
    trackUnsubscribed,
    activeSpeakersChanged,
    tracksReset,
    type TrackKind,
} from '../store/slice_tracks';

const ALLOWED_ROLES = new Set<string>(['moderator', 'user', 'guest']);

/** Maps a signaling Participant to the slice's ParticipantInfo shape. */
function toParticipantInfo(p: Participant): ParticipantInfo {
    const role = (p.role && ALLOWED_ROLES.has(p.role)) ? p.role as ParticipantInfo['role'] : undefined;
    return {id: p.id, displayName: p.displayName, role};
}

let activeClient: OpenTalkConferenceClient | null = null;
let activeLiveKit: LiveKitRoom | null = null;

// The Mattermost-Webapp's <Provider> tree does not always reach plugin-
// rendered RootComponents (e.g. our MeetingMiniBar) reliably — useStore()
// can return null in that context, which silently swallows onClick handlers
// that try to dispatch through it. We therefore stash the store at plugin-
// initialize time and let the toggle exports use it directly, no React-
// context indirection.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let activeStore: Store<any, Action> | null = null;

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
    const client = new OpenTalkConferenceClient('');
    activeClient = client;

    client.on('connected', (data) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const isHost = (data as any).isHost === true;

        // Self is always the first entry in data.participants because
        // ConferenceRoom.connect() prepends it from the joinSuccess top-
        // level id. Capture it so the UI can filter self out of the
        // participant strip and render the SelfPreview tile instead.
        const localParticipantId = data.participants[0]?.id;

        store.dispatch(connected({
            participantCount: data.participants.length,
            isHost,
            localParticipantId,
        }));

        // Seed the participants slice with the full list from joinSuccess.
        store.dispatch(participantsBulkSet({
            participants: data.participants.map(toParticipantInfo),
        }));

        // Some upstream OpenTalk builds inline livekit-bootstrap into joinSuccess.
        // Most current ones don't — they send a separate `livekit:credentials`
        // frame which we handle below. Keeping this fallback is harmless.
        if (data.livekit?.url && data.livekit?.token) {
            bringUpLiveKit(data.livekit.url, data.livekit.token, store);
        }
    });
    client.on('livekit_credentials', ({url, token}) => {
        if (activeLiveKit) {
            // Already brought up (e.g. via the joinSuccess fallback above) —
            // a re-credentialing roundtrip would tear down active publications.
            return;
        }
        bringUpLiveKit(url, token, store);
    });
    client.on('participant_joined', (p) => {
        store.dispatch(participantsChanged({participantCount: client.getParticipants().length}));
        store.dispatch(participantAdded({participant: toParticipantInfo(p)}));
    });
    client.on('participant_left', ({id}) => {
        store.dispatch(participantsChanged({participantCount: client.getParticipants().length}));
        store.dispatch(participantRemoved({id}));
    });
    client.on('closed', () => {
        store.dispatch(disconnected());
        store.dispatch(participantsReset());
        activeClient = null;
    });
    client.on('error', (err) => {
        store.dispatch(connectError({error: err.message}));
        store.dispatch(participantsReset());
        activeClient = null;
    });

    store.dispatch(connectStarted({channelID, roomID}));

    try {
        await client.connect(roomID, channelID, displayName, getOrCreateDeviceSecret());

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
        store.dispatch(connectError({error: e?.message ?? String(e)}));
        activeClient = null;
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function bringUpLiveKit(url: string, token: string, store: Store<any, Action>): void {
    const lk = new LiveKitRoom();
    activeLiveKit = lk;

    lk.on('connected', () => {
        store.dispatch(setLivekitConnected(true));

        // Default-on: enable mic. User can toggle off via UI.
        lk.enableMic().
            then(() => {
                store.dispatch(setMicEnabled(true));
            }).
            catch((err: Error) => {
                // Don't crash the session on mic-permission denial; user just stays muted.
                // eslint-disable-next-line no-console
                console.warn('[opentalk] enableMic failed:', err.message);
            });
    });

    lk.on('disconnected', () => {
        store.dispatch(setLivekitConnected(false));
        store.dispatch(setMicEnabled(false));
        store.dispatch(setCamEnabled(false));
        store.dispatch(tracksReset());
        trackRegistry.clear();
    });

    // LiveKit publishes screen-share as kind:'video' with source:'screen_share'.
    // If we lump both into kind:'video', the screen-track overwrites the
    // cam-track in the slice and remote viewers stop seeing the publisher's
    // camera as soon as they start sharing. Differentiate by source.
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
    if (activeLiveKit) {
        const lk = activeLiveKit;
        activeLiveKit = null;
        try {
            await lk.disconnect();
        } catch {
            // Ignore — we're tearing down anyway.
        }
    }
    if (!activeClient) {
        return;
    }
    const c = activeClient;
    activeClient = null;
    await c.leave();
}

// endActiveMeeting tells the plugin server to terminate the meeting for
// every participant. Used by the host's "Meeting beenden"-Button. Same
// teardown as leaveActiveConference plus a server-side POST so the
// custom-post is marked ENDED and other participants get the meeting_ended
// ws-event.
export async function endActiveMeeting(): Promise<void> {
    if (!activeStore) {
        await leaveActiveConference();
        return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channelID: string | undefined = activeStore.getState()?.['plugins-de.opentalk.mattermost-plugin']?.session?.channelID;
    await leaveActiveConference();
    if (!channelID) {
        return;
    }
    try {
        await fetch('/plugins/de.opentalk.mattermost-plugin/api/v1/meetings/end', {
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

export async function toggleMic(): Promise<void> {
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
}

// localTrackId returns a stable id for a published local track so we can
// register it in track_registry and key it into the tracks slice. LiveKit's
// LocalTrack.sid is undefined until the publication round-trips; fall back
// to a deterministic synthesized id keyed on participant + kind.
function localTrackId(lk: LiveKitRoom, kind: 'video' | 'screen'): string {
    return `local:${lk.getLocalIdentity()}:${kind}`;
}

export async function toggleCam(): Promise<void> {
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
}

// inElectron returns true when the webapp is running inside Mattermost's
// Electron desktop client. Electron strips standard navigator.mediaDevices.
// getDisplayMedia for security; native screen-picker integration requires
// the host's IPC bridge (see mattermost-plugin-calls' desktop integration).
// We don't have that wiring yet, so detect and refuse with a friendly message.
function inElectron(): boolean {
    if (typeof navigator === 'undefined') {
        return false;
    }
    const ua = navigator.userAgent || '';
    return ua.indexOf('Electron') !== -1 || ua.indexOf('Mattermost') !== -1;
}

export async function toggleScreenShare(): Promise<void> {
    if (!activeLiveKit || !activeStore) {
        return;
    }
    const lk = activeLiveKit;
    const localId = lk.getLocalIdentity();
    if (!lk.isScreenShareEnabled() && inElectron()) {
        // Phase 9 will add the desktop-bridge integration; until then,
        // tell the user to share via the browser instead of failing silently.
        // eslint-disable-next-line no-alert
        window.alert('Bildschirmfreigabe ist in der Mattermost-Desktop-App noch nicht unterstützt. Bitte verwende dafür Mattermost im Browser.');
        return;
    }
    if (lk.isScreenShareEnabled()) {
        const trackId = localTrackId(lk, 'screen');
        trackRegistry.unregister(trackId);
        activeStore.dispatch(trackUnsubscribed({participantId: localId, kind: 'screen'}));
        await lk.disableScreenShare();
        activeStore.dispatch(setScreenShareEnabled(false));
    } else {
        try {
            await lk.enableScreenShare();
            const screenTrack = lk.getLocalScreenTrack();
            if (screenTrack) {
                const trackId = localTrackId(lk, 'screen');
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                trackRegistry.register(trackId, screenTrack as any);
                activeStore.dispatch(trackSubscribed({participantId: localId, kind: 'screen', trackId}));
            }
            activeStore.dispatch(setScreenShareEnabled(true));
        } catch (err) {
            // User cancelled the screen-picker dialog -> exception. Treat as no-op.
            // eslint-disable-next-line no-console
            console.warn('[opentalk] enableScreenShare failed:', (err as Error).message);
        }
    }
}

// Test-only helper: reset module state.
// eslint-disable-next-line no-underscore-dangle, @typescript-eslint/naming-convention
export function _reset(): void {
    activeClient = null;
    activeLiveKit = null;
    activeStore = null;
}

// Browser-debug introspection: surfaces the truthiness of the controller's
// module-level singletons plus a snapshot of the participants/tracks slices
// so the user can inspect them from the devtools console
// (window.opentalk.state()) without relying on console.log filters.
//
// Returns a **JSON string** rather than a live object so the devtools
// console doesn't truncate large arrays/objects with "(3) […]".
// Call window.opentalk.state() and copy-paste the entire returned string.
export function debugState(): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stateSlice: any = activeStore?.getState()?.['plugins-de.opentalk.mattermost-plugin'] ?? {};
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
