import {render, screen} from '@testing-library/react';
import React from 'react';
import {Provider} from 'react-redux';
import {createStore} from 'redux';

import ReconnectingBanner from './component';

import {PLUGIN_STATE_KEY} from '../../util/selectors';

const stateKey = PLUGIN_STATE_KEY;

function makeStore(reconnectAttempt: number) {
    return createStore(() => ({
        [stateKey]: {
            session: {
                status: 'connected',
                reconnectAttempt,
            },
        },
    }));
}

describe('ReconnectingBanner', () => {
    it('returns null while no rejoin is running', () => {
        const {container} = render(
            <Provider store={makeStore(0)}>
                <ReconnectingBanner/>
            </Provider>,
        );
        expect(screen.queryByTestId('reconnecting-banner')).not.toBeInTheDocument();
        expect(container.firstChild).toBeNull();
    });

    it('renders the restoring notice during a rejoin attempt', () => {
        render(
            <Provider store={makeStore(2)}>
                <ReconnectingBanner/>
            </Provider>,
        );
        expect(screen.getByTestId('reconnecting-banner')).toBeInTheDocument();
        expect(screen.getByText('Restoring connection…')).toBeInTheDocument();
    });
});
