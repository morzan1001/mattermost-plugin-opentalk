import {render, screen} from '@testing-library/react';
import React from 'react';
import {Provider} from 'react-redux';
import {createStore} from 'redux';

import {SpeakerLayout} from './speaker_layout';

import * as trackRegistry from '../../conference/livekit/track_registry';

const stateKey = 'plugins-com.github.morzan1001.mattermost-plugin-opentalk';

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
function makeStore(participants: any, tracks: any = {}) {
    return createStore(() => ({
        [stateKey]: {
            participants,
            tracks: {perParticipant: {}, activeSpeakers: [], ...tracks},
        },
    }));
}

function makeParticipants(ids: string[]) {
    const byId: Record<string, {id: string; displayName: string}> = {};
    for (const id of ids) {
        byId[id] = {id, displayName: `User ${id}`};
    }
    return {byId, order: ids};
}

beforeEach(() => {
    mockAttach.mockReset();
    mockDetach.mockReset();
    (trackRegistry.get as jest.Mock).mockImplementation((id: string) => ({
        attach: mockAttach,
        detach: mockDetach,
        sid: id,
    }));
});

describe('SpeakerLayout', () => {
    it('renders the empty state placeholder when no participants', () => {
        const store = makeStore({byId: {}, order: []});
        const {getByTestId} = render(
            <Provider store={store}>
                <SpeakerLayout/>
            </Provider>,
        );
        expect(getByTestId('speaker-layout-empty')).toBeTruthy();
        expect(screen.getByText('Nobody in the meeting')).toBeInTheDocument();
        expect(screen.queryByTestId('speaker-layout')).not.toBeInTheDocument();
    });

    it('with 1 participant and no active speaker: that participant is the main tile; no filmstrip', () => {
        const store = makeStore(makeParticipants(['p1']));
        render(
            <Provider store={store}>
                <SpeakerLayout/>
            </Provider>,
        );
        expect(screen.getByTestId('speaker-layout')).toBeInTheDocument();
        expect(screen.getByTestId('participant-tile-p1')).toBeInTheDocument();

        // Only one tile rendered, no filmstrip column (no other participants)
        const tiles = screen.getAllByTestId(/^participant-tile-/);
        expect(tiles).toHaveLength(1);
    });

    it('with 4 participants and no active speaker: first in order is main; remaining 3 in filmstrip', () => {
        const store = makeStore(makeParticipants(['p1', 'p2', 'p3', 'p4']));
        render(
            <Provider store={store}>
                <SpeakerLayout/>
            </Provider>,
        );
        expect(screen.getByTestId('speaker-layout')).toBeInTheDocument();

        // All 4 tiles should be rendered
        expect(screen.getByTestId('participant-tile-p1')).toBeInTheDocument();
        expect(screen.getByTestId('participant-tile-p2')).toBeInTheDocument();
        expect(screen.getByTestId('participant-tile-p3')).toBeInTheDocument();
        expect(screen.getByTestId('participant-tile-p4')).toBeInTheDocument();

        // p1 should be first (main pane), p2/p3/p4 in filmstrip
        const tiles = screen.getAllByTestId(/^participant-tile-/);
        expect(tiles).toHaveLength(4);
        expect(tiles[0].getAttribute('data-testid')).toBe('participant-tile-p1');
    });

    it('with 4 participants and activeSpeakers=[p3]: p3 is main; the other 3 in filmstrip', () => {
        const store = makeStore(
            makeParticipants(['p1', 'p2', 'p3', 'p4']),
            {activeSpeakers: ['p3']},
        );
        render(
            <Provider store={store}>
                <SpeakerLayout/>
            </Provider>,
        );
        expect(screen.getByTestId('speaker-layout')).toBeInTheDocument();

        // All 4 tiles should be rendered
        const tiles = screen.getAllByTestId(/^participant-tile-/);
        expect(tiles).toHaveLength(4);

        // p3 should be the main tile (first in DOM)
        expect(tiles[0].getAttribute('data-testid')).toBe('participant-tile-p3');

        // The remaining three should be in the filmstrip
        const filmstripIds = tiles.slice(1).map((el) => el.getAttribute('data-testid'));
        expect(filmstripIds).toContain('participant-tile-p1');
        expect(filmstripIds).toContain('participant-tile-p2');
        expect(filmstripIds).toContain('participant-tile-p4');
    });

    it('with 4 participants and activeSpeakers=[ghost]: falls back to order[0] as main', () => {
        const store = makeStore(
            makeParticipants(['p1', 'p2', 'p3', 'p4']),
            {activeSpeakers: ['ghost']},
        );
        render(
            <Provider store={store}>
                <SpeakerLayout/>
            </Provider>,
        );
        expect(screen.getByTestId('speaker-layout')).toBeInTheDocument();

        // p1 should be the main tile (ghost not in byId, fallback to order[0])
        const tiles = screen.getAllByTestId(/^participant-tile-/);
        expect(tiles).toHaveLength(4);
        expect(tiles[0].getAttribute('data-testid')).toBe('participant-tile-p1');
    });
});
