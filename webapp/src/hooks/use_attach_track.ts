import {type RefObject, useEffect} from 'react';

import * as trackRegistry from '../conference/livekit/track_registry';

// Attaches the registry track for trackId to elRef for the element's lifetime,
// detaching on cleanup. onAttached runs after a successful attach (audio uses it
// to kick off play()); it only fires when both track and element are present.
export function useAttachTrack<E extends HTMLMediaElement>(
    trackId: string,
    elRef: RefObject<E | null>,
    warnLabel: string,
    onAttached?: (el: E) => void,
): void {
    useEffect(() => {
        const track = trackRegistry.get(trackId);
        const el = elRef.current;
        if (!track || !el) {
            return undefined;
        }
        try {
            track.attach(el);
        } catch (e) {
            // eslint-disable-next-line no-console
            console.warn(`[opentalk] ${warnLabel} track.attach failed:`, e);
        }
        onAttached?.(el);
        return () => {
            try {
                track.detach(el);
            } catch (e) {
                /* track might already be detached */
            }
        };
    }, [trackId, elRef, warnLabel, onAttached]);
}
