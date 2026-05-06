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
import VideoGrid from './components/video_grid/component';
import OpenTalkIcon from './components/channel_header_button/icon';
import {startMeetingAction} from './components/channel_header_button/action';
import {getConnectionStatus} from './client/rest';

interface ConnectedStateMessage {
    data: {
        mm_user_id: string;
        connected: boolean;
        email?: string;
    };
}

export default class Plugin {
    public async initialize(registry: PluginRegistry, store: Store<GlobalState, Action>): Promise<void> {
        registry.registerReducer?.(reducer);
        registry.registerWebSocketEventHandler?.(
            `custom_${pluginId}_user_connected_state`,
            (msg: ConnectedStateMessage) => {
                store.dispatch(setConnected(msg.data.connected === true, msg.data.email));
            },
        );
        registry.registerPostTypeComponent?.('custom_opentalk_meeting', PostTypeMeeting);
        registry.registerRootComponent?.(MeetingMiniBar);
        registry.registerRootComponent?.(AudioRenderer);
        registry.registerRootComponent?.(VideoGrid);

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
