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
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            document.exitFullscreen();
            return;
        }

        // Browsers reject this outside a user gesture; the caller is a click handler.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        targetRef.current?.requestFullscreen();
    }, [targetRef]);

    return {isFullscreen, toggle};
}
