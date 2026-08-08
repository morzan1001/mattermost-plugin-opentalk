import {useEffect, useLayoutEffect, useRef} from 'react';

import type {LayoutMode} from './use_layout_mode';

export interface CallShortcutHandlers {
    onToggleMic: () => void;
    onToggleCam: () => void;
    onToggleScreen: () => void;
    onToggleHand: () => void;
    onToggleFullscreen: () => void;
    onCollapse: () => void;
    onSetLayout: (mode: LayoutMode) => void;
}

const LAYOUT_KEYS: Record<string, LayoutMode> = {
    1: 'speaker',
    2: 'grid',
    3: 'screen-focus',
};

export function useCallShortcuts(enabled: boolean, handlers: CallShortcutHandlers): void {
    // A ref keeps the listener bound once while still calling the latest handlers.
    // Layout effect: must flush before a keydown, delivered outside React's root, can fire.
    const handlersRef = useRef(handlers);
    useLayoutEffect(() => {
        handlersRef.current = handlers;
    });

    useEffect(() => {
        if (!enabled) {
            return undefined;
        }
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey || e.metaKey || e.altKey) {
                return;
            }
            const h = handlersRef.current;
            const layout = LAYOUT_KEYS[e.key];
            if (layout) {
                h.onSetLayout(layout);
                return;
            }
            switch (e.key.toLowerCase()) {
            case 'm':
                h.onToggleMic();
                break;
            case 'v':
                h.onToggleCam();
                break;
            case 's':
                h.onToggleScreen();
                break;
            case 'h':
                h.onToggleHand();
                break;
            case 'f':
                h.onToggleFullscreen();
                break;
            case 'escape':
                h.onCollapse();
                break;
            default:
                break;
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [enabled]);
}
