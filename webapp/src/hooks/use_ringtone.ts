import {useRef, useEffect} from 'react';

interface ActiveSession {
    osc: OscillatorNode;
    gain: GainNode;
    interval: number;
}

export function useRingtone(): {start: () => void; stop: () => void} {
    const ctxRef = useRef<AudioContext | null>(null);
    const sessionRef = useRef<ActiveSession | null>(null);

    const stop = () => {
        if (!sessionRef.current) {
            return;
        }
        const {osc, gain, interval} = sessionRef.current;
        const ctx = ctxRef.current!;

        clearInterval(interval);

        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.08);

        setTimeout(() => {
            try {
                osc.stop();
                osc.disconnect();
                gain.disconnect();
            } catch {
                // already stopped — silently ignore
            }
        }, 100);

        sessionRef.current = null;
    };

    const start = () => {
        if (sessionRef.current) {
            return;
        }

        // Lazy-create AudioContext
        if (!ctxRef.current) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            ctxRef.current = new AudioContextClass() as AudioContext;
        }
        const ctx = ctxRef.current;

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 700;

        const gain = ctx.createGain();
        gain.gain.value = 0.15;

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();

        const interval = window.setInterval(() => {
            if (sessionRef.current) {
                const currentFreq = sessionRef.current.osc.frequency.value;
                sessionRef.current.osc.frequency.value = currentFreq === 700 ? 600 : 700;
            }
        }, 500);

        sessionRef.current = {osc, gain, interval};
    };

    useEffect(() => {
        return () => {
            stop();
        };

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return {start, stop};
}
