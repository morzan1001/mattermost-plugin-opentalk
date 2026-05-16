import React, {useEffect, useMemo, useRef} from 'react';
import {useSelector} from 'react-redux';

import * as trackRegistry from '../../conference/livekit/track_registry';
import {selectTracksPerParticipant, selectActiveSpeakers, selectSessionStatus} from '../../util/selectors';

interface VideoTile {
    participantId: string;
    trackId: string;
    isSpeaking: boolean;
}

const VideoElement: React.FC<{trackId: string}> = ({trackId}) => {
    const elRef = useRef<HTMLVideoElement | null>(null);

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
            console.warn('[opentalk] video track.attach failed:', e);
        }
        return () => {
            try {
                track.detach(el);
            } catch (e) {
                /* swallow */
            }
        };
    }, [trackId]);

    return (
        <video
            ref={elRef}
            autoPlay={true}
            playsInline={true}
            muted={true}
            style={{width: '100%', height: '100%', objectFit: 'cover'}}
        />
    );
};

const VideoGrid: React.FC = () => {
    const tracksByParticipant = useSelector(selectTracksPerParticipant);
    const activeSpeakers = useSelector(selectActiveSpeakers);
    const sessionStatus = useSelector(selectSessionStatus);

    const tiles = useMemo<VideoTile[]>(() => {
        const list: VideoTile[] = [];
        for (const [participantId, t] of Object.entries(tracksByParticipant)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const trackId = (t as any).videoTrackId;
            if (trackId) {
                list.push({
                    participantId,
                    trackId,
                    isSpeaking: activeSpeakers.includes(participantId),
                });
            }
        }
        return list;
    }, [tracksByParticipant, activeSpeakers]);

    if (sessionStatus !== 'connected' || tiles.length === 0) {
        return null;
    }

    return (
        <div
            className='opentalk-video-grid'
            style={{
                position: 'fixed',
                bottom: 80,
                right: 12,
                display: 'grid',
                gridTemplateColumns: tiles.length === 1 ? '320px' : 'repeat(2, 200px)',
                gap: 8,
                zIndex: 9998,
            }}
        >
            {tiles.map((tile) => (
                <div
                    key={tile.trackId}
                    className={'opentalk-video-grid__tile' + (tile.isSpeaking ? ' opentalk-video-grid__tile--speaking' : '')}
                    style={{
                        position: 'relative',
                        background: '#222',
                        borderRadius: 8,
                        overflow: 'hidden',
                        aspectRatio: '16 / 9',
                        border: tile.isSpeaking ? '2px solid #6cf' : '2px solid transparent',
                    }}
                >
                    <VideoElement trackId={tile.trackId}/>
                    <div
                        className='opentalk-video-grid__name'
                        style={{
                            position: 'absolute',
                            bottom: 4,
                            left: 8,
                            fontSize: 12,
                            background: 'rgba(0,0,0,0.6)',
                            color: 'white',
                            padding: '2px 6px',
                            borderRadius: 4,
                        }}
                    >
                        {tile.participantId}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default VideoGrid;
