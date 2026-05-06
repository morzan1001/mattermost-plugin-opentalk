import {useState, useCallback} from 'react';

export type LayoutMode = 'speaker' | 'grid' | 'screen-focus';

const STORAGE_KEY = 'opentalk:layout-mode:v1';

const VALID_MODES: readonly LayoutMode[] = ['speaker', 'grid', 'screen-focus'];

function isValidLayoutMode(value: unknown): value is LayoutMode {
    return typeof value === 'string' && (VALID_MODES as readonly string[]).includes(value);
}

function readStoredMode(): LayoutMode {
    try {
        if (typeof window === 'undefined') {
            return 'speaker';
        }
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw !== null && isValidLayoutMode(raw)) {
            return raw;
        }
    } catch {
        // localStorage may be unavailable — silently ignore
    }
    return 'speaker';
}

/**
 * Persistent layout-mode selection for the Expanded-View.
 * Reads from localStorage on mount; setter persists immediately.
 */
export function useLayoutMode(): [LayoutMode, (mode: LayoutMode) => void] {
    const [mode, setMode] = useState<LayoutMode>(() => readStoredMode());

    const setLayoutMode = useCallback((newMode: LayoutMode) => {
        try {
            localStorage.setItem(STORAGE_KEY, newMode);
        } catch {
            // Storage may be unavailable — silently ignore
        }
        setMode(newMode);
    }, []);

    return [mode, setLayoutMode];
}
