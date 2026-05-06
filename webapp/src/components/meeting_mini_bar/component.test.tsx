import {render, screen, fireEvent} from '@testing-library/react';
import React from 'react';
import {Provider} from 'react-redux';
import {createStore} from 'redux';

jest.mock('../../conference/controller', () => ({
    leaveActiveConference: jest.fn().mockResolvedValue(undefined),
    toggleMic: jest.fn().mockResolvedValue(undefined),
    toggleCam: jest.fn().mockResolvedValue(undefined),
    toggleScreenShare: jest.fn().mockResolvedValue(undefined),
}));

import MeetingMiniBar from './component';

import {leaveActiveConference, toggleMic, toggleCam, toggleScreenShare} from '../../conference/controller';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeStore(session: any) {
    return createStore(() => ({
        'plugins-de.opentalk.mattermost-plugin': {session},
    }));
}

beforeEach(() => {
    (leaveActiveConference as jest.Mock).mockClear();
    (toggleMic as jest.Mock).mockClear();
    (toggleCam as jest.Mock).mockClear();
    (toggleScreenShare as jest.Mock).mockClear();
});

describe('MeetingMiniBar', () => {
    it('renders nothing when idle', () => {
        const {container} = render(
            <Provider store={makeStore({status: 'idle', participantCount: 0})}>
                <MeetingMiniBar/>
            </Provider>,
        );
        expect(container).toBeEmptyDOMElement();
    });

    it('renders connecting state', () => {
        render(
            <Provider store={makeStore({status: 'connecting', participantCount: 0})}>
                <MeetingMiniBar/>
            </Provider>,
        );
        expect(screen.getByText(/Verbinde/)).toBeInTheDocument();
    });

    it('renders connected with mic/cam/screen/leave buttons', () => {
        render(
            <Provider store={makeStore({status: 'connected', participantCount: 3, micEnabled: true, camEnabled: false, screenShareEnabled: false})}>
                <MeetingMiniBar/>
            </Provider>,
        );
        expect(screen.getByText(/3/)).toBeInTheDocument();
        expect(screen.getByTitle('Mikrofon stummschalten')).toBeInTheDocument();
        expect(screen.getByTitle('Kamera einschalten')).toBeInTheDocument();
        expect(screen.getByTitle('Bildschirm teilen')).toBeInTheDocument();
        expect(screen.getByRole('button', {name: /Verlassen/})).toBeInTheDocument();
    });

    it('clicking mic button calls toggleMic', () => {
        render(
            <Provider store={makeStore({status: 'connected', participantCount: 1, micEnabled: false, camEnabled: false, screenShareEnabled: false})}>
                <MeetingMiniBar/>
            </Provider>,
        );
        fireEvent.click(screen.getByTitle('Mikrofon einschalten'));
        expect(toggleMic).toHaveBeenCalled();
    });

    it('clicking cam button calls toggleCam', () => {
        render(
            <Provider store={makeStore({status: 'connected', participantCount: 1, micEnabled: false, camEnabled: false, screenShareEnabled: false})}>
                <MeetingMiniBar/>
            </Provider>,
        );
        fireEvent.click(screen.getByTitle('Kamera einschalten'));
        expect(toggleCam).toHaveBeenCalled();
    });

    it('clicking screen-share button calls toggleScreenShare', () => {
        render(
            <Provider store={makeStore({status: 'connected', participantCount: 1, micEnabled: false, camEnabled: false, screenShareEnabled: false})}>
                <MeetingMiniBar/>
            </Provider>,
        );
        fireEvent.click(screen.getByTitle('Bildschirm teilen'));
        expect(toggleScreenShare).toHaveBeenCalled();
    });

    it('clicking leave button calls leaveActiveConference', () => {
        render(
            <Provider store={makeStore({status: 'connected', participantCount: 1, micEnabled: false, camEnabled: false, screenShareEnabled: false})}>
                <MeetingMiniBar/>
            </Provider>,
        );
        fireEvent.click(screen.getByRole('button', {name: /Verlassen/}));
        expect(leaveActiveConference).toHaveBeenCalled();
    });
});
