import React from 'react';
import type {Store, Action} from 'redux';

import type {GlobalState} from '@mattermost/types/store';

import {getConnectionStatus} from './client/rest';
import AudioRenderer from './components/audio_renderer/component';
import ChannelCallToast from './components/channel_call_toast/component';
import {startMeetingAction} from './components/channel_header_button/action';
import OpenTalkIcon from './components/channel_header_button/icon';
import ExpandedView from './components/expanded_view/component';
import IncomingCallModal from './components/incoming_call_modal/component';
import MeetingMiniBar from './components/meeting_mini_bar/component';
import NoticeBanner from './components/notice_banner/component';
import PostTypeMeeting from './components/post_type_meeting/component';
import ReconnectingBanner from './components/reconnecting_banner/component';
import ScreenPickerModal from './components/screen_picker_modal/component';
import SwitchCallModal from './components/switch_call_modal/component';
import {
    setActiveStore,
    toggleMic,
    toggleCam,
    toggleScreenShare,
    leaveActiveConference,
    endActiveMeeting,
    debugState,
} from './conference/controller';
import {disposeDeviceCache, initDeviceCache} from './conference/livekit/devices';
import manifest from './manifest';
import reducer from './store/reducer';
import {activeMeetingStarted, activeMeetingEnded} from './store/slice_active_meetings';
import {incomingCallReceived, incomingCallCleared, incomingCallsReset} from './store/slice_incoming_calls';
import {setConnected} from './store/slice_oauth';
import type {PluginRegistry} from './types/mattermost-webapp';
import {registerOpenTalkUserSettings, readRingtone, writeRingtone, applyRingtoneLocal} from './user_settings';
import {setModuleLocale, t} from './util/i18n';
import {selectCurrentUserId, selectCurrentUserLocale, selectSession} from './util/selectors';

declare global {
    interface Window {
        opentalk?: {
            state: typeof debugState;
            toggleMic: typeof toggleMic;
            toggleCam: typeof toggleCam;
            toggleScreenShare: typeof toggleScreenShare;
            leave: typeof leaveActiveConference;
            end: typeof endActiveMeeting;
            ringtone: (enabled: boolean) => boolean;
            ringtoneStatus: () => boolean;
            killRing: () => void;
        };
    }
}

const pluginId: string = manifest.id;

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
    };
}

interface MeetingStartedMessage {
    data: {
        channel_id: string;
        room_id: string;
        host_user_id: string;
        host_name: string;
        post_id?: string;
    };
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

// Only the copy addressed to the removed user (broadcast.user_id) carries data.channel_id.
interface UserRemovedMessage {
    data: {
        channel_id?: string;
    };
    broadcast: {
        user_id: string;
    };
}

export default class Plugin {
    public initialize(registry: PluginRegistry, store: Store<GlobalState, Action>): void {
        setActiveStore(store);

        // Initial seed; the hook-based useT() picks up live changes.
        setModuleLocale(selectCurrentUserLocale(store.getState()));

        initDeviceCache();

        // Browser-devtools handle: window.opentalk.state() / toggleMic() etc.
        window.opentalk = {
            state: debugState,
            toggleMic,
            toggleCam,
            toggleScreenShare,
            leave: leaveActiveConference,
            end: endActiveMeeting,

            ringtone: (enabled: boolean): boolean => {
                writeRingtone(enabled);
                return enabled;
            },
            ringtoneStatus: (): boolean => readRingtone(),

            // Emergency stop: wipes the incoming-calls slice and disables
            // the ringtone so any immediately-following event doesn't re-ring.
            killRing: (): void => {
                store.dispatch(incomingCallsReset());
                writeRingtone(false);
                // eslint-disable-next-line no-console
                console.warn('[opentalk] killRing: incoming-calls slice cleared, ringtone disabled');
            },
        };

        registry.registerReducer(reducer);
        registry.registerWebSocketEventHandler(
            `custom_${pluginId}_user_connected_state`,
            (msg: ConnectedStateMessage) => {
                store.dispatch(setConnected(msg.data.connected === true, msg.data.email));
            },
        );

        registry.registerWebSocketEventHandler(
            `custom_${pluginId}_meeting_ended`,
            (msg: MeetingEndedMessage) => {
                const session = selectSession(store.getState());
                if (session.status !== 'idle' && session.channelID === msg.data.channel_id) {
                    leaveActiveConference();
                }
                store.dispatch(incomingCallCleared({channelID: msg.data.channel_id}));
                store.dispatch(activeMeetingEnded({channelID: msg.data.channel_id}));
            },
        );
        registry.registerWebSocketEventHandler(
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
        registry.registerWebSocketEventHandler(
            `custom_${pluginId}_incoming_call`,
            (msg: IncomingCallMessage) => {
                const myId = selectCurrentUserId(store.getState());

                const ownCall = Boolean(myId && msg.data.host_user_id === myId);

                // Re-ring for the channel this session is already connected to:
                // the SwitchCallModal would surface and its Cancel would flip
                // the live meeting to MISSED. Never ring for your own live call.
                const ownSession = selectSession(store.getState());
                const alreadyHere = ownSession.status !== 'idle' && ownSession.channelID === msg.data.channel_id;

                // Verbose-level only; visible when devtools is set to Verbose.
                // eslint-disable-next-line no-console
                console.debug('[opentalk] incoming_call received', {
                    channel_id: msg.data.channel_id,
                    host_user_id: msg.data.host_user_id,
                    my_id: myId,
                    own_call: ownCall,
                    already_here: alreadyHere,
                    will_dispatch: !ownCall && !alreadyHere,
                });

                if (ownCall || alreadyHere) {
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

        // Server-side ringtone changes (/opentalk ring on|off, other tabs)
        // arrive here as authoritative echoes; applying them locally must not
        // POST again or the broadcast would loop forever.
        registry.registerWebSocketEventHandler(
            `custom_${pluginId}_ring_setting_changed`,
            (msg: RingSettingChangedMessage) => {
                if (msg.data.mm_user_id !== selectCurrentUserId(store.getState())) {
                    return;
                }
                applyRingtoneLocal(msg.data.enabled);
            },
        );

        // Sync dismissals across tabs of the same user.
        registry.registerWebSocketEventHandler(
            `custom_${pluginId}_incoming_call_dismissed`,
            (msg: IncomingCallDismissedMessage) => {
                if (msg.data.mm_user_id === selectCurrentUserId(store.getState())) {
                    store.dispatch(incomingCallCleared({channelID: msg.data.channel_id}));
                }
            },
        );
        registerOpenTalkUserSettings(registry);

        // A user removed from the meeting's channel must not stay in a ghost session.
        registry.registerWebSocketEventHandler(
            'user_removed',
            (msg: UserRemovedMessage) => {
                const state = store.getState();
                const session = selectSession(state);
                if (msg.broadcast.user_id === selectCurrentUserId(state) && session.status !== 'idle' && session.channelID === msg.data.channel_id) {
                    leaveActiveConference();
                }
            },
        );

        registry.registerPostTypeComponent('custom_opentalk_meeting', PostTypeMeeting);
        registry.registerRootComponent(MeetingMiniBar);
        registry.registerRootComponent(AudioRenderer);
        registry.registerRootComponent(ExpandedView);
        registry.registerRootComponent(IncomingCallModal);
        registry.registerRootComponent(SwitchCallModal);
        registry.registerRootComponent(ChannelCallToast);
        registry.registerRootComponent(ReconnectingBanner);
        registry.registerRootComponent(ScreenPickerModal);
        registry.registerRootComponent(NoticeBanner);

        const headerIcon = React.createElement(OpenTalkIcon);
        registry.registerChannelHeaderButtonAction(
            headerIcon,
            startMeetingAction(store),
            'OpenTalk',
            t({de: 'OpenTalk-Meeting starten', en: 'Start OpenTalk meeting'}),
        );

        // Re-seed the connection snapshot after a websocket reconnect: the
        // custom WS events deliver deltas, not snapshots, so a network blip or
        // laptop-sleep would otherwise leave a stale connection state.
        const seedConnectionStatus = async () => {
            try {
                const me = await getConnectionStatus();
                store.dispatch(setConnected(me.connected, me.email));

                // Server snapshot is authoritative; apply without POSTing.
                if (me.ringtone_enabled != null) {
                    applyRingtoneLocal(me.ringtone_enabled);
                }
            } catch {
                // Non-fatal: the header button falls back to "please connect first".
            }
        };
        registry.registerReconnectHandler(() => {
            seedConnectionStatus();
        });

        // Seed OAuth state immediately on load — the WS broadcast only delivers
        // state changes, not the current snapshot on page load. Not awaited:
        // Mattermost holds its first render until every plugin's initialize settles.
        seedConnectionStatus();
    }

    // Mattermost unmounts our components on disable, upgrade or failed init, but module state such as a live call survives.
    public uninitialize(): void {
        leaveActiveConference();
        disposeDeviceCache();
        Reflect.deleteProperty(window, 'opentalk');
    }
}
