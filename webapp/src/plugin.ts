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
import IncomingCallModal from './components/incoming_call_modal/component';
import {incomingCallReceived, incomingCallCleared} from './store/slice_incoming_calls';
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
    };
}

interface IncomingCallDismissedMessage {
    data: {
        channel_id: string;
        room_id: string;
        mm_user_id: string;
    };
}

export default class Plugin {
    public async initialize(registry: PluginRegistry, store: Store<GlobalState, Action>): Promise<void> {
        // Pin the redux store on the controller so toggle handlers (mic/cam/
        // screen) can dispatch from RootComponents where useStore() returns
        // null in some Mattermost-Webapp versions.
        setActiveStore(store);

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
            },
        );
        registry.registerWebSocketEventHandler?.(
            `custom_${pluginId}_incoming_call`,
            (msg: IncomingCallMessage) => {
                store.dispatch(incomingCallReceived({
                    channelID: msg.data.channel_id,
                    roomID: msg.data.room_id,
                    hostUserID: msg.data.host_user_id,
                    hostName: msg.data.host_name,
                    receivedAt: Date.now(),
                }));
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
        registry.registerPostTypeComponent?.('custom_opentalk_meeting', PostTypeMeeting);
        registry.registerRootComponent?.(MeetingMiniBar);
        registry.registerRootComponent?.(AudioRenderer);
        registry.registerRootComponent?.(ExpandedView);
        registry.registerRootComponent?.(IncomingCallModal);

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
