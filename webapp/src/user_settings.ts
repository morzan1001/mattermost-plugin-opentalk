import {OpenTalkSettingsSection} from './components/user_settings_section/component';
import {initDeviceCache} from './conference/livekit/devices';
import type {PluginRegistry} from './types/mattermost-webapp';
import {t} from './util/i18n';

const pluginID = 'com.github.morzan1001.mattermost-plugin-opentalk';

export function registerOpenTalkUserSettings(registry: PluginRegistry): void {
    initDeviceCache();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reg: any = registry;
    if (typeof reg.registerUserSettings !== 'function') {
        return;
    }

    reg.registerUserSettings({
        id: pluginID,
        uiName: 'OpenTalk',
        icon: 'icon-phone-outline',
        sections: [
            {
                title: t({de: 'Anrufe', en: 'Calls'}),
                component: OpenTalkSettingsSection,
            },
        ],
    });
}
