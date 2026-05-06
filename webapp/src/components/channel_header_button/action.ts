import {Store, Action} from 'redux';
import {GlobalState} from '@mattermost/types/store';
import {createMeeting, getOrCreateDeviceSecret} from '../../client/rest';

interface PluginState {
    oauth?: {connected: boolean};
}

export function startMeetingAction(store: Store<GlobalState, Action>) {
    return async (channel: {id: string}) => {
        const state = store.getState() as any;
        const ps: PluginState = state['plugins-de.opentalk.mattermost-plugin'] || {};
        if (!ps.oauth?.connected) {
            // eslint-disable-next-line no-alert
            alert('Bitte zuerst /opentalk connect ausführen.');
            return;
        }
        try {
            await createMeeting(channel.id, getOrCreateDeviceSecret());

            // Success: the bot-post arrives via the channel WebSocket from
            // Mattermost; nothing else to do here.
        } catch (e: any) {
            // eslint-disable-next-line no-alert
            alert(`Meeting konnte nicht erstellt werden: ${e.message}`);
        }
    };
}
