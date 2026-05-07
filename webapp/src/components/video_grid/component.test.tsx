import React from 'react';
import {render} from '@testing-library/react';
import {Provider} from 'react-redux';
import {createStore} from 'redux';
import VideoGrid from './component';

const stateKey = 'plugins-com.github.morzan1001.mattermost-plugin-opentalk';

const mockAttach = jest.fn();
const mockDetach = jest.fn();

jest.mock('../../conference/livekit/track_registry', () => ({
    get: jest.fn().mockImplementation((id: string) => ({attach: mockAttach, detach: mockDetach, sid: id})),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeStore(state: any) {
    return createStore(() => ({[stateKey]: state}));
}

beforeEach(() => {
    mockAttach.mockReset();
    mockDetach.mockReset();
});

describe('VideoGrid', () => {
    it('renders nothing when no video tracks', () => {
        const store = makeStore({
            session: {status: 'connected'},
            tracks: {perParticipant: {p1: {audioTrackId: 'a1'}}, activeSpeakers: []},
        });
        const {container} = render(
            <Provider store={store}>
                <VideoGrid/>
            </Provider>,
        );
        expect(container.querySelectorAll('video').length).toBe(0);
    });

    it('renders one tile per video track', () => {
        const store = makeStore({
            session: {status: 'connected'},
            tracks: {
                perParticipant: {
                    p1: {videoTrackId: 'v1'},
                    p2: {videoTrackId: 'v2'},
                },
                activeSpeakers: [],
            },
        });
        const {container} = render(
            <Provider store={store}>
                <VideoGrid/>
            </Provider>,
        );
        expect(container.querySelectorAll('video').length).toBe(2);
    });

    it('marks speaking participants with --speaking class', () => {
        const store = makeStore({
            session: {status: 'connected'},
            tracks: {
                perParticipant: {p1: {videoTrackId: 'v1'}, p2: {videoTrackId: 'v2'}},
                activeSpeakers: ['p1'],
            },
        });
        const {container} = render(
            <Provider store={store}>
                <VideoGrid/>
            </Provider>,
        );
        const speakingTiles = container.querySelectorAll('.opentalk-video-grid__tile--speaking');
        expect(speakingTiles.length).toBe(1);
    });

    it('renders nothing when session is idle', () => {
        const store = makeStore({
            session: {status: 'idle'},
            tracks: {perParticipant: {p1: {videoTrackId: 'v1'}}, activeSpeakers: []},
        });
        const {container} = render(
            <Provider store={store}>
                <VideoGrid/>
            </Provider>,
        );
        expect(container.querySelectorAll('video').length).toBe(0);
    });
});
