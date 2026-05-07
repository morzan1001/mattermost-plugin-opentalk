import {
    initDeviceCache,
    getAudioDevices,
    getVideoDevices,
    getPreferredMicId,
    setPreferredMicId,
    getPreferredCamId,
    setPreferredCamId,
    getMuteOnJoin,
    setMuteOnJoin,
} from './conference/livekit/devices';
import type {PluginRegistry} from './types/mattermost-webapp';

const ringtoneSettingKey = 'opentalk:ringtone-enabled';

const pluginID = 'com.github.morzan1001.mattermost-plugin-opentalk';

/**
 * Registers an "OpenTalk" section in the Mattermost User-Settings modal
 * (MM v9.5+). On older MM the registry method is undefined — the call is a
 * no-op and window.opentalk.ringtone() still works as a fallback.
 */
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
                title: 'Anrufe',
                settings: [
                    {
                        name: 'ringtoneEnabled',
                        type: 'bool',
                        helpText: 'Spielt einen Klingelton ab und zeigt ein Pop-up, wenn dich jemand in einer Direktnachricht anruft.',
                        default: 'true',
                        currentValue: () => readRingtone(),
                        onConfigChange: (value: unknown) => {
                            persistRingtone(value === 'true' || value === true);
                        },
                    },
                    {
                        name: 'preferredMicId',
                        type: 'radio',
                        helpText: 'Wähle das Mikrofon, das in OpenTalk-Meetings verwendet wird.',
                        default: '',
                        options: getAudioDevices().map((d) => ({value: d.deviceId, text: d.label})),
                        currentValue: () => getPreferredMicId() ?? '',
                        onConfigChange: (value: unknown) => {
                            if (typeof value === 'string') {
                                setPreferredMicId(value);
                            }
                        },
                    },
                    {
                        name: 'preferredCamId',
                        type: 'radio',
                        helpText: 'Wähle die Kamera, die in OpenTalk-Meetings verwendet wird.',
                        default: '',
                        options: getVideoDevices().map((d) => ({value: d.deviceId, text: d.label})),
                        currentValue: () => getPreferredCamId() ?? '',
                        onConfigChange: (value: unknown) => {
                            if (typeof value === 'string') {
                                setPreferredCamId(value);
                            }
                        },
                    },
                    {
                        name: 'muteOnJoin',
                        type: 'bool',
                        helpText: 'Tritt Meetings standardmäßig stummgeschaltet bei. Du kannst das Mikrofon dann manuell aktivieren.',
                        default: 'false',
                        currentValue: () => (getMuteOnJoin() ? 'true' : 'false'),
                        onConfigChange: (value: unknown) => {
                            setMuteOnJoin(value === 'true' || value === true);
                        },
                    },
                ],
            },
        ],

        onSubmit: (values: Record<string, unknown>) => {
            if (Object.prototype.hasOwnProperty.call(values, 'ringtoneEnabled')) {
                const v = values.ringtoneEnabled;
                persistRingtone(v === 'true' || v === true);
            }
            if (Object.prototype.hasOwnProperty.call(values, 'preferredMicId')) {
                const v = values.preferredMicId;
                if (typeof v === 'string') {
                    setPreferredMicId(v);
                }
            }
            if (Object.prototype.hasOwnProperty.call(values, 'preferredCamId')) {
                const v = values.preferredCamId;
                if (typeof v === 'string') {
                    setPreferredCamId(v);
                }
            }
            if (Object.prototype.hasOwnProperty.call(values, 'muteOnJoin')) {
                const v = values.muteOnJoin;
                setMuteOnJoin(v === 'true' || v === true);
            }
        },
    });
}

function readRingtone(): string {
    if (typeof window === 'undefined') {
        return 'true';
    }
    try {
        const v = window.localStorage.getItem(ringtoneSettingKey);
        return v === 'false' ? 'false' : 'true';
    } catch {
        return 'true';
    }
}

function persistRingtone(enabled: boolean): void {
    if (typeof window === 'undefined') {
        return;
    }
    try {
        window.localStorage.setItem(ringtoneSettingKey, enabled ? 'true' : 'false');
    } catch {
        /* swallow — quota or private mode */
    }
}
