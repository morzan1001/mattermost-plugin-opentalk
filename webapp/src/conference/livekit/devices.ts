export interface MediaDevice {
    deviceId: string;
    label: string;
    kind: 'audioinput' | 'videoinput';
}

let cachedAudio: MediaDevice[] = [];
let cachedVideo: MediaDevice[] = [];
let listenerInstalled = false;

async function refresh(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
        return;
    }
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        cachedAudio = devices.
            filter((d) => d.kind === 'audioinput').
            map((d) => ({deviceId: d.deviceId, label: d.label || 'Unbenannt', kind: 'audioinput' as const}));
        cachedVideo = devices.
            filter((d) => d.kind === 'videoinput').
            map((d) => ({deviceId: d.deviceId, label: d.label || 'Unbenannt', kind: 'videoinput' as const}));
    } catch {
        /* swallow — permission may not be granted yet; cache stays empty */
    }
}

/** Initialize the device cache. Idempotent. Call once at plugin init. */
export function initDeviceCache(): void {
    if (listenerInstalled) {
        return;
    }
    listenerInstalled = true;
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    refresh();
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.addEventListener) {
        navigator.mediaDevices.addEventListener('devicechange', () => {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            refresh();
        });
    }
}

export function getAudioDevices(): MediaDevice[] {
    return cachedAudio;
}

export function getVideoDevices(): MediaDevice[] {
    return cachedVideo;
}

const MIC_DEVICE_KEY = 'opentalk:preferred-mic-id';
const CAM_DEVICE_KEY = 'opentalk:preferred-cam-id';
const MUTE_ON_JOIN_KEY = 'opentalk:mute-on-join';

function readSetting(key: string): string | undefined {
    if (typeof window === 'undefined') {
        return undefined;
    }
    try {
        return window.localStorage.getItem(key) ?? undefined;
    } catch {
        return undefined;
    }
}

function writeSetting(key: string, value: string): void {
    if (typeof window === 'undefined') {
        return;
    }
    try {
        window.localStorage.setItem(key, value);
    } catch {
        /* swallow */
    }
}

export function getPreferredMicId(): string | undefined {
    return readSetting(MIC_DEVICE_KEY);
}
export function setPreferredMicId(id: string): void {
    writeSetting(MIC_DEVICE_KEY, id);
}

export function getPreferredCamId(): string | undefined {
    return readSetting(CAM_DEVICE_KEY);
}
export function setPreferredCamId(id: string): void {
    writeSetting(CAM_DEVICE_KEY, id);
}

export function getMuteOnJoin(): boolean {
    return readSetting(MUTE_ON_JOIN_KEY) === 'true';
}
export function setMuteOnJoin(value: boolean): void {
    writeSetting(MUTE_ON_JOIN_KEY, value ? 'true' : 'false');
}

/** Test-only helper: reset module state. */
// eslint-disable-next-line no-underscore-dangle, @typescript-eslint/naming-convention
export function _resetDeviceCache(): void {
    cachedAudio = [];
    cachedVideo = [];
    listenerInstalled = false;
}
