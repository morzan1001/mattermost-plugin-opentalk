import {useEffect, useRef} from 'react';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — webpack inlines this OGG via asset/inline (data: URL)
import incomingCallURL from '../sounds/incoming_call.ogg';

export function useRingtone(): {start: () => void; stop: () => void} {
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Fully dispose the audio element on stop. Just calling pause() leaves
    // the element in the browser's Media Session stack -- a later play-key
    // press on the keyboard or headset then routes to our ringtone instead
    // of resuming whatever the user had playing (Spotify, YouTube, ...).
    const stop = () => {
        const a = audioRef.current;
        if (!a) {
            return;
        }
        a.pause();
        a.currentTime = 0;
        a.removeAttribute('src');
        try {
            a.load();
        } catch {
            // older browsers throw when load() is called on a sourceless
            // element; the goal (dropping the media source) is already met.
        }
        audioRef.current = null;
    };

    const start = () => {
        if (typeof Audio === 'undefined') {
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
            // autoplay denied (no user gesture); the visual modal still
            // alerts the user.
        });
    };

    useEffect(() => {
        return () => {
            stop();
        };
    }, []);

    return {start, stop};
}
