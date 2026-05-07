import React from 'react';
import {useSelector} from 'react-redux';

import {ParticipantTile} from './participant_tile';

import {useT} from '../../util/i18n';
import {PLUGIN_STATE_KEY} from '../../util/selectors';

const stateKey = PLUGIN_STATE_KEY;

export const SpeakerLayout: React.FC = () => {
    const t = useT();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const order = useSelector((s: any) => s?.[stateKey]?.participants?.order ?? [] as string[]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byId = useSelector((s: any) => s?.[stateKey]?.participants?.byId ?? {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activeSpeakers = useSelector((s: any) => s?.[stateKey]?.tracks?.activeSpeakers ?? [] as string[]);

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

    // Choose speakerId: first active speaker that exists in byId, else order[0]
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
