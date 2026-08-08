import React from 'react';
import {useSelector} from 'react-redux';

import {ParticipantTile} from './participant_tile';

import {useGridDimensions} from '../../hooks/use_grid_dimensions';
import {useT} from '../../util/i18n';
import {selectParticipantOrder} from '../../util/selectors';

export const GridLayout: React.FC = () => {
    const t = useT();
    const order = useSelector(selectParticipantOrder);
    const {containerRef, fit} = useGridDimensions(order.length);

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
            ref={containerRef}
            data-testid='grid-layout'
            style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${fit.columns}, ${fit.tileWidth}px)`,
                gap: 8,
                padding: 16,
                width: '100%',
                height: '100%',
                alignContent: 'center',
                justifyContent: 'center',
                boxSizing: 'border-box',
                overflow: 'hidden',
            }}
        >
            {order.map((id: string) => (
                <ParticipantTile
                    key={id}
                    participantId={id}
                    width={fit.tileWidth}
                    height={fit.tileHeight}
                />
            ))}
        </div>
    );
};

export default GridLayout;
