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
import {setModuleLocale} from './util/i18n';

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

// Default ON. User can opt out via the Settings modal, /opentalk ring off,
// or window.opentalk.ringtone(false).
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
        // Pin the redux store so toggle handlers can dispatch without React-
        // context indirection (useStore() returns null in MM RootComponents).
        setActiveStore(store);

        // Initial seed; the hook-based useT() picks up live changes.
        const state = store.getState() as any;
        const myId = state?.entities?.users?.currentUserId;
        setModuleLocale(state?.entities?.users?.profiles?.[myId]?.locale);

        initDeviceCache();

        // Browser-devtools handle: window.opentalk.state() / toggleMic() etc.
        // Kept in production builds — read-only-ish, same APIs as the React tree.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).opentalk = {
            state: debugState,
            toggleMic,
            toggleCam,
            toggleScreenShare,
            leave: leaveActiveConference,
            end: endActiveMeeting,

            // Persists to localStorage. Returns the new state.
            ringtone: (enabled: boolean): boolean => {
                try {
                    window.localStorage.setItem(ringtoneSettingKey, enabled ? 'true' : 'false');
                } catch {
                    /* swallow — quota or private mode */
                }
                return enabled;
            },
            ringtoneStatus: (): boolean => ringtoneEnabled(),

            // Emergency stop: wipes the incoming-calls slice and disables
            // the ringtone so any immediately-following event doesn't re-ring.
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

        registry.registerWebSocketEventHandler?.(
            `custom_${pluginId}_meeting_ended`,
            (msg: MeetingEndedMessage) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const session: any = (store.getState() as any)?.['plugins-com.github.morzan1001.mattermost-plugin-opentalk']?.session;
                if (session?.status !== 'idle' && session?.channelID === msg.data.channel_id) {
                    leaveActiveConference();
                }
                store.dispatch(incomingCallCleared({channelID: msg.data.channel_id}));
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

                if (!ringtoneEnabled()) {
                    return;
                }
                if (myId && msg.data.host_user_id === myId) {
                    return;
                }
                if (typeof createdAt !== 'number' || ageMs > incomingCallFreshnessMs) {
                    return;
                }

                store.dispatch(incomingCallReceived({
                    channelID: msg.data.channel_id,
                    roomID: msg.data.room_id,
                    hostUserID: msg.data.host_user_id,
                    hostName: msg.data.host_name,
                    receivedAt: Date.now(),
                }));
            },
        );

        // Slash-command fallback (/opentalk ring on|off) — persists to localStorage.
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

        // Sync dismissals across tabs of the same user.
        registry.registerWebSocketEventHandler?.(
            `custom_${pluginId}_incoming_call_dismissed`,
            (msg: IncomingCallDismissedMessage) => {
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

        const headerIcon = React.createElement(OpenTalkIcon);
        registry.registerChannelHeaderButtonAction?.(
            headerIcon,
            startMeetingAction(store),
            'OpenTalk',
            'OpenTalk-Meeting starten',
        );

        // Seed OAuth state immediately — the WS broadcast only delivers
        // state changes, not the current snapshot on page load.
        try {
            const me = await getConnectionStatus();
            store.dispatch(setConnected(me.connected, me.email));
        } catch {
            // Non-fatal: the header button falls back to "please connect first".
        }
    }

    public uninitialize(): void {
        // no-op
    }
}
