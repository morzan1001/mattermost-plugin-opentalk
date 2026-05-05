import Plugin from './plugin';

declare global {
    interface Window {
        registerPlugin(pluginId: string, plugin: Plugin): void;
    }
}

window.registerPlugin('de.opentalk.mattermost-plugin', new Plugin());
