import React, {useEffect, useRef} from 'react';
import {useSelector} from 'react-redux';

import * as trackRegistry from '../../conference/livekit/track_registry';
import {PLUGIN_STATE_KEY} from '../../util/selectors';

const stateKey = PLUGIN_STATE_KEY;

function initialsOf(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return (parts[0]?.slice(0, 2) ?? '').toUpperCase();
}

const VideoTileInner: React.FC<{trackId: string; participantId: string}> = ({trackId, participantId}) => {
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
            console.warn('[opentalk] participant tile video track.attach failed:', e);
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const participant = useSelector((s: any) => s?.[stateKey]?.participants?.byId?.[participantId]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const perParticipant = useSelector((s: any) => s?.[stateKey]?.tracks?.perParticipant ?? {});

    const sliceTrackId: string | undefined = perParticipant[participantId]?.videoTrackId;
    const trackId = overrideTrackId ?? sliceTrackId;

    const hasRegistryTrack = trackId != null && trackRegistry.get(trackId) != null;
    const showVideo = trackId != null && hasRegistryTrack;

    const displayName: string = participant?.displayName ?? '';
    const isSpeaking = participant?.isSpeaking === true;

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

    return (
        <div
            data-testid={`participant-tile-${participantId}`}
            data-speaking={isSpeaking ? 'true' : undefined}
            style={rootStyle}
        >
            {showVideo ? (
                <VideoTileInner
                    trackId={trackId}
                    participantId={participantId}
                />
            ) : (
                initialsOf(displayName || participantId.slice(0, 8))
            )}
            <span style={labelStyle}>{displayName || participantId.slice(0, 8)}</span>
        </div>
    );
};

export default ParticipantTile;
