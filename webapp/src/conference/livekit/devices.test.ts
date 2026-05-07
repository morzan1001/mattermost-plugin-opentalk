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
    _resetDeviceCache,
} from './devices';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDevice(kind: 'audioinput' | 'videoinput', deviceId: string, label: string): MediaDeviceInfo {
    return {deviceId, kind, label, groupId: '', toJSON: () => ({})} as MediaDeviceInfo;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
    _resetDeviceCache();
    window.localStorage.clear();

    // Reset mediaDevices mock
    Object.defineProperty(global.navigator, 'mediaDevices', {
        configurable: true,
        writable: true,
        value: {
            enumerateDevices: jest.fn().mockResolvedValue([]),
            addEventListener: jest.fn(),
        },
    });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('device cache — initial state', () => {
    it('returns empty arrays before initDeviceCache is called', () => {
        expect(getAudioDevices()).toEqual([]);
        expect(getVideoDevices()).toEqual([]);
    });
});

/** Flush all pending microtasks / promise-callbacks in the queue. */
async function flushPromises(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('initDeviceCache — refresh populates cache from enumerateDevices', () => {
    it('populates audio and video device lists after init', async () => {
        const rawDevices = [
            makeDevice('audioinput', 'mic-1', 'Built-in Mic'),
            makeDevice('audioinput', 'mic-2', 'USB Mic'),
            makeDevice('videoinput', 'cam-1', 'Built-in Camera'),
        ];
        (navigator.mediaDevices.enumerateDevices as jest.Mock).mockResolvedValue(rawDevices);

        initDeviceCache();
        await flushPromises();

        const audio = getAudioDevices();
        expect(audio).toHaveLength(2);
        expect(audio[0]).toEqual({deviceId: 'mic-1', label: 'Built-in Mic', kind: 'audioinput'});
        expect(audio[1]).toEqual({deviceId: 'mic-2', label: 'USB Mic', kind: 'audioinput'});

        const video = getVideoDevices();
        expect(video).toHaveLength(1);
        expect(video[0]).toEqual({deviceId: 'cam-1', label: 'Built-in Camera', kind: 'videoinput'});
    });

    it('falls back to "Unbenannt" when label is empty', async () => {
        const rawDevices = [
            makeDevice('audioinput', 'mic-x', ''),
        ];
        (navigator.mediaDevices.enumerateDevices as jest.Mock).mockResolvedValue(rawDevices);

        initDeviceCache();
        await flushPromises();

        expect(getAudioDevices()[0].label).toBe('Unbenannt');
    });

    it('is idempotent — second call does not install another listener', () => {
        initDeviceCache();
        initDeviceCache();
        expect(navigator.mediaDevices.addEventListener).toHaveBeenCalledTimes(1);
    });
});

describe('localStorage-backed preference getters/setters', () => {
    it('getPreferredMicId returns undefined when nothing is stored', () => {
        expect(getPreferredMicId()).toBeUndefined();
    });

    it('setPreferredMicId + getPreferredMicId round-trips the value', () => {
        setPreferredMicId('mic-abc');
        expect(getPreferredMicId()).toBe('mic-abc');
    });

    it('getPreferredCamId returns undefined when nothing is stored', () => {
        expect(getPreferredCamId()).toBeUndefined();
    });

    it('setPreferredCamId + getPreferredCamId round-trips the value', () => {
        setPreferredCamId('cam-xyz');
        expect(getPreferredCamId()).toBe('cam-xyz');
    });

    it('getMuteOnJoin defaults to false when nothing is stored', () => {
        expect(getMuteOnJoin()).toBe(false);
    });

    it('setMuteOnJoin(true) + getMuteOnJoin returns true', () => {
        setMuteOnJoin(true);
        expect(getMuteOnJoin()).toBe(true);
    });

    it('setMuteOnJoin(false) + getMuteOnJoin returns false', () => {
        setMuteOnJoin(true);
        setMuteOnJoin(false);
        expect(getMuteOnJoin()).toBe(false);
    });
});
