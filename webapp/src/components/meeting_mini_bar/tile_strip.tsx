import React, {useRef} from 'react';
import {useSelector} from 'react-redux';

import * as trackRegistry from '../../conference/livekit/track_registry';
import {useAttachTrack} from '../../hooks/use_attach_track';
import type {ParticipantInfo} from '../../store/slice_participants';
import {selectParticipantOrder, selectParticipantsById, selectTracksPerParticipant, selectLocalParticipantId} from '../../util/selectors';

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

function initialsOf(name: string | undefined): string {
    const safe = (name ?? '').trim();
    if (!safe) {
        return '';
    }
    const parts = safe.split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return (parts[0]?.slice(0, 2) ?? '').toUpperCase();
}

const VideoTile: React.FC<{trackId: string; participantId: string}> = ({trackId, participantId}) => {
    const elRef = useRef<HTMLVideoElement | null>(null);
    useAttachTrack(trackId, elRef, 'tile video');

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
    const allOrder = useSelector(selectParticipantOrder);
    const byId = useSelector(selectParticipantsById);
    const perParticipant = useSelector(selectTracksPerParticipant);
    const localId = useSelector(selectLocalParticipantId);

    const order: string[] = localId ? allOrder.filter((id: string) => id !== localId) : allOrder;
    const total = order.length;

    if (total === 0) {
        return null;
    }

    const overflow = total > MAX_VISIBLE;

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
