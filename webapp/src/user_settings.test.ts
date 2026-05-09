import {OpenTalkSettingsSection} from './components/user_settings_section/component';
import {registerOpenTalkUserSettings} from './user_settings';

jest.mock('./conference/livekit/devices', () => ({
    initDeviceCache: jest.fn(),
}));

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
