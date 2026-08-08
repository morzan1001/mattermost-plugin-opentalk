import React from 'react';
import {useDispatch, useSelector} from 'react-redux';

import {initialsOf} from './participant_tile';

import {setPinnedParticipant} from '../../store/slice_session';
import {useT} from '../../util/i18n';
import {selectLocalParticipantId, selectParticipantOrder, selectParticipantsById, selectPinnedParticipantId} from '../../util/selectors';
import {CrownIcon, HandIcon, MicOffIcon} from '../icons';
import {ParticipantMenu} from '../participant_menu/component';

const badgeStyle: React.CSSProperties = {display: 'flex', lineHeight: 0, opacity: 0.85};

const avatarStyle: React.CSSProperties = {
    width: 28,
    height: 28,
    flexShrink: 0,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.12)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 600,
};

const nameStyle: React.CSSProperties = {
    flex: 1,
    fontSize: 13,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
};

const ParticipantRow: React.FC<{participantId: string}> = ({participantId}) => {
    const t = useT();
    const dispatch = useDispatch();
    const byId = useSelector(selectParticipantsById);
    const localParticipantId = useSelector(selectLocalParticipantId);
    const pinnedId = useSelector(selectPinnedParticipantId);

    const participant = byId[participantId];
    const displayName = participant?.displayName ?? participantId.slice(0, 8);
    const isSelf = participantId === localParticipantId;
    const isMuted = participant?.muted === true;
    const handRaised = participant?.handRaised === true;
    const isModerator = participant?.role === 'moderator' || participant?.isHost === true;
    const isSpeaking = participant?.isSpeaking === true;
    const label = isSelf ? `${displayName} (${t({de: 'Du', en: 'You'})})` : displayName;
    const isPinned = pinnedId === participantId;
    const togglePin = () => dispatch(setPinnedParticipant(isPinned ? null : participantId));

    return (
        <div
            data-testid={`participant-row-${participantId}`}
            role='button'
            tabIndex={0}
            onClick={togglePin}
            onKeyDown={(e) => {
                // The row wraps the moderation menu's own button; only act on keys aimed at the row itself.
                if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) {
                    return;
                }
                e.preventDefault();
                togglePin();
            }}
            style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 32px 6px 10px',
                cursor: 'pointer',
                background: isPinned ? 'rgba(255,255,255,0.10)' : 'transparent',
            }}
        >
            <span style={avatarStyle}>{initialsOf(displayName)}</span>
            <span style={nameStyle}>{label}</span>
            {isSpeaking && (
                <span
                    data-testid={`participant-row-speaking-${participantId}`}
                    style={{width: 6, height: 6, flexShrink: 0, borderRadius: '50%', background: '#00B59C'}}
                />
            )}
            {isMuted && (
                <span
                    data-testid={`participant-row-muted-${participantId}`}
                    style={badgeStyle}
                >
                    <MicOffIcon size={14}/>
                </span>
            )}
            {handRaised && (
                <span
                    data-testid={`participant-row-hand-${participantId}`}
                    style={badgeStyle}
                >
                    <HandIcon size={14}/>
                </span>
            )}
            {isModerator && (
                <span
                    data-testid={`participant-row-moderator-${participantId}`}
                    style={badgeStyle}
                >
                    <CrownIcon size={14}/>
                </span>
            )}
            <span onClick={(e) => e.stopPropagation()}>
                <ParticipantMenu participantId={participantId}/>
            </span>
        </div>
    );
};

export const ParticipantPanel: React.FC = () => {
    const order = useSelector(selectParticipantOrder);

    return (
        <div
            data-testid='participant-panel'
            style={{
                width: 260,
                flexShrink: 0,
                overflowY: 'auto',
                background: 'rgba(255,255,255,0.04)',
                borderLeft: '1px solid rgba(255,255,255,0.08)',
            }}
        >
            {order.map((id) => (
                <ParticipantRow
                    key={id}
                    participantId={id}
                />
            ))}
        </div>
    );
};

export default ParticipantPanel;
