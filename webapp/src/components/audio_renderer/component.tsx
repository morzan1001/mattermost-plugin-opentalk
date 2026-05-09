import React, {useEffect, useMemo, useRef} from 'react';
import {useSelector} from 'react-redux';

import * as trackRegistry from '../../conference/livekit/track_registry';
import {PLUGIN_STATE_KEY, selectSessionStatus} from '../../util/selectors';

const stateKey = PLUGIN_STATE_KEY;

interface RemoteAudio {
    participantId: string;
    trackId: string;
}

const AudioElement: React.FC<{trackId: string}> = ({trackId}) => {
    const elRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        const track = trackRegistry.get(trackId);
        const el = elRef.current;
        if (!track || !el) {
            return;
        }
        try {
            track.attach(el);
        } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('[opentalk] track.attach failed:', e);
        }
        return () => {
            try {
                track.detach(el);
            } catch (e) {
                /* track might already be detached */
            }
        };
    }, [trackId]);

    return (<audio
        ref={elRef}
        autoPlay={true}
    />);
};

const AudioRenderer: React.FC = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tracksByParticipant = useSelector((s: any) => s[stateKey]?.tracks?.perParticipant ?? {});
    const sessionStatus = useSelector(selectSessionStatus);

    const audioTracks = useMemo<RemoteAudio[]>(() => {
        const list: RemoteAudio[] = [];
        for (const [participantId, t] of Object.entries(tracksByParticipant)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const track = (t as any).audioTrackId;
            if (track) {
                list.push({participantId, trackId: track});
            }
        }
        return list;
    }, [tracksByParticipant]);

    if (sessionStatus !== 'connected') {
        return null;
    }
    return (
        <div
            className='opentalk-audio-renderer'
            style={{display: 'none'}}
        >
            {audioTracks.map((a) => (
                <AudioElement
                    key={a.trackId}
                    trackId={a.trackId}
                />
            ))}
        </div>
    );
};

export default AudioRenderer;
