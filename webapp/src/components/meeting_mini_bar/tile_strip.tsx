import React, {useEffect, useRef} from 'react';
import {useSelector} from 'react-redux';

import * as trackRegistry from '../../conference/livekit/track_registry';
import type {ParticipantInfo} from '../../store/slice_participants';

const stateKey = 'plugins-de.opentalk.mattermost-plugin';

const MAX_VISIBLE = 4;

const tileStyle: React.CSSProperties = {
    width: 128,
    height: 72,
    borderRadius: 6,
    overflow: 'hidden',
    background: 'rgba(255,255,255,0.08)',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    fontSize: 18,
    fontWeight: 600,
    color: 'white',
};

const tileLabelStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: 2,
    left: 4,
    right: 4,
    fontSize: 11,
    fontWeight: 500,
    color: 'white',
    background: 'rgba(0,0,0,0.5)',
    padding: '1px 5px',
    borderRadius: 3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'center',
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
            <span style={tileLabelStyle}>{participant.displayName || participant.id.slice(0, 8)}</span>
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
        // Diagnostic placeholder: lets us tell at-a-glance whether the
        // participants slice is empty (= controller dispatch issue) vs.
        // the strip is rendering but tiles look wrong.
        return (
            <span
                data-testid='tile-strip-empty'
                style={{
                    fontSize: 11,
                    fontStyle: 'italic',
                    opacity: 0.5,
                    padding: '0 8px',
                }}
            >
                {'(keine Teilnehmer im Slice)'}
            </span>
        );
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
