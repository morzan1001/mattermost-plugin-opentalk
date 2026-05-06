import {renderHook, act} from '@testing-library/react';
import type React from 'react';

import {useResizable} from './use_resizable';

beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
});

// Helper: simulate a pointer-down on the handle
function firePointerDown(
    result: ReturnType<typeof renderHook<ReturnType<typeof useResizable>, unknown>>['result'],
    pageX: number,
    pageY: number,
) {
    act(() => {
        result.current.handleProps.onPointerDown({
            pageX,
            pageY,
            preventDefault: () => {},
            stopPropagation: () => {},
        } as unknown as React.PointerEvent);
    });
}

// Helper: dispatch a pointermove or pointerup on window
function fireWindowPointerEvent(name: 'pointermove' | 'pointerup', pageX: number, pageY: number) {
    act(() => {
        // jsdom does not honour pageX/pageY in the MouseEvent constructor,
        // so we build the event and override those properties manually.
        const ev = new MouseEvent(name, {bubbles: true});
        Object.defineProperty(ev, 'pageX', {value: pageX, configurable: true});
        Object.defineProperty(ev, 'pageY', {value: pageY, configurable: true});
        window.dispatchEvent(ev);
    });
}

describe('useResizable', () => {
    it('uses default size when localStorage is empty', () => {
        const {result} = renderHook(() =>
            useResizable({
                storageKey: 'k',
                defaultSize: {width: 340, height: 88},
                minSize: {width: 280, height: 80},
            }),
        );

        expect(result.current.style).toEqual({width: 340, height: 88});
        expect(result.current.isResizing).toBe(false);
    });

    it('uses stored size when localStorage has valid JSON', () => {
        localStorage.setItem('k', JSON.stringify({width: 400, height: 120}));

        const {result} = renderHook(() =>
            useResizable({
                storageKey: 'k',
                defaultSize: {width: 340, height: 88},
                minSize: {width: 280, height: 80},
            }),
        );

        expect(result.current.style).toEqual({width: 400, height: 120});
    });

    it('falls back to default when localStorage has invalid JSON', () => {
        localStorage.setItem('k', 'not-json');

        const {result} = renderHook(() =>
            useResizable({
                storageKey: 'k',
                defaultSize: {width: 340, height: 88},
                minSize: {width: 280, height: 80},
            }),
        );

        expect(result.current.style).toEqual({width: 340, height: 88});
    });

    it('resize updates size and persists to localStorage on pointer-up', () => {
        const {result} = renderHook(() =>
            useResizable({
                storageKey: 'resize-key',
                defaultSize: {width: 340, height: 88},
                minSize: {width: 280, height: 80},
            }),
        );

        // Start resize at pointer position (100, 100); widget is at default size
        firePointerDown(result, 100, 100);

        expect(result.current.isResizing).toBe(true);

        // Move pointer to (150, 130) — delta: +50, +30
        fireWindowPointerEvent('pointermove', 150, 130);

        // End resize
        fireWindowPointerEvent('pointerup', 150, 130);

        expect(result.current.isResizing).toBe(false);

        // Widget started at (340, 88); delta is (+50, +30) → new size (390, 118)
        expect(result.current.style.width).toBe(390);
        expect(result.current.style.height).toBe(118);

        // localStorage should be persisted
        const stored = JSON.parse(localStorage.getItem('resize-key') ?? 'null') as {
            width: number;
            height: number;
        } | null;
        expect(stored).not.toBeNull();
        expect(stored?.width).toBe(390);
        expect(stored?.height).toBe(118);
    });

    it('clamps to minSize when resize would shrink below minimum', () => {
        const {result} = renderHook(() =>
            useResizable({
                storageKey: 'clamp-min-key',
                defaultSize: {width: 340, height: 88},
                minSize: {width: 280, height: 80},
            }),
        );

        // Start resize at (100, 100)
        firePointerDown(result, 100, 100);

        // Move to (40, 100) — delta: -60, 0 → would place width at 280, below min
        fireWindowPointerEvent('pointerup', 40, 100);

        // width should be clamped to minSize.width (280)
        expect(result.current.style.width).toBeGreaterThanOrEqual(280);
        expect(result.current.style.width).toBe(280);
    });

    it('clamps to provided maxSize when resize exceeds it', () => {
        const {result} = renderHook(() =>
            useResizable({
                storageKey: 'clamp-max-key',
                defaultSize: {width: 340, height: 88},
                minSize: {width: 280, height: 80},
                maxSize: {width: 600, height: 200},
            }),
        );

        // Start resize at (100, 100)
        firePointerDown(result, 100, 100);

        // Move far right/down — delta: +1000, +500
        fireWindowPointerEvent('pointerup', 1100, 600);

        // Should be clamped to maxSize
        expect(result.current.style.width).toBe(600);
        expect(result.current.style.height).toBe(200);
    });

    it('clamps to viewport minus 32 when no maxSize is provided', () => {
        Object.defineProperty(window, 'innerWidth', {value: 500, configurable: true});
        Object.defineProperty(window, 'innerHeight', {value: 400, configurable: true});

        const {result} = renderHook(() =>
            useResizable({
                storageKey: 'clamp-viewport-key',
                defaultSize: {width: 340, height: 88},
                minSize: {width: 280, height: 80},
            }),
        );

        // Start resize at (100, 100)
        firePointerDown(result, 100, 100);

        // Move far right/down — would produce width > 1000, height > 1000
        fireWindowPointerEvent('pointerup', 1100, 1100);

        // Should be clamped to viewport - 32
        expect(result.current.style.width).toBe(500 - 32); // 468
        expect(result.current.style.height).toBe(400 - 32); // 368
    });

    it('removes window listeners on unmount even if mid-resize', () => {
        const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

        const {result, unmount} = renderHook(() =>
            useResizable({
                storageKey: 'unmount-key',
                defaultSize: {width: 340, height: 88},
                minSize: {width: 280, height: 80},
            }),
        );

        // Trigger pointer-down to attach window listeners
        firePointerDown(result, 100, 100);

        // Unmount while resizing
        act(() => {
            unmount();
        });

        // Both pointermove and pointerup listeners should have been removed
        const removedEvents = removeEventListenerSpy.mock.calls.map((c) => c[0]);
        expect(removedEvents).toContain('pointermove');
        expect(removedEvents).toContain('pointerup');
    });
});
