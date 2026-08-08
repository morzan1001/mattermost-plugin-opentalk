import {useCallback, useEffect, useRef, useState} from 'react';

export function useAutoHide(enabled: boolean, idleMs = 4000): {
    visible: boolean;
    holdProps: {onPointerEnter: () => void; onPointerLeave: () => void};
} {
    const [hidden, setHidden] = useState(false);
    const heldRef = useRef(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const wasEnabledRef = useRef(enabled);

    const arm = useCallback(() => {
        if (timerRef.current !== null) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }

        // Reset before the held guard below, so a held re-enable still clears stale hidden state.
        if (enabled && !wasEnabledRef.current) {
            setHidden(false);
        }
        wasEnabledRef.current = enabled;
        if (!enabled || heldRef.current) {
            return;
        }
        timerRef.current = setTimeout(() => setHidden(true), idleMs);
    }, [enabled, idleMs]);

    useEffect(() => {
        if (!enabled) {
            wasEnabledRef.current = false;
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

    const onPointerEnter = useCallback(() => {
        heldRef.current = true;
        setHidden(false);
        arm();
    }, [arm]);

    const onPointerLeave = useCallback(() => {
        heldRef.current = false;
        arm();
    }, [arm]);

    // Derived rather than stored: disabling shows the chrome immediately, and arm()
    // above resets `hidden` on re-enable so a stale hidden state doesn't carry over.
    return {visible: !enabled || !hidden, holdProps: {onPointerEnter, onPointerLeave}};
}
