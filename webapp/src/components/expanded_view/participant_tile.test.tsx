import {render, screen} from '@testing-library/react';
import React from 'react';
import {Provider} from 'react-redux';
import {createStore} from 'redux';

import {ParticipantTile} from './participant_tile';

import * as trackRegistry from '../../conference/livekit/track_registry';

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
function makeStore(participants: any = {}, tracks: any = {}) {
    return createStore(() => ({
        [stateKey]: {
            participants: {byId: {}, order: [], ...participants},
            tracks: {perParticipant: {}, ...tracks},
        },
    }));
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

describe('ParticipantTile', () => {
    it('renders initials when no track for participant', () => {
        const store = makeStore({
            byId: {p1: {id: 'p1', displayName: 'Alice Bob'}},
        });
        render(
            <Provider store={store}>
                <ParticipantTile
                    participantId='p1'
                    width={128}
                    height={72}
                />
            </Provider>,
        );

        // "Alice Bob" -> "AB"
        expect(screen.getByText('AB')).toBeInTheDocument();
        expect(screen.queryByTestId('participant-tile-video-p1')).not.toBeInTheDocument();
    });

    it('renders <video> element when tracks.perParticipant[id].videoTrackId is set AND registry has the track', () => {
        const store = makeStore(
            {byId: {p2: {id: 'p2', displayName: 'Bob Smith'}}},
            {perParticipant: {p2: {videoTrackId: 'track-p2'}}},
        );
        render(
            <Provider store={store}>
                <ParticipantTile
                    participantId='p2'
                    width={128}
                    height={72}
                />
            </Provider>,
        );
        expect(screen.getByTestId('participant-tile-video-p2')).toBeInTheDocument();
    });

    it('falls back to initials if registry does not have the track for that id', () => {
        (trackRegistry.get as jest.Mock).mockImplementation(() => undefined);

        const store = makeStore(
            {byId: {p3: {id: 'p3', displayName: 'Carol Dave'}}},
            {perParticipant: {p3: {videoTrackId: 'missing-track'}}},
        );
        render(
            <Provider store={store}>
                <ParticipantTile
                    participantId='p3'
                    width={128}
                    height={72}
                />
            </Provider>,
        );

        // "Carol Dave" -> "CD"
        expect(screen.getByText('CD')).toBeInTheDocument();
        expect(screen.queryByTestId('participant-tile-video-p3')).not.toBeInTheDocument();
    });

    it('uses overrideTrackId when given, ignoring the slice videoTrackId', () => {
        // slice has 'slice-track-p4', override points to 'override-track-p4'
        const store = makeStore(
            {byId: {p4: {id: 'p4', displayName: 'Dave Eve'}}},
            {perParticipant: {p4: {videoTrackId: 'slice-track-p4'}}},
        );

        // Make registry return a track for the override id but not slice id
        (trackRegistry.get as jest.Mock).mockImplementation((id: string) => {
            if (id === 'override-track-p4') {
                return {attach: mockAttach, detach: mockDetach, sid: id};
            }
            return undefined;
        });

        render(
            <Provider store={store}>
                <ParticipantTile
                    participantId='p4'
                    overrideTrackId='override-track-p4'
                    width={128}
                    height={72}
                />
            </Provider>,
        );

        // Should render video using override track
        expect(screen.getByTestId('participant-tile-video-p4')).toBeInTheDocument();
    });

    it('applies speaking indicator outline when isSpeaking === true', () => {
        const store = makeStore({
            byId: {p5: {id: 'p5', displayName: 'Eve Frank', isSpeaking: true}},
        });
        render(
            <Provider store={store}>
                <ParticipantTile
                    participantId='p5'
                    width={128}
                    height={72}
                />
            </Provider>,
        );
        const tile = screen.getByTestId('participant-tile-p5');
        expect(tile).toHaveAttribute('data-speaking', 'true');
    });

    it('does not apply speaking indicator when isSpeaking is false', () => {
        const store = makeStore({
            byId: {p6: {id: 'p6', displayName: 'Frank Grace', isSpeaking: false}},
        });
        render(
            <Provider store={store}>
                <ParticipantTile
                    participantId='p6'
                    width={128}
                    height={72}
                />
            </Provider>,
        );
        const tile = screen.getByTestId('participant-tile-p6');
        expect(tile).not.toHaveAttribute('data-speaking');
    });
});
