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

/**
 * Asks the Mattermost-Desktop main process for available screen/window
 * sources via the postMessage protocol that mattermost-plugin-calls also
 * uses. Resolves with the list, or rejects after a 3s timeout if the
 * desktop bridge isn't available.
 */
export function getDesktopSources(): Promise<DesktopSource[]> {
    return new Promise((resolve, reject) => {
        if (typeof window === 'undefined') {
            reject(new Error('no window'));
            return;
        }
        const handler = (event: MessageEvent) => {
            if (event.data?.type === 'desktop-sources-result') {
                window.removeEventListener('message', handler);
                clearTimeout(timer);

                // Some MM-Desktop versions wrap the array in .message,
                // others put it at .data.sources or .data.message directly.
                // Normalize.
                const raw = event.data.message ?? event.data.sources ?? [];

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const sources: DesktopSource[] = (Array.isArray(raw) ? raw : []).map((s: any) => ({
                    id: s.id,
                    name: s.name ?? '',
                    thumbnailURL: s.thumbnailURL ?? s.thumbnail_url ?? s.thumbnail ?? '',
                }));
                resolve(sources);
            }
        };
        window.addEventListener('message', handler);
        const timer = window.setTimeout(() => {
            window.removeEventListener('message', handler);
            reject(new Error('desktop-bridge timeout — Mattermost-Desktop ist nicht verfügbar oder zu alt'));
        }, 3000);
        window.postMessage(
            {
                type: 'get-desktop-sources',
                message: {types: ['screen', 'window'], thumbnailSize: {width: 320, height: 200}},
            },
            window.location.origin,
        );
    });
}

/**
 * Captures a MediaStream for the chosen Chromium source-id using the
 * Chromium-only chromeMediaSource constraints. Throws on permission
 * denial or invalid id.
 */
export async function captureDesktopStream(sourceId: string): Promise<MediaStream> {
    // Cast: TypeScript's MediaTrackConstraints type doesn't know about
    // chromeMediaSource. The constraint shape is the standard Electron/Chromium
    // way of selecting a desktopCapturer source for getUserMedia.

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
