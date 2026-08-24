jest.mock('./client/rest', () => ({
    getConnectionStatus: jest.fn(),
    setRingtonePref: jest.fn(() => Promise.resolve()),
}));
jest.mock('./components/user_settings_section/component', () => ({
    OpenTalkSettingsSection: () => null,
}));
jest.mock('./conference/livekit/devices', () => ({
    initDeviceCache: jest.fn(),
}));

import {setRingtonePref} from './client/rest';
import {OpenTalkSettingsSection} from './components/user_settings_section/component';
import {
    readRingtone,
    writeRingtone,
    applyRingtoneLocal,
    ringtoneSettingKey,
    registerOpenTalkUserSettings,
} from './user_settings';

const legacyKey = 'opentalk:ringtone-enabled';

describe('registerOpenTalkUserSettings', () => {
    it('calls registerUserSettings once with the plugin id and a custom component section', () => {
        const registerUserSettings = jest.fn();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const registry = {registerUserSettings} as any;

        registerOpenTalkUserSettings(registry);

        expect(registerUserSettings).toHaveBeenCalledTimes(1);
        const arg = registerUserSettings.mock.calls[0][0];
        expect(arg.id).toBe('com.github.morzan1001.mattermost-plugin-opentalk');
        expect(arg.sections).toHaveLength(1);
        expect(arg.sections[0].component).toBe(OpenTalkSettingsSection);
        expect(arg.sections[0].settings).toBeUndefined();
    });

    it('is a no-op when registerUserSettings is absent', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(() => registerOpenTalkUserSettings({} as any)).not.toThrow();
    });
});

describe('ringtone setting helpers', () => {
    let events: Array<CustomEvent<boolean>>;
    const recordEvent = (e: Event) => {
        events.push(e as CustomEvent<boolean>);
    };
    beforeEach(() => {
        window.localStorage.clear();
        events = [];
        window.addEventListener('opentalk:ringtone-changed', recordEvent);
    });

    afterEach(() => {
        window.removeEventListener('opentalk:ringtone-changed', recordEvent);
        window.localStorage.clear();
    });

    describe('writeRingtone', () => {
        it('persists, dispatches the custom event, and POSTs the preference', () => {
            writeRingtone(false);

            expect(window.localStorage.getItem(ringtoneSettingKey)).toBe('false');
            expect(events).toHaveLength(1);
            expect(events[0].detail).toBe(false);
            expect(setRingtonePref).toHaveBeenCalledTimes(1);
            expect(setRingtonePref).toHaveBeenCalledWith(false);
        });

        it('round-trips true', () => {
            writeRingtone(true);

            expect(window.localStorage.getItem(ringtoneSettingKey)).toBe('true');
            expect(events[0].detail).toBe(true);
            expect(setRingtonePref).toHaveBeenCalledWith(true);
        });

        it('still dispatches and posts when localStorage is unavailable', () => {
            const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
                throw new Error('quota');
            });
            try {
                writeRingtone(true);

                expect(events).toHaveLength(1);
                expect(setRingtonePref).toHaveBeenCalledTimes(1);
            } finally {
                spy.mockRestore();
            }
        });
    });

    describe('applyRingtoneLocal', () => {
        it('persists and dispatches without echoing back to the server', () => {
            applyRingtoneLocal(false);

            expect(window.localStorage.getItem(ringtoneSettingKey)).toBe('false');
            expect(events).toHaveLength(1);
            expect(events[0].detail).toBe(false);
            expect(setRingtonePref).not.toHaveBeenCalled();
        });
    });

    describe('readRingtone', () => {
        it('defaults to enabled when nothing is stored', () => {
            expect(readRingtone()).toBe(true);
        });

        it('reads the v1 key', () => {
            window.localStorage.setItem(ringtoneSettingKey, 'false');
            expect(readRingtone()).toBe(false);
        });

        it('migrates a legacy value into the v1 key and removes the legacy key', () => {
            window.localStorage.setItem(legacyKey, 'false');

            expect(readRingtone()).toBe(false);
            expect(window.localStorage.getItem(ringtoneSettingKey)).toBe('false');
            expect(window.localStorage.getItem(legacyKey)).toBeNull();
        });

        it('migrates a legacy true value', () => {
            window.localStorage.setItem(legacyKey, 'true');

            expect(readRingtone()).toBe(true);
            expect(window.localStorage.getItem(legacyKey)).toBeNull();
        });

        it('keeps an existing v1 value over a stale legacy one', () => {
            window.localStorage.setItem(ringtoneSettingKey, 'true');
            window.localStorage.setItem(legacyKey, 'false');

            expect(readRingtone()).toBe(true);
            expect(window.localStorage.getItem(ringtoneSettingKey)).toBe('true');
        });
    });
});
