import {render, screen, fireEvent} from '@testing-library/react';
import React from 'react';
import {Provider} from 'react-redux';
import {createStore} from 'redux';

jest.mock('../../conference/controller', () => ({
    toggleMic: jest.fn().mockResolvedValue(undefined),
    toggleCam: jest.fn().mockResolvedValue(undefined),
    toggleScreenShare: jest.fn().mockResolvedValue(undefined),
    leaveActiveConference: jest.fn().mockResolvedValue(undefined),
    raiseLocalHand: jest.fn(),
    lowerLocalHand: jest.fn(),
}));

import {ControlsBar} from './component';

import {toggleMic} from '../../conference/controller';

const stateKey = 'plugins-com.github.morzan1001.mattermost-plugin-opentalk';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeStore(session: any = {}) {
    return createStore(() => ({
        [stateKey]: {
            session: {
                micEnabled: false,
                camEnabled: false,
                screenShareEnabled: false,
                isHost: false,
                ...session,
            },
        },
    }));
}

beforeEach(() => {
    (toggleMic as jest.Mock).mockClear();
});

describe('ControlsBar', () => {
    it('renders 6 buttons and 1 divider when showExpand=false', () => {
        const store = makeStore();
        render(
            <Provider store={store}>
                <ControlsBar
                    showExpand={false}
                    onLeave={jest.fn()}
                    onMinimize={jest.fn()}
                />
            </Provider>,
        );

        // Mic, Cam, Screen, Hand, Minimize, Leave = 6 buttons
        const buttons = screen.getAllByRole('button');
        expect(buttons).toHaveLength(6);
    });

    it('renders 7 buttons and 1 divider when showExpand=true', () => {
        const store = makeStore();
        render(
            <Provider store={store}>
                <ControlsBar
                    showExpand={true}
                    onLeave={jest.fn()}
                    onMinimize={jest.fn()}
                />
            </Provider>,
        );

        // Mic, Cam, Screen, Hand, Minimize, Expand, Leave = 7 buttons
        const buttons = screen.getAllByRole('button');
        expect(buttons).toHaveLength(7);
    });

    it('clicking Mic calls toggleMic', () => {
        const store = makeStore({micEnabled: false});
        render(
            <Provider store={store}>
                <ControlsBar
                    showExpand={false}
                    onLeave={jest.fn()}
                    onMinimize={jest.fn()}
                />
            </Provider>,
        );
        fireEvent.click(screen.getByTitle('Mikrofon einschalten'));
        expect(toggleMic).toHaveBeenCalled();
    });

    it('clicking Leave calls the onLeave prop', () => {
        const onLeave = jest.fn();
        const store = makeStore({isHost: false});
        render(
            <Provider store={store}>
                <ControlsBar
                    showExpand={false}
                    onLeave={onLeave}
                    onMinimize={jest.fn()}
                />
            </Provider>,
        );
        fireEvent.click(screen.getByTitle('Meeting verlassen'));
        expect(onLeave).toHaveBeenCalled();
    });

    it('clicking Minimize calls the onMinimize prop', () => {
        const onMinimize = jest.fn();
        const store = makeStore();
        render(
            <Provider store={store}>
                <ControlsBar
                    showExpand={false}
                    onLeave={jest.fn()}
                    onMinimize={onMinimize}
                />
            </Provider>,
        );
        fireEvent.click(screen.getByTitle('Minimieren'));
        expect(onMinimize).toHaveBeenCalled();
    });
});
