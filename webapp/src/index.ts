import Plugin from './plugin';

declare global {
    interface Window {
        registerPlugin(pluginId: string, plugin: Plugin): void;
    }
}

window.registerPlugin('com.github.morzan1001.mattermost-plugin-opentalk', new Plugin());
