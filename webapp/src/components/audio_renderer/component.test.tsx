import React from 'react';
import {render} from '@testing-library/react';
import {Provider} from 'react-redux';
import {createStore} from 'redux';
import AudioRenderer from './component';

const stateKey = 'plugins-de.opentalk.mattermost-plugin';

const mockAttach = jest.fn();
const mockDetach = jest.fn();

jest.mock('../../conference/livekit/track_registry', () => ({
    get: jest.fn().mockImplementation((id: string) => ({
        attach: mockAttach,
        detach: mockDetach,
        sid: id,
    })),
    register: jest.fn(),
    unregister: jest.fn(),
    clear: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeStore(state: any) {
    return createStore(() => ({[stateKey]: state}));
}

beforeEach(() => {
    mockAttach.mockReset();
    mockDetach.mockReset();
});

describe('AudioRenderer', () => {
    it('renders nothing when session not connected', () => {
        const store = makeStore({
            session: {status: 'idle'},
            tracks: {perParticipant: {}, activeSpeakers: []},
        });
        const {container} = render(
            <Provider store={store}>
                <AudioRenderer/>
            </Provider>,
        );
        expect(container.querySelectorAll('audio').length).toBe(0);
    });

    it('renders one <audio> per audio track when connected', () => {
        const store = makeStore({
            session: {status: 'connected'},
            tracks: {
                perParticipant: {
                    p1: {audioTrackId: 'a1'},
                    p2: {audioTrackId: 'a2', videoTrackId: 'v2'},
                    p3: {videoTrackId: 'v3'},
                },
                activeSpeakers: [],
            },
        });
        const {container} = render(
            <Provider store={store}>
                <AudioRenderer/>
            </Provider>,
        );
        expect(container.querySelectorAll('audio').length).toBe(2);
    });

    it('attaches each track to its <audio> element', () => {
        const store = makeStore({
            session: {status: 'connected'},
            tracks: {perParticipant: {p1: {audioTrackId: 'a1'}}, activeSpeakers: []},
        });
        render(
            <Provider store={store}>
                <AudioRenderer/>
            </Provider>,
        );
        expect(mockAttach).toHaveBeenCalled();
    });
});
