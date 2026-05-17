import React from 'react';
import {useSelector} from 'react-redux';

import {ParticipantTile} from './participant_tile';

import {useT} from '../../util/i18n';
import {selectParticipantOrder, selectParticipantsById, selectActiveSpeakers} from '../../util/selectors';

export const SpeakerLayout: React.FC = () => {
    const t = useT();
    const order = useSelector(selectParticipantOrder);
    const byId = useSelector(selectParticipantsById);
    const activeSpeakers = useSelector(selectActiveSpeakers);

    if (order.length === 0) {
        return (
            <div
                data-testid='speaker-layout-empty'
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    height: '100%',
                    color: 'rgba(255,255,255,0.5)',
                    fontSize: 14,
                    fontStyle: 'italic',
                }}
            >
                {t({de: 'Niemand im Meeting', en: 'Nobody in the meeting'})}
            </div>
        );
    }

    const activeSpeakerId = activeSpeakers.find((id: string) => byId[id] != null);
    const speakerId: string = activeSpeakerId ?? order[0];

    const otherIds: string[] = order.filter((id: string) => id !== speakerId);

    return (
        <div
            data-testid='speaker-layout'
            style={{display: 'flex', width: '100%', height: '100%', gap: 8, padding: 16, boxSizing: 'border-box'}}
        >
            <div style={{flex: 1, minWidth: 0}}>
                <ParticipantTile
                    participantId={speakerId}
                    width='100%'
                    height='100%'
                />
            </div>
            {otherIds.length > 0 && (
                <div style={{width: 200, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', flexShrink: 0}}>
                    {otherIds.map((id) => (
                        <ParticipantTile
                            key={id}
                            participantId={id}
                            width='100%'
                            height={120}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default SpeakerLayout;
