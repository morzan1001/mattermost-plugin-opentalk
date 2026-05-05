import {Store, Action} from 'redux';
import {GlobalState} from '@mattermost/types/store';
import {PluginRegistry} from './types/mattermost-webapp';

export default class Plugin {
    public async initialize(registry: PluginRegistry, store: Store<GlobalState, Action>): Promise<void> {
        // Phase 1: stub. Real registrations come in later phases.
        // eslint-disable-next-line no-console
        console.log('[opentalk] plugin initialized');
    }

    public uninitialize(): void {
        // eslint-disable-next-line no-console
        console.log('[opentalk] plugin uninitialized');
    }
}
