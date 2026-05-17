import {useState, useRef, useCallback, useEffect} from 'react';
import type React from 'react';

export interface ResizeHandle {
    onPointerDown: (e: React.PointerEvent) => void;
}

export interface UseResizableResult {
    style: React.CSSProperties;
    handleProps: ResizeHandle;
    isResizing: boolean;
}

interface Size {
    width: number;
    height: number;
}

interface ResizeOpts {
    storageKey: string;
    defaultSize: Size;
    minSize: Size;
    maxSize?: Size;
}

function readStoredSize(storageKey: string): Size | null {
    try {
        const raw = localStorage.getItem(storageKey);
        if (raw === null) {
            return null;
        }
        const parsed = JSON.parse(raw) as unknown;
        if (
            parsed !== null &&
            typeof parsed === 'object' &&
            'width' in parsed &&
            'height' in parsed &&
            typeof (parsed as Record<string, unknown>).width === 'number' &&
            typeof (parsed as Record<string, unknown>).height === 'number' &&
            isFinite((parsed as {width: number; height: number}).width) &&
            isFinite((parsed as {width: number; height: number}).height)
        ) {
            return {
                width: (parsed as {width: number; height: number}).width,
                height: (parsed as {width: number; height: number}).height,
            };
        }
        return null;
    } catch {
        return null;
    }
}

const VIEWPORT_MARGIN = 32;

function clampSize(width: number, height: number, opts: ResizeOpts): Size {
    const minW = opts.minSize.width;
    const minH = opts.minSize.height;
    const maxW = opts.maxSize ? opts.maxSize.width : window.innerWidth - VIEWPORT_MARGIN;
    const maxH = opts.maxSize ? opts.maxSize.height : window.innerHeight - VIEWPORT_MARGIN;

    return {
        width: Math.min(Math.max(width, minW), maxW),
        height: Math.min(Math.max(height, minH), maxH),
    };
}

export function useResizable(opts: ResizeOpts): UseResizableResult {
    const {storageKey, defaultSize} = opts;

    const [size, setSize] = useState<Size>(() => {
        const stored = readStoredSize(storageKey);
        return stored ?? defaultSize;
    });

    const [isResizing, setIsResizing] = useState(false);

    const resizeStartRef = useRef<{
        pointerX: number;
        pointerY: number;
        startWidth: number;
        startHeight: number;
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

            // Functional update lets us read the current size without
            // adding it to the useCallback dep list.
            setSize((current) => {
                resizeStartRef.current = {
                    pointerX: startPointerX,
                    pointerY: startPointerY,
                    startWidth: current.width,
                    startHeight: current.height,
                };
                return current; // no change
            });

            setIsResizing(true);

            const handlePointerMove = (ev: MouseEvent) => {
                if (!resizeStartRef.current) {
                    return;
                }
                const {pointerX, pointerY, startWidth, startHeight} = resizeStartRef.current;
                const newWidth = startWidth + (ev.pageX - pointerX);
                const newHeight = startHeight + (ev.pageY - pointerY);
                const clamped = clampSize(newWidth, newHeight, opts);
                setSize(clamped);
            };

            const handlePointerUp = (ev: MouseEvent) => {
                if (!resizeStartRef.current) {
                    return;
                }
                const {pointerX, pointerY, startWidth, startHeight} = resizeStartRef.current;
                const newWidth = startWidth + (ev.pageX - pointerX);
                const newHeight = startHeight + (ev.pageY - pointerY);
                const clamped = clampSize(newWidth, newHeight, opts);
                setSize(clamped);
                setIsResizing(false);
                resizeStartRef.current = null;

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
        [storageKey, opts, removeWindowListeners],
    );

    const style: React.CSSProperties = {
        width: size.width,
        height: size.height,
    };

    const handleProps: ResizeHandle = {onPointerDown};

    return {style, handleProps, isResizing};
}
