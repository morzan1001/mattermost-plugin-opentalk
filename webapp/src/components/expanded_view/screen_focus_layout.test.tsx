import {render, screen} from '@testing-library/react';
import React from 'react';
import {Provider} from 'react-redux';
import {createStore} from 'redux';

import {ScreenFocusLayout} from './screen_focus_layout';

import * as trackRegistry from '../../conference/livekit/track_registry';
import {PLUGIN_STATE_KEY} from '../../util/selectors';

const stateKey = PLUGIN_STATE_KEY;

const mockAttach = jest.fn();
const mockDetach = jest.fn();

jest.mock('../../conference/livekit/track_registry', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const {makeTrackRegistryMock} = require('../../test/track_registry_mock');
    return makeTrackRegistryMock((id: string) => ({attach: mockAttach, detach: mockDetach, sid: id}));
});

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

describe('ScreenFocusLayout', () => {
    it('falls back to GridLayout when no screen-share is active', () => {
        const store = makeStore(makeParticipants(['p1', 'p2', 'p3', 'p4']));
        render(
            <Provider store={store}>
                <ScreenFocusLayout/>
            </Provider>,
        );

        // Should render grid layout, not screen focus layout
        expect(screen.queryByTestId('screen-focus-layout')).not.toBeInTheDocument();
        expect(screen.getByTestId('grid-layout')).toBeInTheDocument();
    });

    it('falls back to grid-layout-empty when no participants and no screen share', () => {
        const store = makeStore({byId: {}, order: []});
        render(
            <Provider store={store}>
                <ScreenFocusLayout/>
            </Provider>,
        );
        expect(screen.queryByTestId('screen-focus-layout')).not.toBeInTheDocument();
        expect(screen.getByTestId('grid-layout-empty')).toBeInTheDocument();
    });

    it('renders screen-focus-layout when p2 is sharing screen', () => {
        const store = makeStore(
            makeParticipants(['p1', 'p2', 'p3', 'p4']),
            {perParticipant: {p2: {screenTrackId: 'screen-1'}}},
        );
        render(
            <Provider store={store}>
                <ScreenFocusLayout/>
            </Provider>,
        );
        expect(screen.getByTestId('screen-focus-layout')).toBeInTheDocument();
        expect(screen.queryByTestId('grid-layout')).not.toBeInTheDocument();

        // The main pane should show p2's tile (match only exact tile divs, not video elements)
        const tiles = screen.getAllByTestId(/^participant-tile-p/);

        // Total tiles: 1 (main) + 4 (filmstrip) = 5 (p2 appears twice: once in main pane, once in filmstrip)
        expect(tiles).toHaveLength(5);

        // The first tile (main pane) should be p2
        expect(tiles[0].getAttribute('data-testid')).toBe('participant-tile-p2');

        // All 4 participants should be in the filmstrip
        const filmstripIds = tiles.slice(1).map((el) => el.getAttribute('data-testid'));
        expect(filmstripIds).toContain('participant-tile-p1');
        expect(filmstripIds).toContain('participant-tile-p2');
        expect(filmstripIds).toContain('participant-tile-p3');
        expect(filmstripIds).toContain('participant-tile-p4');
    });

    it('when multiple participants share screens, the first in order wins', () => {
        const store = makeStore(
            makeParticipants(['p1', 'p2', 'p3', 'p4']),
            {
                perParticipant: {
                    p3: {screenTrackId: 'screen-3'},
                    p4: {screenTrackId: 'screen-4'},
                },
            },
        );
        render(
            <Provider store={store}>
                <ScreenFocusLayout/>
            </Provider>,
        );
        expect(screen.getByTestId('screen-focus-layout')).toBeInTheDocument();

        // p3 appears first in order with screenTrackId, so p3 is main
        const tiles = screen.getAllByTestId(/^participant-tile-p/);
        expect(tiles[0].getAttribute('data-testid')).toBe('participant-tile-p3');
    });
});
