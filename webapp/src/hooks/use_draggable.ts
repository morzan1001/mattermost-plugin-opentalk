import {useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo} from 'react';
import type React from 'react';

export interface DragHandle {
    onPointerDown: (e: React.PointerEvent) => void;
}

export interface UseDraggableResult {
    style: React.CSSProperties;
    handleProps: DragHandle;
    isDragging: boolean;
    nodeRef: React.MutableRefObject<HTMLDivElement | null>;
}

interface Offsets {
    left: number;
    bottom: number;
}

interface Box {
    width: number;
    height: number;
}

interface DragStart {
    pointerX: number;
    pointerY: number;
    startLeft: number;
    startBottom: number;
    box: Box;
}

function readStoredOffsets(storageKey: string): Offsets | null {
    try {
        const raw = localStorage.getItem(storageKey);
        if (raw === null) {
            return null;
        }
        const parsed = JSON.parse(raw) as unknown;
        if (
            parsed !== null &&
            typeof parsed === 'object' &&
            'left' in parsed &&
            'bottom' in parsed &&
            typeof (parsed as Record<string, unknown>).left === 'number' &&
            typeof (parsed as Record<string, unknown>).bottom === 'number' &&
            isFinite((parsed as Offsets).left) &&
            isFinite((parsed as Offsets).bottom)
        ) {
            return {
                left: (parsed as Offsets).left,
                bottom: (parsed as Offsets).bottom,
            };
        }
        return null;
    } catch {
        return null;
    }
}

const MARGIN = 16;

// Keeps the widget's top edge clear of Mattermost's global header.
const HEADER_INSET = 60;

const DEFAULT_OFFSETS: Offsets = {left: MARGIN, bottom: MARGIN};

function clampOffsets(left: number, bottom: number, box: Box): Offsets {
    const maxLeft = window.innerWidth - box.width - MARGIN;
    const maxBottom = window.innerHeight - box.height - HEADER_INSET;

    // Math.max outermost, so a viewport too small for the widget resolves to
    // the bottom-left margin and overflows upward instead of inverting into
    // negative offsets that push the drag handle offscreen.
    return {
        left: Math.max(MARGIN, Math.min(left, maxLeft)),
        bottom: Math.max(MARGIN, Math.min(bottom, maxBottom)),
    };
}

function dragOffsets(ev: MouseEvent, start: DragStart): Offsets {
    // bottom grows upward, so it subtracts the vertical pointer delta.
    return clampOffsets(
        start.startLeft + (ev.pageX - start.pointerX),
        start.startBottom - (ev.pageY - start.pointerY),
        start.box,
    );
}

export function useDraggable(opts: {storageKey: string}): UseDraggableResult {
    const {storageKey} = opts;

    const nodeRef = useRef<HTMLDivElement | null>(null);

    const stored = useMemo(() => readStoredOffsets(storageKey), [storageKey]);

    // Unclamped placeholder: there is no DOM to measure when this runs, and the
    // default corner needs the widget's width.
    const [offsets, setOffsets] = useState<Offsets>(() => stored ?? DEFAULT_OFFSETS);

    // A stored position is already final, so it skips the placement pass.
    const placedRef = useRef(stored !== null);

    const [isDragging, setIsDragging] = useState(false);

    const clampToViewport = useCallback(() => {
        const node = nodeRef.current;
        if (!node) {
            return;
        }
        const box = node.getBoundingClientRect();

        // The default corner is bottom-right, which only becomes computable once
        // the content has laid out; a zero width would pin a bogus box to the edge.
        const place = !placedRef.current && box.width > 0;
        if (place) {
            placedRef.current = true;
        }

        setOffsets((cur) => {
            // This lands exactly on maxLeft, so later content growth slides the
            // widget left and keeps it glued to the right edge.
            const base = place ? {left: window.innerWidth - box.width - MARGIN, bottom: MARGIN} : cur;
            const next = clampOffsets(base.left, base.bottom, box);
            return next.left === cur.left && next.bottom === cur.bottom ? cur : next;
        });
    }, []);

    // No dependency array: the box grows and shrinks with the widget's content,
    // so every render has to re-measure. The equality bail-out above ends the
    // resulting update cycle.
    useLayoutEffect(clampToViewport);

    useEffect(() => {
        window.addEventListener('resize', clampToViewport);
        return () => {
            window.removeEventListener('resize', clampToViewport);
        };
    }, [clampToViewport]);

    const dragStartRef = useRef<DragStart | null>(null);

    const onPointerMoveRef = useRef<((e: MouseEvent) => void) | null>(null);
    const onPointerUpRef = useRef<((e: MouseEvent) => void) | null>(null);

    const removeWindowListeners = useCallback(() => {
        if (onPointerMoveRef.current) {
            window.removeEventListener('pointermove', onPointerMoveRef.current);
            onPointerMoveRef.current = null;
        }
        if (onPointerUpRef.current) {
            window.removeEventListener('pointerup', onPointerUpRef.current);
            window.removeEventListener('pointercancel', onPointerUpRef.current);
            onPointerUpRef.current = null;
        }
    }, []);

    useEffect(() => {
        return () => {
            removeWindowListeners();
        };
    }, [removeWindowListeners]);

    const onPointerDown = useCallback(
        (e: React.PointerEvent) => {
            const startPointerX = e.pageX;
            const startPointerY = e.pageY;

            // The widget cannot resize mid-drag, so measure once instead of
            // forcing a layout on every pointermove.
            const rect = nodeRef.current?.getBoundingClientRect();
            const box: Box = {width: rect?.width ?? 0, height: rect?.height ?? 0};

            // Functional update lets us read the current offsets without
            // adding them to the useCallback dep list.
            setOffsets((current) => {
                dragStartRef.current = {
                    pointerX: startPointerX,
                    pointerY: startPointerY,
                    startLeft: current.left,
                    startBottom: current.bottom,
                    box,
                };
                return current; // no change
            });

            setIsDragging(true);

            const handlePointerUp = (ev: MouseEvent) => {
                if (!dragStartRef.current) {
                    return;
                }
                const clamped = dragOffsets(ev, dragStartRef.current);
                setOffsets(clamped);
                setIsDragging(false);
                dragStartRef.current = null;

                try {
                    localStorage.setItem(storageKey, JSON.stringify(clamped));
                } catch {
                    // Storage may be unavailable — silently ignore
                }

                removeWindowListeners();
            };

            const handlePointerMove = (ev: MouseEvent) => {
                if (!dragStartRef.current) {
                    return;
                }

                // The primary button was released without a pointerup reaching
                // us (released outside the window, or the event was dropped);
                // finish the drag instead of sticking to the cursor.
                if ((ev.buttons & 1) === 0) {
                    handlePointerUp(ev);
                    return;
                }
                setOffsets(dragOffsets(ev, dragStartRef.current));
            };

            onPointerMoveRef.current = handlePointerMove;
            onPointerUpRef.current = handlePointerUp;

            window.addEventListener('pointermove', handlePointerMove);
            window.addEventListener('pointerup', handlePointerUp);
            window.addEventListener('pointercancel', handlePointerUp);
        },
        [storageKey, removeWindowListeners],
    );

    const style: React.CSSProperties = {
        position: 'fixed' as const,
        left: offsets.left,
        bottom: offsets.bottom,
    };

    const handleProps: DragHandle = {onPointerDown};

    return {style, handleProps, isDragging, nodeRef};
}
