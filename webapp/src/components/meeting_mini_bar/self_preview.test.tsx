import {render, screen} from '@testing-library/react';
import React from 'react';
import {Provider} from 'react-redux';
import {createStore} from 'redux';

import {SelfPreview} from './self_preview';

import {PLUGIN_STATE_KEY} from '../../util/selectors';

const stateKey = PLUGIN_STATE_KEY;

const mockAttach = jest.fn();
const mockDetach = jest.fn();
let mockGetImpl: (id: string) => unknown = (id) => ({attach: mockAttach, detach: mockDetach, sid: id});

jest.mock('../../conference/livekit/track_registry', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const {makeTrackRegistryMock} = require('../../test/track_registry_mock');
    return makeTrackRegistryMock((id: string) => mockGetImpl(id));
});

interface SessionOpts {
    camEnabled?: boolean;
    localParticipantId?: string;
}

interface TracksOpts {
    perParticipant?: Record<string, {videoTrackId?: string}>;
}

function makeStore(session: SessionOpts = {}, tracks: TracksOpts = {}) {
    return createStore(() => ({
        [stateKey]: {
            session: {camEnabled: false, ...session},
            tracks: {perParticipant: {}, ...tracks},
        },
    }));
}

function renderPreview(session: SessionOpts = {}, tracks: TracksOpts = {}) {
    const store = makeStore(session, tracks);
    return render(
        <Provider store={store}>
            <SelfPreview/>
        </Provider>,
    );
}

beforeEach(() => {
    mockAttach.mockReset();
    mockDetach.mockReset();
    mockGetImpl = (id) => ({attach: mockAttach, detach: mockDetach, sid: id});
});

describe('SelfPreview', () => {
    it('renders nothing when camEnabled is false', () => {
        const {container} = renderPreview({camEnabled: false, localParticipantId: 'p1'}, {
            perParticipant: {p1: {videoTrackId: 'track-1'}},
        });
        expect(container).toBeEmptyDOMElement();
    });

    it('renders nothing when localParticipantId is absent', () => {
        const {container} = renderPreview({camEnabled: true});
        expect(container).toBeEmptyDOMElement();
    });

    it('renders nothing when there is no videoTrackId for the local participant', () => {
        const {container} = renderPreview(
            {camEnabled: true, localParticipantId: 'p1'},
            {perParticipant: {p1: {}}},
        );
        expect(container).toBeEmptyDOMElement();
    });

    it('renders a <video> element when cam enabled + trackId present + registry returns a track', () => {
        renderPreview(
            {camEnabled: true, localParticipantId: 'p1'},
            {perParticipant: {p1: {videoTrackId: 'track-1'}}},
        );
        expect(screen.getByTestId('self-preview')).toBeInTheDocument();
        const video = screen.getByTestId('self-preview').querySelector('video');
        expect(video).toBeInTheDocument();
    });

    it('calls track.attach() on mount and track.detach() on unmount', () => {
        const {unmount} = renderPreview(
            {camEnabled: true, localParticipantId: 'p1'},
            {perParticipant: {p1: {videoTrackId: 'track-1'}}},
        );
        expect(mockAttach).toHaveBeenCalledTimes(1);

        unmount();
        expect(mockDetach).toHaveBeenCalledTimes(1);
    });

    it('swallows attach() failures without throwing', () => {
        mockAttach.mockImplementationOnce(() => {
            throw new Error('attach exploded');
        });

        expect(() =>
            renderPreview(
                {camEnabled: true, localParticipantId: 'p1'},
                {perParticipant: {p1: {videoTrackId: 'track-boom'}}},
            ),
        ).not.toThrow();

        expect(screen.getByTestId('self-preview')).toBeInTheDocument();
    });

    it('does not call attach when track registry returns undefined for the trackId', () => {
        mockGetImpl = () => undefined;

        renderPreview(
            {camEnabled: true, localParticipantId: 'p1'},
            {perParticipant: {p1: {videoTrackId: 'missing-track'}}},
        );

        expect(mockAttach).not.toHaveBeenCalled();
    });
});
