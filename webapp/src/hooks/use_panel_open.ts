import {useState, useCallback} from 'react';

const STORAGE_KEY = 'opentalk:panel-open:v1';

function readStoredOpen(): boolean {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === 'true' || raw === 'false') {
            return raw === 'true';
        }
    } catch {
        // localStorage unavailable
    }
    return true;
}

export function usePanelOpen(): [boolean, (open: boolean) => void] {
    const [open, setOpen] = useState<boolean>(() => readStoredOpen());

    const setPanelOpen = useCallback((next: boolean) => {
        try {
            localStorage.setItem(STORAGE_KEY, String(next));
        } catch {
            // Storage may be unavailable — silently ignore
        }
        setOpen(next);
    }, []);

    return [open, setPanelOpen];
}
