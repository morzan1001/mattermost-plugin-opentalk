import {isElectron, getDesktopSources, captureDesktopStream} from './desktop_capturer';

describe('isElectron()', () => {
    const originalUserAgent = navigator.userAgent;

    afterEach(() => {
        Object.defineProperty(navigator, 'userAgent', {
            value: originalUserAgent,
            configurable: true,
        });
    });

    it('returns false for a plain browser user-agent', () => {
        Object.defineProperty(navigator, 'userAgent', {
            value: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
            configurable: true,
        });
        expect(isElectron()).toBe(false);
    });

    it('returns true when user-agent contains "Electron"', () => {
        Object.defineProperty(navigator, 'userAgent', {
            value: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Electron/28.0.0 Safari/537.36',
            configurable: true,
        });
        expect(isElectron()).toBe(true);
    });
});

describe('getDesktopSources()', () => {
    afterEach(() => {
        delete (window as any).desktopAPI; // eslint-disable-line @typescript-eslint/no-explicit-any
    });

    it('resolves with sources returned by window.desktopAPI.getDesktopSources', async () => {
        const mockSources = [
            {id: 'screen:0:0', name: 'Entire Screen', thumbnailURL: 'data:image/png;base64,abc'},
            {id: 'window:1234:0', name: 'My Window', thumbnailURL: 'data:image/png;base64,xyz'},
        ];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).desktopAPI = {
            getDesktopSources: jest.fn().mockResolvedValue(mockSources),
        };

        const sources = await getDesktopSources();
        expect(sources).toHaveLength(2);
        expect(sources[0]).toEqual({id: 'screen:0:0', name: 'Entire Screen', thumbnailURL: 'data:image/png;base64,abc'});
        expect(sources[1].thumbnailURL).toBe('data:image/png;base64,xyz');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((window as any).desktopAPI.getDesktopSources).toHaveBeenCalledWith({
            types: ['screen', 'window'],
            thumbnailSize: {width: 320, height: 200},
        });
    });

    it('rejects when window.desktopAPI is not present', async () => {
        await expect(getDesktopSources()).rejects.toThrow('window.desktopAPI.getDesktopSources missing');
    });

    it('rejects when window.desktopAPI.getDesktopSources is missing', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).desktopAPI = {};
        await expect(getDesktopSources()).rejects.toThrow('window.desktopAPI.getDesktopSources missing');
    });
});

describe('captureDesktopStream()', () => {
    it('calls getUserMedia with chromeMediaSource constraints', async () => {
        const fakeStream = {getVideoTracks: () => []} as unknown as MediaStream;
        const mockGetUserMedia = jest.fn().mockResolvedValue(fakeStream);
        Object.defineProperty(navigator, 'mediaDevices', {
            value: {getUserMedia: mockGetUserMedia},
            configurable: true,
        });

        const result = await captureDesktopStream('screen:0:0');
        expect(result).toBe(fakeStream);
        expect(mockGetUserMedia).toHaveBeenCalledWith(
            expect.objectContaining({
                video: expect.objectContaining({
                    mandatory: expect.objectContaining({
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: 'screen:0:0',
                    }),
                }),
            }),
        );
    });
});
