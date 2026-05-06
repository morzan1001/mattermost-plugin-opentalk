import React from 'react';
import {useSelector} from 'react-redux';

import {ParticipantTile} from './participant_tile';

const stateKey = 'plugins-de.opentalk.mattermost-plugin';

export const GridLayout: React.FC = () => {
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
                {'Niemand im Meeting'}
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
