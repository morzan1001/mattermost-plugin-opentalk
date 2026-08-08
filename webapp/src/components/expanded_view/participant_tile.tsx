import React, {useRef, useState} from 'react';
import {useDispatch, useSelector} from 'react-redux';

import * as trackRegistry from '../../conference/livekit/track_registry';
import {useAttachTrack} from '../../hooks/use_attach_track';
import {setPinnedParticipant} from '../../store/slice_session';
import {useT} from '../../util/i18n';
import {selectParticipantsById, selectPinnedParticipantId, selectTracksPerParticipant} from '../../util/selectors';
import {CrownIcon, HandIcon, MicOffIcon, PinIcon, PinOffIcon} from '../icons';
import {ParticipantMenu} from '../participant_menu/component';

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

const VideoTileInner: React.FC<{trackId: string; participantId: string}> = ({trackId, participantId}) => {
    const elRef = useRef<HTMLVideoElement | null>(null);
    useAttachTrack(trackId, elRef, 'participant tile video');

    return (
        <video
            ref={elRef}
            autoPlay={true}
            playsInline={true}
            muted={true}
            data-testid={`participant-tile-video-${participantId}`}
            style={{width: '100%', height: '100%', objectFit: 'cover'}}
        />
    );
};

export interface ParticipantTileProps {
    participantId: string;

    /** Override the tile's video-track id (e.g. force screen-track in screen-focus layout).
        Defaults to videoTrackId from the tracks slice for this participant. */
    overrideTrackId?: string;
    width: number | string;
    height: number | string;
}

export const ParticipantTile: React.FC<ParticipantTileProps> = ({participantId, overrideTrackId, width, height}) => {
    const byId = useSelector(selectParticipantsById);
    const participant = byId[participantId];
    const perParticipant = useSelector(selectTracksPerParticipant);

    const sliceTrackId: string | undefined = perParticipant[participantId]?.videoTrackId;
    const trackId = overrideTrackId ?? sliceTrackId;

    const hasRegistryTrack = trackId != null && trackRegistry.get(trackId) != null;
    const showVideo = trackId != null && hasRegistryTrack;

    const displayName: string = participant?.displayName ?? '';
    const isSpeaking = participant?.isSpeaking === true;
    const isMuted = participant?.muted === true;
    const handRaised = participant?.handRaised === true;
    const isModerator = participant?.role === 'moderator' || participant?.isHost === true;

    const [hovered, setHovered] = useState(false);
    const showLabel = hovered || isMuted;

    const t = useT();
    const dispatch = useDispatch();
    const pinnedId = useSelector(selectPinnedParticipantId);
    const isPinned = pinnedId === participantId;

    const speakingStyle: React.CSSProperties = isSpeaking ? {outline: '2px solid #00B59C', outlineOffset: 1} : {};

    const rootStyle: React.CSSProperties = {
        width,
        height,
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
        ...speakingStyle,
    };

    const labelStyle: React.CSSProperties = {
        position: 'absolute',
        bottom: 2,
        left: 4,
        right: 4,
        fontSize: 13,
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

    return (
        <div
            data-testid={`participant-tile-${participantId}`}
            data-speaking={isSpeaking ? 'true' : undefined}
            style={rootStyle}
            onPointerEnter={() => setHovered(true)}
            onPointerLeave={() => setHovered(false)}
        >
            {showVideo ? (
                <VideoTileInner
                    trackId={trackId}
                    participantId={participantId}
                />
            ) : (
                initialsOf(displayName || participantId.slice(0, 8))
            )}
            {(isMuted || handRaised || isModerator) && (
                <div
                    style={{
                        position: 'absolute',
                        top: 4,
                        left: 4,
                        display: 'flex',
                        gap: 4,
                    }}
                >
                    {isMuted && (
                        <span
                            data-testid={`participant-tile-muted-${participantId}`}
                            style={{display: 'flex', padding: 5, borderRadius: 4, background: 'rgba(227,53,76,0.85)', color: 'white', lineHeight: 0}}
                        >
                            <MicOffIcon/>
                        </span>
                    )}
                    {handRaised && (
                        <span
                            style={{display: 'flex', padding: 5, borderRadius: 4, background: 'rgba(0,181,156,0.85)', color: 'white', lineHeight: 0}}
                        >
                            <HandIcon size={18}/>
                        </span>
                    )}
                    {isModerator && (
                        <span
                            data-testid={`participant-tile-moderator-${participantId}`}
                            style={{display: 'flex', padding: 5, borderRadius: 4, background: 'rgba(255,184,0,0.85)', color: 'white', lineHeight: 0}}
                        >
                            <CrownIcon size={18}/>
                        </span>
                    )}
                </div>
            )}
            <ParticipantMenu participantId={participantId}/>
            <button
                type='button'
                data-testid={`participant-tile-pin-${participantId}`}
                onClick={() => dispatch(setPinnedParticipant(isPinned ? null : participantId))}
                title={isPinned ? t({de: 'Anheftung lösen', en: 'Unpin'}) : t({de: 'Für mich anheften', en: 'Pin for me'})}
                aria-label={isPinned ? t({de: 'Anheftung lösen', en: 'Unpin'}) : t({de: 'Für mich anheften', en: 'Pin for me'})}
                style={{
                    position: 'absolute',
                    top: 4,
                    right: 32,
                    display: 'flex',
                    padding: 4,
                    borderRadius: 4,
                    border: 'none',
                    background: isPinned ? 'rgba(0,181,156,0.85)' : 'rgba(0,0,0,0.5)',
                    color: 'white',
                    cursor: 'pointer',
                    lineHeight: 0,
                }}
            >
                {isPinned ? <PinOffIcon size={16}/> : <PinIcon size={16}/>}
            </button>
            {showLabel && <span style={labelStyle}>{displayName || participantId.slice(0, 8)}</span>}
        </div>
    );
};

export default ParticipantTile;
