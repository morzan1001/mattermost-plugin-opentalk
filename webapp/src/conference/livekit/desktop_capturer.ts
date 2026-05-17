export interface DesktopSource {
    id: string;
    name: string;
    thumbnailURL: string;
}

export function isElectron(): boolean {
    if (typeof navigator === 'undefined') {
        return false;
    }
    const ua = navigator.userAgent || '';
    return ua.includes('Electron') || ua.includes('Mattermost');
}

// window.desktopAPI is injected by Mattermost-Desktop's contextBridge
// (externalAPI.ts). Available in MM-Desktop 6.x plugin webviews.
declare global {
    interface Window {
        desktopAPI?: {
            getDesktopSources(opts: {
                types: Array<'screen' | 'window'>;
                thumbnailSize?: {width: number; height: number};
            }): Promise<DesktopSource[]>;
        };
    }
}

export function getDesktopSources(): Promise<DesktopSource[]> {
    if (!window.desktopAPI?.getDesktopSources) {
        return Promise.reject(new Error(
            'Mattermost Desktop screen-share API unavailable (window.desktopAPI.getDesktopSources missing). Update Mattermost Desktop or use a browser.',
        ));
    }
    return window.desktopAPI.getDesktopSources({
        types: ['screen', 'window'],
        thumbnailSize: {width: 320, height: 200},
    });
}

// Captures a MediaStream for the chosen Chromium source-id using the
// chromeMediaSource constraints. Throws on permission denial or invalid id.
export async function captureDesktopStream(sourceId: string): Promise<MediaStream> {
    // TypeScript's MediaTrackConstraints does not model chromeMediaSource.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const constraints: any = {
        audio: false,
        video: {
            mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: sourceId,
                maxWidth: 1920,
                maxHeight: 1080,
                maxFrameRate: 30,
            },
        },
    };
    return navigator.mediaDevices.getUserMedia(constraints);
}
