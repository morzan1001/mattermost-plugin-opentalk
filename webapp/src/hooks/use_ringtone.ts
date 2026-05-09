import {useEffect, useRef} from 'react';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — webpack inlines this OGG via asset/inline (data: URL)
import incomingCallURL from '../sounds/incoming_call.ogg';

export function useRingtone(): {start: () => void; stop: () => void} {
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const stop = () => {
        const a = audioRef.current;
        if (!a) {
            return;
        }
        a.pause();
        a.currentTime = 0;
    };

    const start = () => {
        if (typeof window === 'undefined' || typeof Audio === 'undefined') {
            return;
        }
        if (!audioRef.current) {
            const a = new Audio(incomingCallURL as string);
            a.loop = true;
            a.volume = 0.6;
            audioRef.current = a;
        }
        const a = audioRef.current;
        a.currentTime = 0;
        a.play().catch(() => {
            // autoplay denied (no user gesture); silent failure is fine —
            // the visual modal still alerts the user.
        });
    };

    useEffect(() => {
        return () => {
            stop();
            audioRef.current = null;
        };
    }, []);

    return {start, stop};
}
