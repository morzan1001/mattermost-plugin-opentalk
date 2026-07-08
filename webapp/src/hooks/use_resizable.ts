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
        const base = stored ?? defaultSize;
        return {width: Math.max(base.width, opts.minSize.width), height: base.height};
    });

    // minSize.width is measured after first layout (0 until then). Raise the
    // stored width up to it once it lands, otherwise the size stays pinned at
    // the pre-measurement 0 and the first resize gesture starts from 0.
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSize((cur) => (cur.width < opts.minSize.width ? {...cur, width: opts.minSize.width} : cur));
    }, [opts.minSize.width]);

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

            const handlePointerMove = (ev: MouseEvent) => {
                if (!resizeStartRef.current) {
                    return;
                }

                // Primary button released without a pointerup reaching us:
                // finish instead of resizing forever against the cursor.
                if ((ev.buttons & 1) === 0) {
                    handlePointerUp(ev);
                    return;
                }
                const {pointerX, pointerY, startWidth, startHeight} = resizeStartRef.current;
                const newWidth = startWidth + (ev.pageX - pointerX);
                const newHeight = startHeight + (ev.pageY - pointerY);
                const clamped = clampSize(newWidth, newHeight, opts);
                setSize(clamped);
            };

            onPointerMoveRef.current = handlePointerMove;
            onPointerUpRef.current = handlePointerUp;

            window.addEventListener('pointermove', handlePointerMove);
            window.addEventListener('pointerup', handlePointerUp);
            window.addEventListener('pointercancel', handlePointerUp);
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
