import React from 'react';
import {Store, Action} from 'redux';
import {GlobalState} from '@mattermost/types/store';
import {PluginRegistry} from './types/mattermost-webapp';
import reducer from './store/reducer';
import {setConnected} from './store/slice_oauth';
import {id as pluginId} from './manifest';
import PostTypeMeeting from './components/post_type_meeting/component';
import MeetingMiniBar from './components/meeting_mini_bar/component';
import AudioRenderer from './components/audio_renderer/component';
import ExpandedView from './components/expanded_view/component';
import ChannelCallToast from './components/channel_call_toast/component';
import IncomingCallModal from './components/incoming_call_modal/component';
import SwitchCallModal from './components/switch_call_modal/component';
import ScreenPickerModal from './components/screen_picker_modal/component';
import {incomingCallReceived, incomingCallCleared, incomingCallsReset} from './store/slice_incoming_calls';
import {activeMeetingStarted, activeMeetingEnded} from './store/slice_active_meetings';
import {registerOpenTalkUserSettings} from './user_settings';
import {initDeviceCache} from './conference/livekit/devices';
import OpenTalkIcon from './components/channel_header_button/icon';
import {startMeetingAction} from './components/channel_header_button/action';
import {getConnectionStatus} from './client/rest';
import {
    setActiveStore,
    toggleMic,
    toggleCam,
    toggleScreenShare,
    leaveActiveConference,
    endActiveMeeting,
    debugState,
} from './conference/controller';

interface ConnectedStateMessage {
    data: {
        mm_user_id: string;
        connected: boolean;
        email?: string;
    };
}

interface MeetingEndedMessage {
    data: {
        channel_id: string;
        room_id: string;
    };
}

interface IncomingCallMessage {
    data: {
        channel_id: string;
        room_id: string;
        host_user_id: string;
        host_name: string;
        post_id?: string;
        dm_user_ids?: string[];
        created_at_unix_ms?: number;
    };
}

interface MeetingStartedMessage {
    data: {
        channel_id: string;
        room_id: string;
        host_user_id: string;
        host_name: string;
        post_id?: string;
        created_at_unix_ms?: number;
    };
}

const ringtoneSettingKey = 'opentalk:ringtone-enabled';

// Stale threshold: ignore incoming-call broadcasts older than this. Matches
// the modal's auto-decline timer, so anything we'd have auto-dismissed by
// now is also too old to ring for.
const incomingCallFreshnessMs = 30000;

// Default ON (calls + slack convention). The earlier "perpetual ring on
// activate" loop was traced to the IncomingCallModal mounting unconditionally
// as a RootComponent and starting the ringtone in an empty-deps useEffect
// before the call/idle gate ever ran. That's now fixed by gating the
// effect on isShowingCall — see meeting_mini_bar/incoming_call_modal.
// User can still opt out via Settings-modal, /opentalk ring off, or
// window.opentalk.ringtone(false).
function ringtoneEnabled(): boolean {
    if (typeof window === 'undefined') {
        return true;
    }
    try {
        const v = window.localStorage.getItem(ringtoneSettingKey);
        return v !== 'false';
    } catch {
        return true;
    }
}

interface IncomingCallDismissedMessage {
    data: {
        channel_id: string;
        room_id: string;
        mm_user_id: string;
    };
}

interface RingSettingChangedMessage {
    data: {
        mm_user_id: string;
        enabled: boolean;
    };
}

export default class Plugin {
    public async initialize(registry: PluginRegistry, store: Store<GlobalState, Action>): Promise<void> {
        // Pin the redux store on the controller so toggle handlers (mic/cam/
        // screen) can dispatch from RootComponents where useStore() returns
        // null in some Mattermost-Webapp versions.
        setActiveStore(store);

        // Seed the device cache so Settings panel options and publishMic/
        // publishCam deviceId fallbacks are ready before the first meeting.
        initDeviceCache();

        // Browser-devtools handle for ad-hoc inspection of conference state:
        //   window.opentalk.state()      → { hasClient, hasLiveKit, ... }
        //   await window.opentalk.toggleMic()
        // Kept in production builds — it's read-only-ish and the bundle
        // already exposes the same APIs to the React tree.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).opentalk = {
            state: debugState,
            toggleMic,
            toggleCam,
            toggleScreenShare,
            leave: leaveActiveConference,
            end: endActiveMeeting,

            // User-facing toggle for the incoming-call ringtone. Persists
            // in localStorage. Call window.opentalk.ringtone(false) to
            // suppress all incoming-call modals; window.opentalk.ringtone(true)
            // to re-enable. Returns the new state.
            ringtone: (enabled: boolean): boolean => {
                try {
                    window.localStorage.setItem(ringtoneSettingKey, enabled ? 'true' : 'false');
                } catch {
                    /* swallow — quota or private mode */
                }
                return enabled;
            },
            ringtoneStatus: (): boolean => ringtoneEnabled(),

            // Emergency stop. If a ring loop occurs and the user can't
            // dismiss it via UI, calling this from the devtools console
            // (window.opentalk.killRing()) wipes the incoming-calls slice
            // (which unmounts the modal) AND switches the ringtone setting
            // to OFF so the next incoming_call event is dropped before it
            // can re-trigger ringing.
            killRing: (): void => {
                store.dispatch(incomingCallsReset());
                try {
                    window.localStorage.setItem(ringtoneSettingKey, 'false');
                } catch {
                    /* swallow */
                }
                // eslint-disable-next-line no-console
                console.warn('[opentalk] killRing: incoming-calls slice cleared, ringtone disabled');
            },
        };

        registry.registerReducer?.(reducer);
        registry.registerWebSocketEventHandler?.(
            `custom_${pluginId}_user_connected_state`,
            (msg: ConnectedStateMessage) => {
                store.dispatch(setConnected(msg.data.connected === true, msg.data.email));
            },
        );

        // When the host ends the meeting "for everyone", the server
        // broadcasts custom_<plugin>_meeting_ended to all members of
        // the channel. Each remote client that is currently in the
        // affected meeting tears down its conference + LiveKit so the
        // user is dropped out of the room. Without this handler the
        // host would leave but other participants would stay connected.
        registry.registerWebSocketEventHandler?.(
            `custom_${pluginId}_meeting_ended`,
            (msg: MeetingEndedMessage) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const session: any = (store.getState() as any)?.['plugins-de.opentalk.mattermost-plugin']?.session;
                if (session?.status !== 'idle' && session?.channelID === msg.data.channel_id) {
                    leaveActiveConference();
                }

                // Always clear any pending incoming-call modal for this channel
                store.dispatch(incomingCallCleared({channelID: msg.data.channel_id}));

                // Clear the active-meetings slice entry for this channel
                store.dispatch(activeMeetingEnded({channelID: msg.data.channel_id}));
            },
        );
        registry.registerWebSocketEventHandler?.(
            `custom_${pluginId}_meeting_started`,
            (msg: MeetingStartedMessage) => {
                store.dispatch(activeMeetingStarted({
                    channelID: msg.data.channel_id,
                    roomID: msg.data.room_id,
                    hostUserID: msg.data.host_user_id,
                    hostName: msg.data.host_name,
                    postID: msg.data.post_id,
                    receivedAt: Date.now(),
                }));
            },
        );
        registry.registerWebSocketEventHandler?.(
            `custom_${pluginId}_incoming_call`,
            (msg: IncomingCallMessage) => {
                const now = Date.now();
                const createdAt = msg.data.created_at_unix_ms;
                const ageMs = typeof createdAt === 'number' ? now - createdAt : -1;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const myId: string | undefined = (store.getState() as any)?.entities?.users?.currentUserId;

                // Verbose-log every incoming_call event so we can
                // diagnose the "rings on plugin activate" loop.
                // eslint-disable-next-line no-console
                console.warn('[opentalk] incoming_call received', {
                    now,
                    createdAt,
                    ageMs,
                    ringtoneEnabled: ringtoneEnabled(),
                    isHost: myId === msg.data.host_user_id,
                    channel_id: msg.data.channel_id,
                    room_id: msg.data.room_id,
                    host_user_id: msg.data.host_user_id,
                });

                if (!ringtoneEnabled()) {
                    // eslint-disable-next-line no-console
                    console.warn('[opentalk] incoming_call: dropped — ringtone disabled by user');
                    return;
                }
                if (myId && msg.data.host_user_id === myId) {
                    // eslint-disable-next-line no-console
                    console.warn('[opentalk] incoming_call: dropped — i am the host');
                    return;
                }
                if (typeof createdAt !== 'number' || ageMs > incomingCallFreshnessMs) {
                    // eslint-disable-next-line no-console
                    console.warn('[opentalk] incoming_call: dropped — stale or no timestamp', {ageMs, threshold: incomingCallFreshnessMs});
                    return;
                }

                // eslint-disable-next-line no-console
                console.warn('[opentalk] incoming_call: ACCEPTED — dispatching to slice');
                store.dispatch(incomingCallReceived({
                    channelID: msg.data.channel_id,
                    roomID: msg.data.room_id,
                    hostUserID: msg.data.host_user_id,
                    hostName: msg.data.host_name,
                    receivedAt: Date.now(),
                }));
            },
        );
        // Slash-command fallback for users on MM versions where the
        // OpenTalk Settings section isn't visible. /opentalk ring on|off
        // server-side broadcasts ring_setting_changed targeted at the
        // requesting user; webapp persists it to localStorage.
        registry.registerWebSocketEventHandler?.(
            `custom_${pluginId}_ring_setting_changed`,
            (msg: RingSettingChangedMessage) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const myId = (store.getState() as any)?.entities?.users?.currentUserId;
                if (msg.data.mm_user_id !== myId) {
                    return;
                }
                try {
                    window.localStorage.setItem(ringtoneSettingKey, msg.data.enabled ? 'true' : 'false');
                } catch {
                    /* swallow */
                }
            },
        );

        registry.registerWebSocketEventHandler?.(
            `custom_${pluginId}_incoming_call_dismissed`,
            (msg: IncomingCallDismissedMessage) => {
                // Only act if the dismissal was for THIS user (other tabs of same user)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const myId = (store.getState() as any)?.entities?.users?.currentUserId;
                if (msg.data.mm_user_id === myId) {
                    store.dispatch(incomingCallCleared({channelID: msg.data.channel_id}));
                }
            },
        );
        registerOpenTalkUserSettings(registry);

        registry.registerPostTypeComponent?.('custom_opentalk_meeting', PostTypeMeeting);
        registry.registerRootComponent?.(MeetingMiniBar);
        registry.registerRootComponent?.(AudioRenderer);
        registry.registerRootComponent?.(ExpandedView);
        registry.registerRootComponent?.(IncomingCallModal);
        registry.registerRootComponent?.(SwitchCallModal);
        registry.registerRootComponent?.(ChannelCallToast);
        registry.registerRootComponent?.(ScreenPickerModal);

        // VideoGrid (the bottom-right floating tiles from Phase 6) is no
        // longer registered: in Phase 7a the floating-widget's TileStrip
        // already shows participant videos, and Phase 7b's Expanded-View
        // will own the fullscreen grid surface.

        const headerIcon = React.createElement(OpenTalkIcon);
        registry.registerChannelHeaderButtonAction?.(
            headerIcon,
            startMeetingAction(store),
            'OpenTalk',
            'OpenTalk-Meeting starten',
        );

        // Seed the OAuth state from the server so the header button works
        // immediately after a page refresh – the WS-broadcast pattern only
        // delivers state changes, not the current snapshot.
        try {
            const me = await getConnectionStatus();
            store.dispatch(setConnected(me.connected, me.email));
        } catch {
            // ignore: the channel header button will fall back to its
            // "please connect first" alert.
        }
    }

    public uninitialize(): void {
        // no-op
    }
}
