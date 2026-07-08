import {render, screen, fireEvent} from '@testing-library/react';
import React from 'react';
import {Provider} from 'react-redux';
import {createStore} from 'redux';

import ExpandedView from './component';

import {resetHand, leaveActiveConference, endActiveMeeting} from '../../conference/controller';
import * as trackRegistry from '../../conference/livekit/track_registry';

jest.mock('../../conference/controller', () => ({
    leaveActiveConference: jest.fn().mockResolvedValue(undefined),
    endActiveMeeting: jest.fn().mockResolvedValue(undefined),
    toggleMic: jest.fn().mockResolvedValue(undefined),
    toggleCam: jest.fn().mockResolvedValue(undefined),
    toggleScreenShare: jest.fn().mockResolvedValue(undefined),
    resetHand: jest.fn(),
}));

jest.mock('../../conference/livekit/track_registry', () => ({
    get: jest.fn().mockImplementation((id: string) => ({
        attach: jest.fn(),
        detach: jest.fn(),
        sid: id,
    })),
    register: jest.fn(),
    unregister: jest.fn(),
    clear: jest.fn(),
}));

import {PLUGIN_STATE_KEY} from '../../util/selectors';

const stateKey = PLUGIN_STATE_KEY;

const STORAGE_KEY = 'opentalk:layout-mode:v1';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeStore(session: any = {}, extra: any = {}) {
    return createStore(() => ({
        [stateKey]: {
            session: {
                status: 'idle',
                expanded: false,
                joinedAt: undefined,
                micEnabled: false,
                camEnabled: false,
                screenShareEnabled: false,
                isHost: false,
                ...session,
            },
            participants: {byId: {}, order: [], ...extra.participants},
            tracks: {perParticipant: {}, activeSpeakers: [], ...extra.tracks},
        },
    }));
}

beforeEach(() => {
    localStorage.clear();
    (trackRegistry.get as jest.Mock).mockImplementation((id: string) => ({
        attach: jest.fn(),
        detach: jest.fn(),
        sid: id,
    }));
});

describe('ExpandedView', () => {
    it('renders nothing when session.expanded === false (for any status)', () => {
        const store = makeStore({expanded: false, status: 'connected'});
        const {container} = render(
            <Provider store={store}>
                <ExpandedView/>
            </Provider>,
        );
        expect(screen.queryByTestId('expanded-view')).not.toBeInTheDocument();
        expect(container.firstChild).toBeNull();
    });

    it('renders nothing when expanded=true but status !== connected', () => {
        const store = makeStore({expanded: true, status: 'connecting'});
        const {container} = render(
            <Provider store={store}>
                <ExpandedView/>
            </Provider>,
        );
        expect(screen.queryByTestId('expanded-view')).not.toBeInTheDocument();
        expect(container.firstChild).toBeNull();
    });

    it('renders nothing when expanded=true and status=idle', () => {
        const store = makeStore({expanded: true, status: 'idle'});
        render(
            <Provider store={store}>
                <ExpandedView/>
            </Provider>,
        );
        expect(screen.queryByTestId('expanded-view')).not.toBeInTheDocument();
    });

    it('renders the overlay when expanded=true and status=connected', () => {
        const store = makeStore({expanded: true, status: 'connected', joinedAt: Date.now()});
        render(
            <Provider store={store}>
                <ExpandedView/>
            </Provider>,
        );
        expect(screen.getByTestId('expanded-view')).toBeInTheDocument();
    });

    it('renders the OpenTalk meeting label in the header', () => {
        const store = makeStore({expanded: true, status: 'connected'});
        render(
            <Provider store={store}>
                <ExpandedView/>
            </Provider>,
        );
        expect(screen.getByText('OpenTalk meeting')).toBeInTheDocument();
    });

    it('default layout mode (speaker) renders SpeakerLayout', () => {
        // No localStorage entry → default is 'speaker'
        const store = makeStore({expanded: true, status: 'connected'});
        render(
            <Provider store={store}>
                <ExpandedView/>
            </Provider>,
        );
        expect(screen.getByTestId('expanded-view')).toBeInTheDocument();
        expect(screen.getByTestId('speaker-layout-empty')).toBeInTheDocument();
        expect(screen.queryByTestId('grid-layout')).not.toBeInTheDocument();
        expect(screen.queryByTestId('grid-layout-empty')).not.toBeInTheDocument();
    });

    it('localStorage grid → renders GridLayout', () => {
        localStorage.setItem(STORAGE_KEY, 'grid');
        const store = makeStore({expanded: true, status: 'connected'});
        render(
            <Provider store={store}>
                <ExpandedView/>
            </Provider>,
        );
        expect(screen.getByTestId('expanded-view')).toBeInTheDocument();

        // GridLayout with no participants shows grid-layout-empty
        expect(screen.getByTestId('grid-layout-empty')).toBeInTheDocument();
        expect(screen.queryByTestId('speaker-layout')).not.toBeInTheDocument();
        expect(screen.queryByTestId('speaker-layout-empty')).not.toBeInTheDocument();
    });

    it('localStorage screen-focus → renders ScreenFocusLayout (fallback to grid when no screen share)', () => {
        localStorage.setItem(STORAGE_KEY, 'screen-focus');
        const store = makeStore({expanded: true, status: 'connected'});
        render(
            <Provider store={store}>
                <ExpandedView/>
            </Provider>,
        );
        expect(screen.getByTestId('expanded-view')).toBeInTheDocument();

        // No screen share active → ScreenFocusLayout falls back to GridLayout
        // Either screen-focus-layout or grid-layout-empty is acceptable
        const screenFocus = screen.queryByTestId('screen-focus-layout');
        const gridLayout = screen.queryByTestId('grid-layout');
        const gridEmpty = screen.queryByTestId('grid-layout-empty');
        expect(screenFocus !== null || gridLayout !== null || gridEmpty !== null).toBe(true);
    });

    it('renders the LayoutSwitcher in the header', () => {
        const store = makeStore({expanded: true, status: 'connected'});
        render(
            <Provider store={store}>
                <ExpandedView/>
            </Provider>,
        );
        expect(screen.getByTestId('layout-switcher-speaker')).toBeInTheDocument();
        expect(screen.getByTestId('layout-switcher-grid')).toBeInTheDocument();
        expect(screen.getByTestId('layout-switcher-screen-focus')).toBeInTheDocument();
    });

    describe('raised-hand queue strip', () => {
        const raisedParticipants = {
            byId: {
                p1: {id: 'p1', displayName: 'Alice', handRaised: true},
                p2: {id: 'p2', displayName: 'Bob', handRaised: true},
            },
            order: ['p1', 'p2'],
        };

        beforeEach(() => {
            (resetHand as jest.Mock).mockClear();
        });

        it('renders one chip per raised participant', () => {
            const store = makeStore({expanded: true, status: 'connected'}, {participants: raisedParticipants});
            render(
                <Provider store={store}>
                    <ExpandedView/>
                </Provider>,
            );
            expect(screen.getByTestId('raised-hand-chip-p1')).toBeInTheDocument();
            expect(screen.getByTestId('raised-hand-chip-p2')).toBeInTheDocument();
        });

        it('host chips are clickable and call resetHand with that participant\'s id', () => {
            const store = makeStore({expanded: true, status: 'connected', isHost: true}, {participants: raisedParticipants});
            render(
                <Provider store={store}>
                    <ExpandedView/>
                </Provider>,
            );
            fireEvent.click(screen.getByTestId('raised-hand-chip-p1'));
            expect(resetHand).toHaveBeenCalledWith('p1');
            expect(resetHand).not.toHaveBeenCalledWith('p2');
        });

        it('non-host chips are read-only and do not call resetHand on click', () => {
            const store = makeStore({expanded: true, status: 'connected', isHost: false}, {participants: raisedParticipants});
            render(
                <Provider store={store}>
                    <ExpandedView/>
                </Provider>,
            );
            const chip = screen.getByTestId('raised-hand-chip-p1');
            expect(chip.tagName).not.toBe('BUTTON');
            fireEvent.click(chip);
            expect(resetHand).not.toHaveBeenCalled();
        });
    });

    describe('end-for-everyone gating', () => {
        beforeEach(() => {
            (leaveActiveConference as jest.Mock).mockClear();
            (endActiveMeeting as jest.Mock).mockClear();
        });

        it('room owner leaving a non-DM channel is offered "End meeting for everyone"', () => {
            const store = makeStore({expanded: true, status: 'connected', isHost: true, isRoomOwner: true});
            render(
                <Provider store={store}>
                    <ExpandedView/>
                </Provider>,
            );
            fireEvent.click(screen.getByRole('button', {name: /Leave or end meeting/}));
            fireEvent.click(screen.getByRole('button', {name: 'End meeting for everyone'}));
            expect(endActiveMeeting).toHaveBeenCalled();
        });

        it('promoted moderator (isHost but not room owner) only leaves, no end-for-everyone', () => {
            const store = makeStore({expanded: true, status: 'connected', isHost: true, isRoomOwner: false});
            render(
                <Provider store={store}>
                    <ExpandedView/>
                </Provider>,
            );
            fireEvent.click(screen.getByRole('button', {name: /Leave/}));
            expect(leaveActiveConference).toHaveBeenCalled();
            expect(endActiveMeeting).not.toHaveBeenCalled();
            expect(screen.queryByRole('button', {name: 'End meeting for everyone'})).not.toBeInTheDocument();
        });
    });
});
