import {renderHook, act} from '@testing-library/react';

import {useLayoutMode} from './use_layout_mode';

const STORAGE_KEY = 'opentalk:layout-mode:v1';

beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
});

describe('useLayoutMode', () => {
    it('defaults to "speaker" when no stored value', () => {
        const {result} = renderHook(() => useLayoutMode());

        expect(result.current[0]).toBe('speaker');
    });

    it('reads stored value "grid" on mount', () => {
        localStorage.setItem(STORAGE_KEY, 'grid');

        const {result} = renderHook(() => useLayoutMode());

        expect(result.current[0]).toBe('grid');
    });

    it('reads stored value "screen-focus" on mount', () => {
        localStorage.setItem(STORAGE_KEY, 'screen-focus');

        const {result} = renderHook(() => useLayoutMode());

        expect(result.current[0]).toBe('screen-focus');
    });

    it('reads stored value "speaker" on mount', () => {
        localStorage.setItem(STORAGE_KEY, 'speaker');

        const {result} = renderHook(() => useLayoutMode());

        expect(result.current[0]).toBe('speaker');
    });

    it('falls back to "speaker" when stored value is invalid', () => {
        localStorage.setItem(STORAGE_KEY, 'foo');

        const {result} = renderHook(() => useLayoutMode());

        expect(result.current[0]).toBe('speaker');
    });

    it('calling the setter updates state and persists to localStorage', () => {
        const {result} = renderHook(() => useLayoutMode());

        expect(result.current[0]).toBe('speaker');

        act(() => {
            result.current[1]('grid');
        });

        expect(result.current[0]).toBe('grid');
        expect(localStorage.getItem(STORAGE_KEY)).toBe('grid');
    });

    it('setter persists each of the three valid modes', () => {
        const {result} = renderHook(() => useLayoutMode());

        act(() => {
            result.current[1]('screen-focus');
        });
        expect(result.current[0]).toBe('screen-focus');
        expect(localStorage.getItem(STORAGE_KEY)).toBe('screen-focus');

        act(() => {
            result.current[1]('speaker');
        });
        expect(result.current[0]).toBe('speaker');
        expect(localStorage.getItem(STORAGE_KEY)).toBe('speaker');

        act(() => {
            result.current[1]('grid');
        });
        expect(result.current[0]).toBe('grid');
        expect(localStorage.getItem(STORAGE_KEY)).toBe('grid');
    });
});
