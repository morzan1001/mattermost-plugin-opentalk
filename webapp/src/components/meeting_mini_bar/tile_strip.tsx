import React, {useEffect, useRef} from 'react';
import {useSelector} from 'react-redux';

import * as trackRegistry from '../../conference/livekit/track_registry';
import type {ParticipantInfo} from '../../store/slice_participants';

const stateKey = 'plugins-de.opentalk.mattermost-plugin';

const MAX_VISIBLE = 4;

const tileStyle: React.CSSProperties = {
    width: 36,
    height: 36,
    borderRadius: 8,
    overflow: 'hidden',
    background: 'rgba(255,255,255,0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    fontSize: 13,
    fontWeight: 600,
    color: 'white',
};

const badgeStyle: React.CSSProperties = {
    ...tileStyle,
    background: 'rgba(255,255,255,0.16)',
};

function initialsOf(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return (parts[0]?.slice(0, 2) ?? '').toUpperCase();
}

const VideoTile: React.FC<{trackId: string; participantId: string}> = ({trackId, participantId}) => {
    const elRef = useRef<HTMLVideoElement | null>(null);

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
            console.warn('[opentalk] tile video track.attach failed:', e);
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
            data-testid={`tile-video-${participantId}`}
            style={{width: '100%', height: '100%', objectFit: 'cover'}}
        />
    );
};

const Tile: React.FC<{participant: ParticipantInfo; videoTrackId?: string}> = ({participant, videoTrackId}) => {
    const isSpeaking = participant.isSpeaking === true;

    const hasRegistryTrack = videoTrackId != null && trackRegistry.get(videoTrackId) != null;
    const showVideo = videoTrackId != null && hasRegistryTrack;

    const speakingStyle: React.CSSProperties = isSpeaking ? {outline: '2px solid #00B59C', outlineOffset: 1} : {};

    return (
        <div
            data-testid={`tile-${participant.id}`}
            data-speaking={isSpeaking ? 'true' : undefined}
            style={{...tileStyle, ...speakingStyle}}
        >
            {showVideo ? (
                <VideoTile
                    trackId={videoTrackId}
                    participantId={participant.id}
                />
            ) : (
                initialsOf(participant.displayName)
            )}
        </div>
    );
};

export const TileStrip: React.FC = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const order = useSelector((s: any) => s[stateKey]?.participants?.order ?? [] as string[]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byId = useSelector((s: any) => s[stateKey]?.participants?.byId ?? {});

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const perParticipant = useSelector((s: any) => s[stateKey]?.tracks?.perParticipant ?? {});

    const total = order.length;

    if (total === 0) {
        return null;
    }

    const overflow = total > MAX_VISIBLE;

    // When overflowing: show MAX_VISIBLE-1 tiles + 1 badge; otherwise show all (up to MAX_VISIBLE)
    const visibleIds: string[] = overflow ? order.slice(0, MAX_VISIBLE - 1) : order.slice(0, MAX_VISIBLE);
    const overflowCount = overflow ? total - (MAX_VISIBLE - 1) : 0;

    return (
        <div
            className='opentalk-tile-strip'
            style={{display: 'flex', gap: 4, alignItems: 'center'}}
        >
            {visibleIds.map((id) => {
                const participant: ParticipantInfo = byId[id];
                if (!participant) {
                    return null;
                }
                const videoTrackId: string | undefined = perParticipant[id]?.videoTrackId;
                return (
                    <Tile
                        key={id}
                        participant={participant}
                        videoTrackId={videoTrackId}
                    />
                );
            })}
            {overflow && (
                <div
                    data-testid='tile-strip-overflow'
                    style={badgeStyle}
                >
                    {`+${overflowCount}`}
                </div>
            )}
        </div>
    );
};

export default TileStrip;
