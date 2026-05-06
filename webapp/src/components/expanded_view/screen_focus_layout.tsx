import React from 'react';
import {useSelector} from 'react-redux';

import {GridLayout} from './grid_layout';
import {ParticipantTile} from './participant_tile';

const stateKey = 'plugins-de.opentalk.mattermost-plugin';

export const ScreenFocusLayout: React.FC = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const order = useSelector((s: any) => s?.[stateKey]?.participants?.order ?? [] as string[]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const perParticipant = useSelector((s: any) => s?.[stateKey]?.tracks?.perParticipant ?? {});

    // Find first participant in order with a screenTrackId
    const screenSharerId: string | undefined = order.find(
        (id: string) => Boolean(perParticipant[id]?.screenTrackId),
    );

    // No screen share active — fall back to GridLayout
    if (screenSharerId === undefined) {
        return <GridLayout/>;
    }

    const screenTrackId: string = perParticipant[screenSharerId].screenTrackId;

    return (
        <div
            data-testid='screen-focus-layout'
            style={{display: 'flex', width: '100%', height: '100%', gap: 8, padding: 16, boxSizing: 'border-box'}}
        >
            <div style={{flex: 1, minWidth: 0}}>
                <ParticipantTile
                    participantId={screenSharerId}
                    overrideTrackId={screenTrackId}
                    width='100%'
                    height='100%'
                />
            </div>
            <div style={{width: 200, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', flexShrink: 0}}>
                {order.map((id: string) => (
                    <ParticipantTile
                        key={id}
                        participantId={id}
                        width='100%'
                        height={120}
                    />
                ))}
            </div>
        </div>
    );
};

export default ScreenFocusLayout;
