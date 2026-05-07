import {render, screen} from '@testing-library/react';
import React from 'react';
import {Provider} from 'react-redux';
import {createStore} from 'redux';

import ExpandedView from './component';

import * as trackRegistry from '../../conference/livekit/track_registry';

jest.mock('../../conference/controller', () => ({
    leaveActiveConference: jest.fn().mockResolvedValue(undefined),
    toggleMic: jest.fn().mockResolvedValue(undefined),
    toggleCam: jest.fn().mockResolvedValue(undefined),
    toggleScreenShare: jest.fn().mockResolvedValue(undefined),
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

const stateKey = 'plugins-com.github.morzan1001.mattermost-plugin-opentalk';

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

    it('renders the OpenTalk-Meeting label in the header', () => {
        const store = makeStore({expanded: true, status: 'connected'});
        render(
            <Provider store={store}>
                <ExpandedView/>
            </Provider>,
        );
        expect(screen.getByText('OpenTalk-Meeting')).toBeInTheDocument();
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
});
