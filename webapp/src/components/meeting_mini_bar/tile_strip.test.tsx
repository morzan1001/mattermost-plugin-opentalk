import {render, screen} from '@testing-library/react';
import React from 'react';
import {Provider} from 'react-redux';
import {createStore} from 'redux';

import {TileStrip} from './tile_strip';

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

describe('TileStrip', () => {
    it('renders nothing when the participants slice is empty', () => {
        // Self gets a dedicated SelfPreview, so an empty (or self-only)
        // participants slice means "no remote tiles to show" — the
        // strip cleanly returns null.
        const store = makeStore({byId: {}, order: []});
        const {container} = render(
            <Provider store={store}>
                <TileStrip/>
            </Provider>,
        );
        expect(container).toBeEmptyDOMElement();
    });

    it('renders 2 initials tiles and no overflow badge for 2 participants', () => {
        const store = makeStore(makeParticipants(['p1', 'p2']));
        render(
            <Provider store={store}>
                <TileStrip/>
            </Provider>,
        );
        expect(screen.getByTestId('tile-p1')).toBeInTheDocument();
        expect(screen.getByTestId('tile-p2')).toBeInTheDocument();
        expect(screen.queryByTestId('tile-strip-overflow')).not.toBeInTheDocument();

        // "User p1" -> first letters of "User" and "p1" -> UP (no video tracks in store)
        expect(screen.getAllByText('UP').length).toBeGreaterThanOrEqual(1);
    });

    it('renders 4 tiles and no overflow badge for exactly 4 participants', () => {
        const store = makeStore(makeParticipants(['p1', 'p2', 'p3', 'p4']));
        render(
            <Provider store={store}>
                <TileStrip/>
            </Provider>,
        );
        expect(screen.getByTestId('tile-p1')).toBeInTheDocument();
        expect(screen.getByTestId('tile-p2')).toBeInTheDocument();
        expect(screen.getByTestId('tile-p3')).toBeInTheDocument();
        expect(screen.getByTestId('tile-p4')).toBeInTheDocument();
        expect(screen.queryByTestId('tile-strip-overflow')).not.toBeInTheDocument();
    });

    it('renders 3 tiles and +4 badge for 7 participants', () => {
        const store = makeStore(makeParticipants(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']));
        render(
            <Provider store={store}>
                <TileStrip/>
            </Provider>,
        );
        expect(screen.getByTestId('tile-p1')).toBeInTheDocument();
        expect(screen.getByTestId('tile-p2')).toBeInTheDocument();
        expect(screen.getByTestId('tile-p3')).toBeInTheDocument();

        // p4 should NOT be visible (replaced by badge)
        expect(screen.queryByTestId('tile-p4')).not.toBeInTheDocument();
        const badge = screen.getByTestId('tile-strip-overflow');
        expect(badge).toBeInTheDocument();
        expect(badge.textContent).toBe('+4');
    });

    it('shows 3 tiles and +2 badge for 5 participants', () => {
        const store = makeStore(makeParticipants(['p1', 'p2', 'p3', 'p4', 'p5']));
        render(
            <Provider store={store}>
                <TileStrip/>
            </Provider>,
        );
        expect(screen.getByTestId('tile-p1')).toBeInTheDocument();
        expect(screen.getByTestId('tile-p2')).toBeInTheDocument();
        expect(screen.getByTestId('tile-p3')).toBeInTheDocument();
        expect(screen.queryByTestId('tile-p4')).not.toBeInTheDocument();
        const badge = screen.getByTestId('tile-strip-overflow');
        expect(badge.textContent).toBe('+2');
    });

    it('applies data-speaking="true" for a speaking participant', () => {
        const byId = {
            sp1: {id: 'sp1', displayName: 'Alice Bob', isSpeaking: true},
            sp2: {id: 'sp2', displayName: 'Charlie Doe', isSpeaking: false},
        };
        const store = makeStore({byId, order: ['sp1', 'sp2']});
        render(
            <Provider store={store}>
                <TileStrip/>
            </Provider>,
        );
        const speakingTile = screen.getByTestId('tile-sp1');
        expect(speakingTile).toHaveAttribute('data-speaking', 'true');
        const quietTile = screen.getByTestId('tile-sp2');
        expect(quietTile).not.toHaveAttribute('data-speaking');
    });

    it('renders a <video> element when videoTrackId is in the store and registry has the track', () => {
        const byId = {v1: {id: 'v1', displayName: 'Video User'}};
        const store = makeStore(
            {byId, order: ['v1']},
            {perParticipant: {v1: {videoTrackId: 'track-v1'}}},
        );
        render(
            <Provider store={store}>
                <TileStrip/>
            </Provider>,
        );
        expect(screen.getByTestId('tile-video-v1')).toBeInTheDocument();
    });

    it('falls back to initials when videoTrackId exists in store but registry has no track', () => {
        (trackRegistry.get as jest.Mock).mockImplementation(() => undefined);

        const byId = {nv1: {id: 'nv1', displayName: 'No Video'}};
        const store = makeStore(
            {byId, order: ['nv1']},
            {perParticipant: {nv1: {videoTrackId: 'missing-track'}}},
        );
        render(
            <Provider store={store}>
                <TileStrip/>
            </Provider>,
        );

        // No video element
        expect(screen.queryByTestId('tile-video-nv1')).not.toBeInTheDocument();

        // Shows initials instead: "No Video" -> NV
        expect(screen.getByText('NV')).toBeInTheDocument();
    });
});
