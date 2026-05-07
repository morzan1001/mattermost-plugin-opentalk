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
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('resolves with sources when desktop-sources-result message is received', async () => {
        const mockSources = [
            {id: 'screen:0:0', name: 'Entire Screen', thumbnailURL: 'data:image/png;base64,abc'},
            {id: 'window:1234:0', name: 'My Window', thumbnail_url: 'data:image/png;base64,xyz'},
        ];

        // Schedule the reply message before calling getDesktopSources so the
        // listener is registered first.
        const promise = getDesktopSources();

        // Simulate the desktop bridge responding.
        window.dispatchEvent(
            new MessageEvent('message', {
                data: {type: 'desktop-sources-result', message: mockSources},
            }),
        );

        const sources = await promise;
        expect(sources).toHaveLength(2);
        expect(sources[0]).toEqual({id: 'screen:0:0', name: 'Entire Screen', thumbnailURL: 'data:image/png;base64,abc'});
        // thumbnail_url fallback
        expect(sources[1].thumbnailURL).toBe('data:image/png;base64,xyz');
    });

    it('rejects after 3s timeout when no reply arrives', async () => {
        const promise = getDesktopSources();

        // Advance time past the 3 000 ms timeout.
        jest.advanceTimersByTime(3001);

        await expect(promise).rejects.toThrow('desktop-bridge timeout');
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
