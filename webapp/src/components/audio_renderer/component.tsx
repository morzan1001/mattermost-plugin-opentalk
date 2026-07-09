import React, {useCallback, useMemo, useRef, useState} from 'react';
import {useSelector} from 'react-redux';

import {useAttachTrack} from '../../hooks/use_attach_track';
import {useT} from '../../util/i18n';
import {selectSessionStatus, selectTracksPerParticipant} from '../../util/selectors';

interface RemoteAudio {
    participantId: string;
    trackId: string;
}

const AudioElement: React.FC<{trackId: string; onBlocked: () => void}> = ({trackId, onBlocked}) => {
    const elRef = useRef<HTMLAudioElement | null>(null);

    // Autoplay may be blocked until the user interacts with the page; surface
    // a recovery prompt instead of silently having no remote audio.
    // (Promise.resolve guards environments where play() returns undefined.)
    const onAttached = useCallback((el: HTMLAudioElement) => {
        Promise.resolve(el.play()).catch(() => onBlocked());
    }, [onBlocked]);
    useAttachTrack(trackId, elRef, 'audio', onAttached);

    return (
        <audio
            ref={elRef}
            autoPlay={true}
        />
    );
};

const AudioRenderer: React.FC = () => {
    const t = useT();
    const tracksByParticipant = useSelector(selectTracksPerParticipant);
    const sessionStatus = useSelector(selectSessionStatus);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [needsGesture, setNeedsGesture] = useState(false);

    const audioTracks = useMemo<RemoteAudio[]>(() => {
        const list: RemoteAudio[] = [];
        for (const [participantId, tr] of Object.entries(tracksByParticipant)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const track = (tr as any).audioTrackId;
            if (track) {
                list.push({participantId, trackId: track});
            }
        }
        return list;
    }, [tracksByParticipant]);

    if (sessionStatus !== 'connected') {
        return null;
    }

    const enableAudio = () => {
        containerRef.current?.querySelectorAll('audio').forEach((a) => {
            Promise.resolve(a.play()).catch(() => { /* still blocked */ });
        });
        setNeedsGesture(false);
    };

    return (
        <div ref={containerRef}>
            {needsGesture && (
                <button
                    type='button'
                    data-testid='opentalk-enable-audio'
                    onClick={enableAudio}
                    style={{
                        position: 'fixed',
                        top: 60,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        zIndex: 100000,
                        padding: '10px 16px',
                        borderRadius: 8,
                        border: 'none',
                        background: '#00B59C',
                        color: 'white',
                        cursor: 'pointer',
                        fontFamily: 'Inter, system-ui, sans-serif',
                        fontSize: 13,
                        fontWeight: 600,
                        boxShadow: '0 8px 28px rgba(0,0,0,0.4)',
                    }}
                >
                    {t({de: 'Ton aktivieren', en: 'Enable audio'})}
                </button>
            )}
            <div
                className='opentalk-audio-renderer'
                style={{display: 'none'}}
            >
                {audioTracks.map((a) => (
                    <AudioElement
                        key={a.trackId}
                        trackId={a.trackId}
                        onBlocked={() => setNeedsGesture(true)}
                    />
                ))}
            </div>
        </div>
    );
};

export default AudioRenderer;
