import type {Store, Action} from 'redux';

import {OpenTalkConferenceClient} from './client';
import {LiveKitRoom} from './livekit/room';
import * as trackRegistry from './livekit/track_registry';

import {getOrCreateDeviceSecret} from '../client/rest';
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
        store.dispatch(connected({participantCount: data.participants.length, isHost}));

        // Some upstream OpenTalk builds inline livekit-bootstrap into joinSuccess.
        // Most current ones don't — they send a separate `livekit:credentials`
        // frame which we handle below. Keeping this fallback is harmless.
        if (data.livekit?.url && data.livekit?.token) {
            bringUpLiveKit(data.livekit.url, data.livekit.token, store);
        }
    });
    client.on('livekit_credentials', ({url, token}) => {
        // eslint-disable-next-line no-console
        console.warn('[opentalk] livekit_credentials received, url=', url, 'token-len=', token.length);
        if (activeLiveKit) {
            // Already brought up (e.g. via the joinSuccess fallback above) —
            // a re-credentialing roundtrip would tear down active publications.
            return;
        }
        bringUpLiveKit(url, token, store);
    });
    client.on('participant_joined', () => {
        store.dispatch(participantsChanged({participantCount: client.getParticipants().length}));
    });
    client.on('participant_left', () => {
        store.dispatch(participantsChanged({participantCount: client.getParticipants().length}));
    });
    client.on('closed', () => {
        store.dispatch(disconnected());
        activeClient = null;
    });
    client.on('error', (err) => {
        store.dispatch(connectError({error: err.message}));
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
    // eslint-disable-next-line no-console
    console.warn('[opentalk] bringUpLiveKit url=', url, 'token-len=', token.length);
    const lk = new LiveKitRoom();
    activeLiveKit = lk;

    lk.on('connected', () => {
        // eslint-disable-next-line no-console
        console.warn('[opentalk] LiveKit room connected');
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lk.on('track_subscribed', (sub: any) => {
        const trackId: string = sub.publication?.trackSid ?? sub.track?.sid;
        if (!trackId) {
            return;
        }
        trackRegistry.register(trackId, sub.track);
        const kind: TrackKind = sub.track.kind === 'audio' ? 'audio' : 'video';
        store.dispatch(trackSubscribed({
            participantId: sub.participant.identity,
            kind,
            trackId,
        }));
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lk.on('track_unsubscribed', (sub: any) => {
        const trackId: string = sub.publication?.trackSid ?? sub.track?.sid;
        if (trackId) {
            trackRegistry.unregister(trackId);
        }
        const kind: TrackKind = sub.track.kind === 'audio' ? 'audio' : 'video';
        store.dispatch(trackUnsubscribed({
            participantId: sub.participant.identity,
            kind,
        }));
    });

    lk.on('active_speakers_changed', (speakers: unknown) => {
        store.dispatch(activeSpeakersChanged({speakers: speakers as string[]}));
    });

    lk.connect(url, token).
        then(() => {
            // eslint-disable-next-line no-console
            console.warn('[opentalk] LiveKit connect resolved');
        }).
        catch((err: Error) => {
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
    // eslint-disable-next-line no-console
    console.warn('[opentalk] toggleMic called, activeLiveKit=', Boolean(activeLiveKit), 'activeStore=', Boolean(activeStore));
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

export async function toggleCam(): Promise<void> {
    // eslint-disable-next-line no-console
    console.warn('[opentalk] toggleCam called, activeLiveKit=', Boolean(activeLiveKit), 'activeStore=', Boolean(activeStore));
    if (!activeLiveKit || !activeStore) {
        return;
    }
    if (activeLiveKit.isCamEnabled()) {
        await activeLiveKit.disableCam();
        activeStore.dispatch(setCamEnabled(false));
    } else {
        await activeLiveKit.enableCam();
        activeStore.dispatch(setCamEnabled(true));
    }
}

export async function toggleScreenShare(): Promise<void> {
    // eslint-disable-next-line no-console
    console.warn('[opentalk] toggleScreenShare called, activeLiveKit=', Boolean(activeLiveKit), 'activeStore=', Boolean(activeStore));
    if (!activeLiveKit || !activeStore) {
        return;
    }
    if (activeLiveKit.isScreenShareEnabled()) {
        await activeLiveKit.disableScreenShare();
        activeStore.dispatch(setScreenShareEnabled(false));
    } else {
        try {
            await activeLiveKit.enableScreenShare();
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
// module-level singletons so the user can inspect them from the devtools
// console (window.opentalk.state()) without relying on console.log filters.
export function debugState(): {
    hasClient: boolean;
    hasLiveKit: boolean;
    hasStore: boolean;
    micEnabled: boolean | null;
    camEnabled: boolean | null;
    screenShareEnabled: boolean | null;
} {
    return {
        hasClient: activeClient !== null,
        hasLiveKit: activeLiveKit !== null,
        hasStore: activeStore !== null,
        micEnabled: activeLiveKit ? activeLiveKit.isMicEnabled() : null,
        camEnabled: activeLiveKit ? activeLiveKit.isCamEnabled() : null,
        screenShareEnabled: activeLiveKit ? activeLiveKit.isScreenShareEnabled() : null,
    };
}
