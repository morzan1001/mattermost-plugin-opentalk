import {renderHook, act} from '@testing-library/react';

import {useRingtone} from './use_ringtone';

class FakeOsc {
    frequency = {value: 0};
    connect = jest.fn();
    start = jest.fn();
    stop = jest.fn();
    disconnect = jest.fn();
}
class FakeGain {
    gain = {value: 0, linearRampToValueAtTime: jest.fn()};
    connect = jest.fn();
    disconnect = jest.fn();
}
class FakeCtx {
    currentTime = 0;
    destination = {};
    createOscillator = jest.fn(() => new FakeOsc());
    createGain = jest.fn(() => new FakeGain());
    close = jest.fn();
}
(global as any).AudioContext = FakeCtx; // eslint-disable-line @typescript-eslint/no-explicit-any

beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
});

afterEach(() => {
    jest.useRealTimers();
});

describe('useRingtone', () => {
    it('start() creates an AudioContext, oscillator, and gain node', () => {
        // Track how many FakeCtx instances are created
        const ctxInstances: FakeCtx[] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (global as any).AudioContext = jest.fn().mockImplementation(() => {
            const ctx = new FakeCtx();
            ctxInstances.push(ctx);
            return ctx;
        });

        const {result} = renderHook(() => useRingtone());

        act(() => {
            result.current.start();
        });

        expect(ctxInstances).toHaveLength(1);
        expect(ctxInstances[0].createOscillator).toHaveBeenCalledTimes(1);
        expect(ctxInstances[0].createGain).toHaveBeenCalledTimes(1);
    });

    it('start() called twice does NOT create a second oscillator', () => {
        const ctxInstances: FakeCtx[] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (global as any).AudioContext = jest.fn().mockImplementation(() => {
            const ctx = new FakeCtx();
            ctxInstances.push(ctx);
            return ctx;
        });

        const {result} = renderHook(() => useRingtone());

        act(() => {
            result.current.start();
            result.current.start();
        });

        // Only one context created, and only one oscillator
        expect(ctxInstances).toHaveLength(1);
        expect(ctxInstances[0].createOscillator).toHaveBeenCalledTimes(1);
    });

    it('stop() ramps gain to zero and clears the interval', () => {
        const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

        let capturedGain: FakeGain | null = null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (global as any).AudioContext = jest.fn().mockImplementation(() => {
            const ctx = new FakeCtx();
            ctx.createGain = jest.fn().mockImplementation(() => {
                const g = new FakeGain();
                capturedGain = g;
                return g;
            });
            return ctx;
        });

        const {result} = renderHook(() => useRingtone());

        act(() => {
            result.current.start();
        });

        act(() => {
            result.current.stop();
        });

        expect(clearIntervalSpy).toHaveBeenCalled();
        expect(capturedGain).not.toBeNull();
        expect(capturedGain!.gain.linearRampToValueAtTime).toHaveBeenCalled();

        // Advance past the 100ms timeout so osc.stop() fires
        act(() => {
            jest.advanceTimersByTime(120);
        });
    });

    it('stop() before start() is a no-op — no errors thrown', () => {
        const {result} = renderHook(() => useRingtone());

        expect(() => {
            act(() => {
                result.current.stop();
            });
        }).not.toThrow();
    });

    it('unmount stops cleanly (clearInterval called)', () => {
        const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (global as any).AudioContext = jest.fn().mockImplementation(() => new FakeCtx());

        const {result, unmount} = renderHook(() => useRingtone());

        act(() => {
            result.current.start();
        });

        act(() => {
            unmount();
        });

        expect(clearIntervalSpy).toHaveBeenCalled();

        // Advance past the 100ms timeout for osc cleanup
        act(() => {
            jest.advanceTimersByTime(120);
        });
    });
});
