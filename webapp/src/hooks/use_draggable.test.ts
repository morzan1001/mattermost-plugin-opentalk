import {renderHook, act} from '@testing-library/react';
import type React from 'react';

import {useDraggable} from './use_draggable';

beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
});

// Helper: simulate a pointer-down on the handle
function firePointerDown(
    result: ReturnType<typeof renderHook<ReturnType<typeof useDraggable>, unknown>>['result'],
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

describe('useDraggable', () => {
    it('uses default position when localStorage is empty', () => {
        const {result} = renderHook(() =>
            useDraggable({storageKey: 'k', defaultPosition: {x: 100, y: 200}}),
        );

        expect(result.current.style).toEqual({position: 'fixed', left: 100, top: 200});
        expect(result.current.isDragging).toBe(false);
    });

    it('uses stored position when localStorage has valid JSON', () => {
        localStorage.setItem('k', JSON.stringify({x: 50, y: 75}));

        const {result} = renderHook(() =>
            useDraggable({storageKey: 'k', defaultPosition: {x: 100, y: 200}}),
        );

        expect(result.current.style).toEqual({position: 'fixed', left: 50, top: 75});
    });

    it('falls back to default when localStorage has invalid JSON', () => {
        localStorage.setItem('k', 'not-json');

        const {result} = renderHook(() =>
            useDraggable({storageKey: 'k', defaultPosition: {x: 100, y: 200}}),
        );

        expect(result.current.style).toEqual({position: 'fixed', left: 100, top: 200});
    });

    it('falls back to default when localStorage has non-finite numbers', () => {
        localStorage.setItem('k', JSON.stringify({x: Infinity, y: 0}));

        const {result} = renderHook(() =>
            useDraggable({storageKey: 'k', defaultPosition: {x: 100, y: 200}}),
        );

        expect(result.current.style).toEqual({position: 'fixed', left: 100, top: 200});
    });

    it('drag updates position and persists to localStorage on pointer-up', () => {
        const {result} = renderHook(() =>
            useDraggable({storageKey: 'drag-key', defaultPosition: {x: 100, y: 100}}),
        );

        // Start drag at pointer position (100, 100); widget is at (100, 100)
        firePointerDown(result, 100, 100);

        expect(result.current.isDragging).toBe(true);

        // Move pointer to (150, 130) — delta: +50, +30
        fireWindowPointerEvent('pointermove', 150, 130);

        // End drag
        fireWindowPointerEvent('pointerup', 150, 130);

        expect(result.current.isDragging).toBe(false);

        // Widget started at (100, 100); delta is (+50, +30) → new pos (150, 130)
        expect(result.current.style.left).toBe(150);
        expect(result.current.style.top).toBe(130);

        // localStorage should be persisted
        const stored = JSON.parse(localStorage.getItem('drag-key') ?? 'null') as {
            x: number;
            y: number;
        } | null;
        expect(stored).not.toBeNull();
        expect(stored?.x).toBe(150);
        expect(stored?.y).toBe(130);
    });

    it('clamps x position to minimum 16 when dragged off left edge', () => {
        Object.defineProperty(window, 'innerWidth', {value: 1024, configurable: true});
        Object.defineProperty(window, 'innerHeight', {value: 768, configurable: true});

        const {result} = renderHook(() =>
            useDraggable({storageKey: 'clamp-key', defaultPosition: {x: 100, y: 100}}),
        );

        // Start drag at (100, 100), widget at (100, 100)
        firePointerDown(result, 100, 100);

        // Move pointer to (0, 100) — delta: -100, 0 → would place x at 0 which is below 16
        fireWindowPointerEvent('pointerup', 0, 100);

        // x should be clamped to 16
        expect(result.current.style.left).toBeGreaterThanOrEqual(16);
    });

    it('clamps x position to maximum window.innerWidth - 16 when dragged off right edge', () => {
        Object.defineProperty(window, 'innerWidth', {value: 1024, configurable: true});
        Object.defineProperty(window, 'innerHeight', {value: 768, configurable: true});

        const {result} = renderHook(() =>
            useDraggable({storageKey: 'clamp-right-key', defaultPosition: {x: 100, y: 100}}),
        );

        // Start drag at (100, 100), widget at (100, 100)
        firePointerDown(result, 100, 100);

        // Move pointer to (2000, 100) — delta far off screen right
        fireWindowPointerEvent('pointerup', 2000, 100);

        // x should be clamped to innerWidth - 16
        expect(result.current.style.left).toBeLessThanOrEqual(1024 - 16);
    });

    it('removes window listeners on unmount even if mid-drag', () => {
        const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

        const {result, unmount} = renderHook(() =>
            useDraggable({storageKey: 'unmount-key', defaultPosition: {x: 100, y: 100}}),
        );

        // Trigger pointer-down to attach window listeners
        firePointerDown(result, 100, 100);

        // Unmount while dragging
        act(() => {
            unmount();
        });

        // Both pointermove and pointerup listeners should have been removed
        const removedEvents = removeEventListenerSpy.mock.calls.map((c) => c[0]);
        expect(removedEvents).toContain('pointermove');
        expect(removedEvents).toContain('pointerup');
    });
});
