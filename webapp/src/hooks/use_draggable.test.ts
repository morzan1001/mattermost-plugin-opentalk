import {renderHook, act} from '@testing-library/react';
import type React from 'react';

import {useDraggable} from './use_draggable';

type DraggableResult = ReturnType<typeof renderHook<ReturnType<typeof useDraggable>, unknown>>['result'];

function setViewport(width: number, height: number) {
    Object.defineProperty(window, 'innerWidth', {value: width, configurable: true});
    Object.defineProperty(window, 'innerHeight', {value: height, configurable: true});
}

function stubRect(width: number, height: number): DOMRect {
    return {
        width,
        height,
        top: 0,
        left: 0,
        right: width,
        bottom: height,
        x: 0,
        y: 0,
        toJSON: () => ({}),
    } as DOMRect;
}

// renderHook mounts no DOM node, so box-aware cases have to hand the hook a
// detached element with a stubbed rect. Returns a remeasure function, since the
// widget's box changes size between layout passes.
function attachBox(result: DraggableResult, width: number, height: number) {
    const el = document.createElement('div');
    const spy = jest.spyOn(el, 'getBoundingClientRect').mockReturnValue(stubRect(width, height));
    result.current.nodeRef.current = el;

    return (nextWidth: number, nextHeight: number) => {
        spy.mockReturnValue(stubRect(nextWidth, nextHeight));
    };
}

beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
    setViewport(1024, 768);
});

// Helper: simulate a pointer-down on the handle
function firePointerDown(result: DraggableResult, pageX: number, pageY: number) {
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
    it('defaults to the bottom-right corner once the box is measured', () => {
        const {result, rerender} = renderHook(() => useDraggable({storageKey: 'k'}));

        attachBox(result, 400, 120);
        rerender();

        // 1024 - 400 - 16
        expect(result.current.style).toEqual({position: 'fixed', left: 608, bottom: 16});
        expect(result.current.style).not.toHaveProperty('top');
        expect(result.current.style).not.toHaveProperty('right');
        expect(result.current.isDragging).toBe(false);
    });

    it('does not place the default against an unmeasured zero-width box', () => {
        const {result, rerender} = renderHook(() => useDraggable({storageKey: 'k'}));

        attachBox(result, 0, 0);
        rerender();

        expect(result.current.style.left).toBe(16);
        expect(result.current.style.left).not.toBe(1024 - 16);
    });

    // The production sequence: baseMinWidth is 0 until the row is measured, so
    // the first layout pass reports a zero-width box and only the second can
    // resolve the default corner.
    it('defers placement to the pass that measures a real width', () => {
        const {result, rerender} = renderHook(() => useDraggable({storageKey: 'k'}));

        const remeasure = attachBox(result, 0, 0);
        rerender();

        expect(result.current.style.left).toBe(16);

        remeasure(400, 120);
        rerender();

        expect(result.current.style.left).toBe(608);
        expect(result.current.style.bottom).toBe(16);
    });

    it('uses stored offsets when localStorage has valid JSON', () => {
        localStorage.setItem('k', JSON.stringify({left: 300, bottom: 200}));

        const {result} = renderHook(() => useDraggable({storageKey: 'k'}));

        expect(result.current.style).toEqual({position: 'fixed', left: 300, bottom: 200});
    });

    it('does not override a stored position with the bottom-right default', () => {
        localStorage.setItem('k', JSON.stringify({left: 300, bottom: 200}));

        const {result, rerender} = renderHook(() => useDraggable({storageKey: 'k'}));

        attachBox(result, 400, 120);
        rerender();

        expect(result.current.style).toEqual({position: 'fixed', left: 300, bottom: 200});
    });

    it('falls back to the default when localStorage has invalid JSON', () => {
        localStorage.setItem('k', 'not-json');

        const {result, rerender} = renderHook(() => useDraggable({storageKey: 'k'}));

        attachBox(result, 400, 120);
        rerender();

        expect(result.current.style).toEqual({position: 'fixed', left: 608, bottom: 16});
    });

    it('falls back to the default when localStorage has non-finite numbers', () => {
        localStorage.setItem('k', JSON.stringify({left: Infinity, bottom: 0}));

        const {result, rerender} = renderHook(() => useDraggable({storageKey: 'k'}));

        attachBox(result, 400, 120);
        rerender();

        expect(result.current.style).toEqual({position: 'fixed', left: 608, bottom: 16});
    });

    it('rejects a stored payload in the previous {x, y} shape', () => {
        localStorage.setItem('k', JSON.stringify({x: 900, y: 40}));

        const {result, rerender} = renderHook(() => useDraggable({storageKey: 'k'}));

        attachBox(result, 400, 120);
        rerender();

        expect(result.current.style).toEqual({position: 'fixed', left: 608, bottom: 16});
    });

    it('never produces negative offsets at a degenerate 0x0 viewport', () => {
        setViewport(0, 0);
        localStorage.setItem('k', JSON.stringify({left: 1200, bottom: 700}));

        const {result, rerender} = renderHook(() => useDraggable({storageKey: 'k'}));

        attachBox(result, 400, 120);
        rerender();

        expect(result.current.style.left).toBe(16);
        expect(result.current.style.bottom).toBe(16);
        expect(result.current.style.left as number).toBeGreaterThanOrEqual(16);
        expect(result.current.style.bottom as number).toBeGreaterThanOrEqual(16);
    });

    it('clamps left against the measured box width, not the viewport corner', () => {
        localStorage.setItem('k', JSON.stringify({left: 900, bottom: 16}));

        const {result, rerender} = renderHook(() => useDraggable({storageKey: 'k'}));

        attachBox(result, 400, 120);
        rerender();

        // 1024 - 400 - 16
        expect(result.current.style.left).toBe(608);
    });

    it('clamps bottom so the top edge stays below the global header', () => {
        localStorage.setItem('k', JSON.stringify({left: 16, bottom: 700}));

        const {result, rerender} = renderHook(() => useDraggable({storageKey: 'k'}));

        attachBox(result, 400, 120);
        rerender();

        // 768 - 120 - 60
        expect(result.current.style.bottom).toBe(588);
    });

    it('re-clamps on window resize', () => {
        localStorage.setItem('k', JSON.stringify({left: 600, bottom: 16}));

        const {result, rerender} = renderHook(() => useDraggable({storageKey: 'k'}));

        attachBox(result, 400, 120);
        rerender();

        expect(result.current.style.left).toBe(600);

        setViewport(300, 768);
        act(() => {
            window.dispatchEvent(new Event('resize'));
        });

        expect(result.current.style.left).toBe(16);
    });

    it('does not persist a clamp caused by a shrinking viewport', () => {
        localStorage.setItem('k', JSON.stringify({left: 600, bottom: 16}));

        const {result, rerender} = renderHook(() => useDraggable({storageKey: 'k'}));

        attachBox(result, 400, 120);
        rerender();

        setViewport(300, 768);
        act(() => {
            window.dispatchEvent(new Event('resize'));
        });

        expect(JSON.parse(localStorage.getItem('k') ?? 'null')).toEqual({left: 600, bottom: 16});
    });

    it('drag updates offsets along the inverted vertical axis and persists on pointer-up', () => {
        localStorage.setItem('drag-key', JSON.stringify({left: 100, bottom: 100}));

        const {result} = renderHook(() => useDraggable({storageKey: 'drag-key'}));

        // Start drag at pointer position (100, 100); widget is at (100, 100)
        firePointerDown(result, 100, 100);

        expect(result.current.isDragging).toBe(true);

        // Move pointer to (150, 130) — delta: +50 across, +30 down
        fireWindowPointerEvent('pointermove', 150, 130);
        fireWindowPointerEvent('pointerup', 150, 130);

        expect(result.current.isDragging).toBe(false);

        // bottom grows upward, so a downward pointer delta lowers it
        expect(result.current.style.left).toBe(150);
        expect(result.current.style.bottom).toBe(70);

        const stored = JSON.parse(localStorage.getItem('drag-key') ?? 'null') as {
            left: number;
            bottom: number;
        } | null;
        expect(stored).toEqual({left: 150, bottom: 70});
    });

    it('clamps a drag against the measured box and persists the clamped value', () => {
        localStorage.setItem('drag-box-key', JSON.stringify({left: 100, bottom: 100}));

        const {result, rerender} = renderHook(() => useDraggable({storageKey: 'drag-box-key'}));

        attachBox(result, 400, 120);
        rerender();

        firePointerDown(result, 100, 100);
        fireWindowPointerEvent('pointerup', 2000, 100);

        // 1024 - 400 - 16; a degenerate box would have allowed 1008
        expect(result.current.style.left).toBe(608);
        expect(JSON.parse(localStorage.getItem('drag-box-key') ?? 'null')).toEqual({
            left: 608,
            bottom: 100,
        });
    });

    it('removes window listeners on unmount even if mid-drag', () => {
        const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

        const {result, unmount} = renderHook(() => useDraggable({storageKey: 'unmount-key'}));

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
        expect(removedEvents).toContain('resize');
    });
});
