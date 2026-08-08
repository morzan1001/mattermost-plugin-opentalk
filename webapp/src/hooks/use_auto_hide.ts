import {useCallback, useEffect, useRef, useState} from 'react';

export function useAutoHide(enabled: boolean, idleMs = 4000): {
    visible: boolean;
    holdProps: {onPointerEnter: () => void; onPointerLeave: () => void};
} {
    const [hidden, setHidden] = useState(false);
    const heldRef = useRef(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const arm = useCallback(() => {
        if (timerRef.current !== null) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        if (!enabled || heldRef.current) {
            return;
        }
        timerRef.current = setTimeout(() => setHidden(true), idleMs);
    }, [enabled, idleMs]);

    useEffect(() => {
        if (!enabled) {
            return undefined;
        }
        const onActivity = () => {
            setHidden(false);
            arm();
        };
        window.addEventListener('pointermove', onActivity);
        window.addEventListener('keydown', onActivity);
        arm();
        return () => {
            window.removeEventListener('pointermove', onActivity);
            window.removeEventListener('keydown', onActivity);
            if (timerRef.current !== null) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [enabled, arm]);

    // A held element can unmount while the pointer rests on it (the control bar's Minimize
    // button), and React fires no pointer-leave for an unmounted node. Keyed on `enabled`
    // alone so an idleMs change cannot drop a live hold.
    useEffect(() => {
        if (!enabled) {
            return undefined;
        }
        return () => {
            heldRef.current = false;
            setHidden(false);
        };
    }, [enabled]);

    const onPointerEnter = useCallback(() => {
        heldRef.current = true;
        setHidden(false);
        arm();
    }, [arm]);

    const onPointerLeave = useCallback(() => {
        heldRef.current = false;
        arm();
    }, [arm]);

    // Derived rather than stored: disabling shows the chrome immediately, and the reset
    // effect above clears `hidden` on the way out so no stale state reaches the next call.
    return {visible: !enabled || !hidden, holdProps: {onPointerEnter, onPointerLeave}};
}
