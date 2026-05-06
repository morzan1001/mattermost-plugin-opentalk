import {renderHook, act} from '@testing-library/react';

import {useMeetingDuration} from './use_meeting_duration';

const NOW0 = 1700000000000;

beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Date, 'now').mockReturnValue(NOW0);
});

afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
});

describe('useMeetingDuration', () => {
    it('returns empty string when joinedAt is undefined', () => {
        const {result} = renderHook(() => useMeetingDuration(undefined));

        expect(result.current).toBe('');
    });

    it('returns 0:00 immediately after joinedAt = Date.now()', () => {
        const {result} = renderHook(() => useMeetingDuration(NOW0));

        expect(result.current).toBe('0:00');
    });

    it('returns 0:05 after advancing 5 seconds', () => {
        const {result} = renderHook(({j}: {j: number}) => useMeetingDuration(j), {
            initialProps: {j: NOW0},
        });

        expect(result.current).toBe('0:00');

        (Date.now as jest.Mock).mockReturnValue(NOW0 + 5000);
        act(() => {
            jest.advanceTimersByTime(5000);
        });

        expect(result.current).toBe('0:05');
    });

    it('returns 1:00 after 60 seconds', () => {
        const {result} = renderHook(({j}: {j: number}) => useMeetingDuration(j), {
            initialProps: {j: NOW0},
        });

        (Date.now as jest.Mock).mockReturnValue(NOW0 + 60000);
        act(() => {
            jest.advanceTimersByTime(60000);
        });

        expect(result.current).toBe('1:00');
    });

    it('returns 4:07 after 247 seconds (4*60 + 7)', () => {
        const {result} = renderHook(({j}: {j: number}) => useMeetingDuration(j), {
            initialProps: {j: NOW0},
        });

        (Date.now as jest.Mock).mockReturnValue(NOW0 + 247000);
        act(() => {
            jest.advanceTimersByTime(247000);
        });

        expect(result.current).toBe('4:07');
    });

    it('returns 1:00:00 after 3600 seconds', () => {
        const {result} = renderHook(({j}: {j: number}) => useMeetingDuration(j), {
            initialProps: {j: NOW0},
        });

        (Date.now as jest.Mock).mockReturnValue(NOW0 + 3600000);
        act(() => {
            jest.advanceTimersByTime(3600000);
        });

        expect(result.current).toBe('1:00:00');
    });

    it('returns 2:30:15 after 9015 seconds', () => {
        const {result} = renderHook(({j}: {j: number}) => useMeetingDuration(j), {
            initialProps: {j: NOW0},
        });

        (Date.now as jest.Mock).mockReturnValue(NOW0 + 9015000);
        act(() => {
            jest.advanceTimersByTime(9015000);
        });

        expect(result.current).toBe('2:30:15');
    });

    it('stops updating after unmount — clearInterval is called', () => {
        const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

        const {unmount} = renderHook(() => useMeetingDuration(NOW0));

        act(() => {
            unmount();
        });

        expect(clearIntervalSpy).toHaveBeenCalled();
    });

    it('does not start a timer when joinedAt is undefined', () => {
        const setIntervalSpy = jest.spyOn(global, 'setInterval');

        renderHook(() => useMeetingDuration(undefined));

        expect(setIntervalSpy).not.toHaveBeenCalled();
    });
});
