import {useState, useRef, useCallback, useEffect} from 'react';
import type React from 'react';

export interface DragHandle {
    onPointerDown: (e: React.PointerEvent) => void;
}

export interface UseDraggableResult {
    style: React.CSSProperties;
    handleProps: DragHandle;
    isDragging: boolean;
}

interface Position {
    x: number;
    y: number;
}

function readStoredPosition(storageKey: string): Position | null {
    try {
        const raw = localStorage.getItem(storageKey);
        if (raw === null) {
            return null;
        }
        const parsed = JSON.parse(raw) as unknown;
        if (
            parsed !== null &&
            typeof parsed === 'object' &&
            'x' in parsed &&
            'y' in parsed &&
            typeof (parsed as Record<string, unknown>).x === 'number' &&
            typeof (parsed as Record<string, unknown>).y === 'number' &&
            isFinite((parsed as {x: number; y: number}).x) &&
            isFinite((parsed as {x: number; y: number}).y)
        ) {
            return {
                x: (parsed as {x: number; y: number}).x,
                y: (parsed as {x: number; y: number}).y,
            };
        }
        return null;
    } catch {
        return null;
    }
}

const MARGIN = 16;

function clampPosition(x: number, y: number): Position {
    const clampedX = Math.min(Math.max(x, MARGIN), window.innerWidth - MARGIN);
    const clampedY = Math.min(Math.max(y, MARGIN), window.innerHeight - MARGIN);
    return {x: clampedX, y: clampedY};
}

export function useDraggable(opts: {
    storageKey: string;
    defaultPosition: Position;
}): UseDraggableResult {
    const {storageKey, defaultPosition} = opts;

    const [position, setPosition] = useState<Position>(() => {
        const stored = readStoredPosition(storageKey);
        return stored ?? defaultPosition;
    });

    const [isDragging, setIsDragging] = useState(false);

    const dragStartRef = useRef<{
        pointerX: number;
        pointerY: number;
        widgetX: number;
        widgetY: number;
    } | null>(null);

    const onPointerMoveRef = useRef<((e: MouseEvent) => void) | null>(null);
    const onPointerUpRef = useRef<((e: MouseEvent) => void) | null>(null);

    const removeWindowListeners = useCallback(() => {
        if (onPointerMoveRef.current) {
            window.removeEventListener('pointermove', onPointerMoveRef.current);
            onPointerMoveRef.current = null;
        }
        if (onPointerUpRef.current) {
            window.removeEventListener('pointerup', onPointerUpRef.current);
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

            // Functional update lets us read the current position without
            // adding it to the useCallback dep list.
            setPosition((current) => {
                dragStartRef.current = {
                    pointerX: startPointerX,
                    pointerY: startPointerY,
                    widgetX: current.x,
                    widgetY: current.y,
                };
                return current; // no change
            });

            setIsDragging(true);

            const handlePointerMove = (ev: MouseEvent) => {
                if (!dragStartRef.current) {
                    return;
                }
                const {pointerX, pointerY, widgetX, widgetY} = dragStartRef.current;
                const newX = widgetX + (ev.pageX - pointerX);
                const newY = widgetY + (ev.pageY - pointerY);
                const clamped = clampPosition(newX, newY);
                setPosition(clamped);
            };

            const handlePointerUp = (ev: MouseEvent) => {
                if (!dragStartRef.current) {
                    return;
                }
                const {pointerX, pointerY, widgetX, widgetY} = dragStartRef.current;
                const newX = widgetX + (ev.pageX - pointerX);
                const newY = widgetY + (ev.pageY - pointerY);
                const clamped = clampPosition(newX, newY);
                setPosition(clamped);
                setIsDragging(false);
                dragStartRef.current = null;

                try {
                    localStorage.setItem(storageKey, JSON.stringify(clamped));
                } catch {
                    // Storage may be unavailable — silently ignore
                }

                removeWindowListeners();
            };

            onPointerMoveRef.current = handlePointerMove;
            onPointerUpRef.current = handlePointerUp;

            window.addEventListener('pointermove', handlePointerMove);
            window.addEventListener('pointerup', handlePointerUp);
        },
        [storageKey, removeWindowListeners],
    );

    const style: React.CSSProperties = {
        position: 'fixed' as const,
        left: position.x,
        top: position.y,
    };

    const handleProps: DragHandle = {onPointerDown};

    return {style, handleProps, isDragging};
}
