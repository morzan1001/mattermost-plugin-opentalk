import React from 'react';
import {useSelector} from 'react-redux';

import {ParticipantTile} from './participant_tile';

import {useT} from '../../util/i18n';
import {PLUGIN_STATE_KEY} from '../../util/selectors';

const stateKey = PLUGIN_STATE_KEY;

export const GridLayout: React.FC = () => {
    const t = useT();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const order = useSelector((s: any) => s?.[stateKey]?.participants?.order ?? [] as string[]);

    if (order.length === 0) {
        return (
            <div
                data-testid='grid-layout-empty'
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

    return (
        <div
            data-testid='grid-layout'
            style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: 8,
                padding: 16,
                width: '100%',
                height: '100%',
                overflow: 'auto',
                boxSizing: 'border-box',
            }}
        >
            {order.map((id: string) => (
                <ParticipantTile
                    key={id}
                    participantId={id}
                    width='100%'
                    height={140}
                />
            ))}
        </div>
    );
};

export default GridLayout;
