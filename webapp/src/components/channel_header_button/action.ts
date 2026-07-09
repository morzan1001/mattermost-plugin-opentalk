import type {Store, Action} from 'redux';

import type {GlobalState} from '@mattermost/types/store';

import {createMeeting, getOrCreateDeviceSecret} from '../../client/rest';
import {startConferenceConnection} from '../../conference/controller';
import manifest from '../../manifest';
import {noticeSet} from '../../store/slice_notice';
import {selectCurrentDisplayName} from '../../util/display_name';
import {t} from '../../util/i18n';
import {PLUGIN_STATE_KEY} from '../../util/selectors';

interface PluginState {
    oauth?: {connected: boolean};
}

export function startMeetingAction(store: Store<GlobalState, Action>) {
    return async (channel: {id: string}) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const state = store.getState() as any;
        const ps: PluginState = state[PLUGIN_STATE_KEY] || {};
        if (!ps.oauth?.connected) {
            // Not connected: open the OAuth flow directly instead of telling the
            // user to type a slash command.
            window.open(`/plugins/${manifest.id}/oauth/start`, '_blank', 'noopener');
            store.dispatch(noticeSet({
                kind: 'info',
                message: t({de: 'Verbinde dein OpenTalk-Konto im neuen Tab, dann erneut starten.', en: 'Connect your OpenTalk account in the new tab, then start again.'}),
            }));
            return;
        }
        try {
            await createMeeting(channel.id, getOrCreateDeviceSecret());

            // Success: the bot-post arrives via the channel WebSocket from
            // Mattermost; nothing else to do here.

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
            if (e.status === 409 && e.existing?.room_id) {
                // A meeting is already active in this channel — auto-join it.
                const displayName = selectCurrentDisplayName(store.getState());
                await startConferenceConnection(e.existing.room_id, channel.id, displayName, store);
                return;
            }
            store.dispatch(noticeSet({
                kind: 'error',
                message: `${t({de: 'Meeting konnte nicht erstellt werden', en: 'Failed to create meeting'})}: ${e.message}`,
            }));
        }
    };
}
