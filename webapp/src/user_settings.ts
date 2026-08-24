import {setRingtonePref} from './client/rest';
import {OpenTalkSettingsSection} from './components/user_settings_section/component';
import {initDeviceCache} from './conference/livekit/devices';
import type {PluginRegistry} from './types/mattermost-webapp';
import {t} from './util/i18n';

const pluginID = 'com.github.morzan1001.mattermost-plugin-opentalk';

export const ringtoneSettingKey = 'opentalk:ringtone:v1';
const legacyRingtoneSettingKey = 'opentalk:ringtone-enabled';

// Fired on window after any local ringtone write; same-tab listeners sync
// from it (the browser 'storage' event only reaches other tabs).
export const RINGTONE_CHANGED_EVENT = 'opentalk:ringtone-changed';

// Default ON; users opt out via the settings modal, /opentalk ring off,
// or window.opentalk.ringtone(false).
export function readRingtone(): boolean {
    try {
        // One-time live-data migration: adopt the pre-server-backed value
        // into the versioned key, then drop the legacy entry.
        if (window.localStorage.getItem(ringtoneSettingKey) === null) {
            const legacy = window.localStorage.getItem(legacyRingtoneSettingKey);
            if (legacy !== null) {
                window.localStorage.setItem(ringtoneSettingKey, legacy);
                window.localStorage.removeItem(legacyRingtoneSettingKey);
            }
        }
        return window.localStorage.getItem(ringtoneSettingKey) !== 'false';
    } catch {
        return true;
    }
}

// Local-only apply for values the server already owns (seeding, WS echoes);
// never POSTs, so authoritative state cannot bounce back to the server.
export function applyRingtoneLocal(enabled: boolean): void {
    try {
        window.localStorage.setItem(ringtoneSettingKey, enabled ? 'true' : 'false');
    } catch {
        /* swallow — quota or private mode */
    }
    window.dispatchEvent(new CustomEvent(RINGTONE_CHANGED_EVENT, {detail: enabled}));
}

export function writeRingtone(enabled: boolean): void {
    applyRingtoneLocal(enabled);
    setRingtonePref(enabled).catch(() => {
        /* offline or unauthorized; the next server echo, snapshot seed or write replaces the local value */
    });
}

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
