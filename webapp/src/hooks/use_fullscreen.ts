import {useCallback, useEffect, useState} from 'react';
import type React from 'react';

export function useFullscreen(targetRef: React.RefObject<HTMLElement | null>): {isFullscreen: boolean; toggle: () => void} {
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
        const onChange = () => setIsFullscreen(document.fullscreenElement !== null);
        document.addEventListener('fullscreenchange', onChange);
        return () => document.removeEventListener('fullscreenchange', onChange);
    }, []);

    const toggle = useCallback(() => {
        if (document.fullscreenElement) {
            document.exitFullscreen();
            return;
        }

        // Browsers reject this outside a user gesture; the caller is a click handler.
        targetRef.current?.requestFullscreen();
    }, [targetRef]);

    return {isFullscreen, toggle};
}
