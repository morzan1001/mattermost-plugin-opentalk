import {render, screen} from '@testing-library/react';
import React from 'react';
import {Provider} from 'react-redux';
import {createStore} from 'redux';

import {GridLayout} from './grid_layout';

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
            tracks: {perParticipant: {}, ...tracks},
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

describe('GridLayout', () => {
    it('renders the empty state placeholder when no participants', () => {
        const store = makeStore({byId: {}, order: []});
        const {getByTestId} = render(
            <Provider store={store}>
                <GridLayout/>
            </Provider>,
        );
        expect(getByTestId('grid-layout-empty')).toBeTruthy();
        expect(screen.getByText('Nobody in the meeting')).toBeInTheDocument();
        expect(screen.queryByTestId('grid-layout')).not.toBeInTheDocument();
    });

    it('renders 4 ParticipantTiles for 4 participants', () => {
        const store = makeStore(makeParticipants(['p1', 'p2', 'p3', 'p4']));
        render(
            <Provider store={store}>
                <GridLayout/>
            </Provider>,
        );
        expect(screen.getByTestId('participant-tile-p1')).toBeInTheDocument();
        expect(screen.getByTestId('participant-tile-p2')).toBeInTheDocument();
        expect(screen.getByTestId('participant-tile-p3')).toBeInTheDocument();
        expect(screen.getByTestId('participant-tile-p4')).toBeInTheDocument();
    });

    it('respects the order from participants.order', () => {
        const store = makeStore(makeParticipants(['c', 'a', 'b']));
        render(
            <Provider store={store}>
                <GridLayout/>
            </Provider>,
        );
        const tiles = screen.getAllByTestId(/^participant-tile-/);
        const ids = tiles.map((el) => el.getAttribute('data-testid')?.replace('participant-tile-', ''));
        expect(ids).toEqual(['c', 'a', 'b']);
    });

    it('renders the grid container when at least one participant is present', () => {
        const store = makeStore(makeParticipants(['p1']));
        render(
            <Provider store={store}>
                <GridLayout/>
            </Provider>,
        );
        expect(screen.getByTestId('grid-layout')).toBeInTheDocument();
        expect(screen.queryByTestId('grid-layout-empty')).not.toBeInTheDocument();
    });
});
