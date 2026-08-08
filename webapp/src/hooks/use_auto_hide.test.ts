import {renderHook, act} from '@testing-library/react';

import {useAutoHide} from './use_auto_hide';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('hides after the idle timeout and returns on activity', () => {
    const {result} = renderHook(() => useAutoHide(true, 4000));
    expect(result.current.visible).toBe(true);

    act(() => {
        jest.advanceTimersByTime(4000);
    });
    expect(result.current.visible).toBe(false);

    act(() => {
        window.dispatchEvent(new Event('pointermove'));
    });
    expect(result.current.visible).toBe(true);
});

it('stays visible while held', () => {
    const {result} = renderHook(() => useAutoHide(true, 4000));
    act(() => result.current.holdProps.onPointerEnter());
    act(() => {
        jest.advanceTimersByTime(10000);
    });
    expect(result.current.visible).toBe(true);
});

it('stays visible when disabled', () => {
    const {result} = renderHook(() => useAutoHide(false, 4000));
    act(() => {
        jest.advanceTimersByTime(10000);
    });
    expect(result.current.visible).toBe(true);
});

it('requires a fresh idle period after a disable/enable cycle', () => {
    const {result, rerender} = renderHook(({enabled}) => useAutoHide(enabled, 4000), {
        initialProps: {enabled: true},
    });

    act(() => {
        jest.advanceTimersByTime(4000);
    });
    expect(result.current.visible).toBe(false);

    rerender({enabled: false});
    expect(result.current.visible).toBe(true);

    rerender({enabled: true});
    expect(result.current.visible).toBe(true);

    act(() => {
        jest.advanceTimersByTime(3999);
    });
    expect(result.current.visible).toBe(true);

    act(() => {
        jest.advanceTimersByTime(1);
    });
    expect(result.current.visible).toBe(false);
});

it('re-arms after a disable/enable cycle that unmounted the held element without a pointer leave', () => {
    const {result, rerender} = renderHook(({enabled}) => useAutoHide(enabled, 4000), {
        initialProps: {enabled: true},
    });

    act(() => result.current.holdProps.onPointerEnter());
    rerender({enabled: false});
    rerender({enabled: true});

    act(() => {
        jest.advanceTimersByTime(4000);
    });
    expect(result.current.visible).toBe(false);
});

it('does not strand the chrome hidden when the pointer is already resting through a disable/enable cycle', () => {
    const {result, rerender} = renderHook(({enabled}) => useAutoHide(enabled, 4000), {
        initialProps: {enabled: true},
    });

    act(() => {
        jest.advanceTimersByTime(4000);
    });
    expect(result.current.visible).toBe(false);

    rerender({enabled: false});
    act(() => result.current.holdProps.onPointerEnter());
    rerender({enabled: true});

    expect(result.current.visible).toBe(true);
    act(() => {
        jest.advanceTimersByTime(10000);
    });
    expect(result.current.visible).toBe(true);
});
