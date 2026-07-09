import {renderHook, act} from '@testing-library/react';

import {useRingtone} from './use_ringtone';

class FakeAudio {
    src: string;
    loop = false;
    volume = 0;
    currentTime = 0;
    play = jest.fn().mockResolvedValue(undefined);
    pause = jest.fn();
    removeAttribute = jest.fn();
    load = jest.fn();

    constructor(src: string) {
        this.src = src;
    }
}

beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).Audio = FakeAudio;
    jest.clearAllMocks();
});

describe('useRingtone', () => {
    it('stop() before start() is a no-op — no errors thrown', () => {
        const {result} = renderHook(() => useRingtone());

        expect(() => {
            act(() => {
                result.current.stop();
            });
        }).not.toThrow();
    });

    it('start() then stop() pauses and resets currentTime', () => {
        let captured: FakeAudio | null = null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (global as any).Audio = jest.fn().mockImplementation((src: string) => {
            captured = new FakeAudio(src);
            return captured;
        });

        const {result} = renderHook(() => useRingtone());

        act(() => {
            result.current.start();
        });

        act(() => {
            result.current.stop();
        });

        expect(captured).not.toBeNull();
        expect(captured!.pause).toHaveBeenCalled();
        expect(captured!.currentTime).toBe(0);
    });

    it('start() sets loop=true and a non-zero volume', () => {
        let captured: FakeAudio | null = null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (global as any).Audio = jest.fn().mockImplementation((src: string) => {
            captured = new FakeAudio(src);
            return captured;
        });

        const {result} = renderHook(() => useRingtone());

        act(() => {
            result.current.start();
        });

        expect(captured).not.toBeNull();
        expect(captured!.loop).toBe(true);
        expect(captured!.volume).toBeGreaterThan(0);
        expect(captured!.play).toHaveBeenCalled();
    });

    it('start() called twice creates exactly one Audio (no leak)', () => {
        const ctor = jest.fn().mockImplementation((src: string) => new FakeAudio(src));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (global as any).Audio = ctor;

        const {result} = renderHook(() => useRingtone());

        act(() => {
            result.current.start();
            result.current.start();
        });

        expect(ctor).toHaveBeenCalledTimes(1);
    });

    it('unmount stops the audio cleanly', () => {
        let captured: FakeAudio | null = null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (global as any).Audio = jest.fn().mockImplementation((src: string) => {
            captured = new FakeAudio(src);
            return captured;
        });

        const {result, unmount} = renderHook(() => useRingtone());

        act(() => {
            result.current.start();
        });

        act(() => {
            unmount();
        });

        expect(captured).not.toBeNull();
        expect(captured!.pause).toHaveBeenCalled();
    });

    it('stop() drops the media source so play-keys cannot re-trigger the ringtone', () => {
        let captured: FakeAudio | null = null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (global as any).Audio = jest.fn().mockImplementation((src: string) => {
            captured = new FakeAudio(src);
            return captured;
        });

        const {result} = renderHook(() => useRingtone());

        act(() => {
            result.current.start();
        });
        act(() => {
            result.current.stop();
        });

        expect(captured!.removeAttribute).toHaveBeenCalledWith('src');
        expect(captured!.load).toHaveBeenCalled();
    });

    it('play() rejection is swallowed (autoplay denied)', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (global as any).Audio = jest.fn().mockImplementation((src: string) => {
            const a = new FakeAudio(src);
            a.play = jest.fn().mockRejectedValue(new Error('NotAllowedError'));
            return a;
        });

        const {result} = renderHook(() => useRingtone());

        expect(() => {
            act(() => {
                result.current.start();
            });
        }).not.toThrow();
    });
});
