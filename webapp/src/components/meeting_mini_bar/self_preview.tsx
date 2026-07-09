import React, {useRef} from 'react';
import {useSelector} from 'react-redux';

import {useAttachTrack} from '../../hooks/use_attach_track';
import {selectLocalParticipantId, selectCamEnabled, selectTracksPerParticipant} from '../../util/selectors';

const SelfPreviewInner: React.FC<{trackId: string}> = ({trackId}) => {
    const elRef = useRef<HTMLVideoElement | null>(null);
    useAttachTrack(trackId, elRef, 'self-preview');

    return (
        <video
            ref={elRef}
            autoPlay={true}
            playsInline={true}
            muted={true}
            style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: 'scaleX(-1)',
            }}
        />
    );
};

export const SelfPreview: React.FC = () => {
    const localId = useSelector(selectLocalParticipantId);
    const camEnabled = useSelector(selectCamEnabled);
    const perParticipant = useSelector(selectTracksPerParticipant);
    const trackId: string | undefined = localId ? perParticipant[localId]?.videoTrackId : undefined;

    if (!camEnabled || !trackId) {
        return null;
    }

    return (
        <div
            data-testid='self-preview'
            style={{
                width: 64,
                height: 40,
                borderRadius: 6,
                overflow: 'hidden',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.18)',
                flexShrink: 0,
            }}
        >
            <SelfPreviewInner trackId={trackId}/>
        </div>
    );
};

export default SelfPreview;
