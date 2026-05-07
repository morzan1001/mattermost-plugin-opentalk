import {Store, Action} from 'redux';
import {GlobalState} from '@mattermost/types/store';
import {createMeeting, getOrCreateDeviceSecret} from '../../client/rest';
import {startConferenceConnection} from '../../conference/controller';
import {selectCurrentDisplayName} from '../../util/display_name';

interface PluginState {
    oauth?: {connected: boolean};
}

export function startMeetingAction(store: Store<GlobalState, Action>) {
    return async (channel: {id: string}) => {
        const state = store.getState() as any;
        const ps: PluginState = state['plugins-com.github.morzan1001.mattermost-plugin-opentalk'] || {};
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
            if (e.status === 409 && e.existing?.room_id) {
                // A meeting is already active in this channel — auto-join the
                // existing one (same UX as Calls). The post-card's [Beitreten]
                // button does the same thing.
                const displayName = selectCurrentDisplayName(store.getState());
                await startConferenceConnection(e.existing.room_id, channel.id, displayName, store);
                return;
            }
            // eslint-disable-next-line no-alert
            alert(`Meeting konnte nicht erstellt werden: ${e.message}`);
        }
    };
}
