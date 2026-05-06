import {useState, useEffect} from 'react';

function formatDuration(elapsedSec: number): string {
    const hours = Math.floor(elapsedSec / 3600);
    const minutes = Math.floor((elapsedSec % 3600) / 60);
    const seconds = elapsedSec % 60;

    const paddedSec = String(seconds).padStart(2, '0');

    if (hours > 0) {
        const paddedMin = String(minutes).padStart(2, '0');
        return `${hours}:${paddedMin}:${paddedSec}`;
    }

    return `${minutes}:${paddedSec}`;
}

/**
 * Returns the elapsed time since `joinedAt` formatted as M:SS or H:MM:SS,
 * updated every second. Returns '' if `joinedAt` is undefined.
 */
export function useMeetingDuration(joinedAt: number | undefined): string {
    const [now, setNow] = useState<number>(() => Date.now());

    useEffect(() => {
        if (joinedAt === undefined) {
            return undefined;
        }

        const id = setInterval(() => {
            setNow(Date.now());
        }, 1000);

        return () => {
            clearInterval(id);
        };
    }, [joinedAt]);

    if (joinedAt === undefined) {
        return '';
    }

    const elapsedSec = Math.max(0, Math.floor((now - joinedAt) / 1000));
    return formatDuration(elapsedSec);
}
