import {render, screen, fireEvent} from '@testing-library/react';
import React from 'react';
import {Provider} from 'react-redux';
import {createStore} from 'redux';

jest.mock('../../conference/controller', () => ({
    forceMute: jest.fn(),
    kick: jest.fn(),
    ban: jest.fn(),
    grantModerator: jest.fn(),
    revokeModerator: jest.fn(),
    resetHand: jest.fn(),
    grantScreenShare: jest.fn(),
    revokeScreenShare: jest.fn(),
}));

import {ParticipantMenu} from './component';

import {
    forceMute,
    kick,
    ban,
    grantModerator,
    revokeModerator,
    resetHand,
    grantScreenShare,
    revokeScreenShare,
} from '../../conference/controller';
import type {ParticipantInfo} from '../../store/slice_participants';
import {PLUGIN_STATE_KEY} from '../../util/selectors';

const stateKey = PLUGIN_STATE_KEY;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeStore(session: any = {}, participants: Record<string, ParticipantInfo> = {}) {
    return createStore(() => ({
        [stateKey]: {
            session: {
                isHost: false,
                localParticipantId: 'me',
                ...session,
            },
            participants: {
                byId: participants,
                order: Object.keys(participants),
            },
        },
    }));
}

beforeEach(() => {
    jest.clearAllMocks();
});

function openMenu() {
    fireEvent.click(screen.getByTestId('participant-menu-trigger-p1'));
}

describe('ParticipantMenu', () => {
    it('renders nothing when the viewer is not host', () => {
        const store = makeStore({isHost: false}, {p1: {id: 'p1', displayName: 'Alice'}});
        const {container} = render(
            <Provider store={store}>
                <ParticipantMenu participantId='p1'/>
            </Provider>,
        );
        expect(container.firstChild).toBeNull();
    });

    it('renders nothing for the local participant (no self-moderation)', () => {
        const store = makeStore({isHost: true, localParticipantId: 'p1'}, {p1: {id: 'p1', displayName: 'Alice'}});
        const {container} = render(
            <Provider store={store}>
                <ParticipantMenu participantId='p1'/>
            </Provider>,
        );
        expect(container.firstChild).toBeNull();
    });

    it('renders the trigger for a host viewing a remote participant', () => {
        const store = makeStore({isHost: true}, {p1: {id: 'p1', displayName: 'Alice'}});
        render(
            <Provider store={store}>
                <ParticipantMenu participantId='p1'/>
            </Provider>,
        );
        expect(screen.getByTestId('participant-menu-trigger-p1')).toBeInTheDocument();
    });

    it('does not show the menu items until the trigger is clicked', () => {
        const store = makeStore({isHost: true}, {p1: {id: 'p1', displayName: 'Alice'}});
        render(
            <Provider store={store}>
                <ParticipantMenu participantId='p1'/>
            </Provider>,
        );
        expect(screen.queryByTestId('participant-menu-mute-p1')).not.toBeInTheDocument();
    });

    it('mute item calls forceMute with the participant id and closes the menu', () => {
        const store = makeStore({isHost: true}, {p1: {id: 'p1', displayName: 'Alice'}});
        render(
            <Provider store={store}>
                <ParticipantMenu participantId='p1'/>
            </Provider>,
        );
        openMenu();
        fireEvent.click(screen.getByTestId('participant-menu-mute-p1'));
        expect(forceMute).toHaveBeenCalledWith('p1');
        expect(screen.queryByTestId('participant-menu-mute-p1')).not.toBeInTheDocument();
    });

    it('shows the lower-hand item only when handRaised is true', () => {
        const store = makeStore({isHost: true}, {p1: {id: 'p1', displayName: 'Alice', handRaised: false}});
        render(
            <Provider store={store}>
                <ParticipantMenu participantId='p1'/>
            </Provider>,
        );
        openMenu();
        expect(screen.queryByTestId('participant-menu-lower-hand-p1')).not.toBeInTheDocument();
    });

    it('lower-hand item calls resetHand with the participant id when handRaised is true', () => {
        const store = makeStore({isHost: true}, {p1: {id: 'p1', displayName: 'Alice', handRaised: true}});
        render(
            <Provider store={store}>
                <ParticipantMenu participantId='p1'/>
            </Provider>,
        );
        openMenu();
        fireEvent.click(screen.getByTestId('participant-menu-lower-hand-p1'));
        expect(resetHand).toHaveBeenCalledWith('p1');
    });

    it('role-toggle offers "make moderator" for a plain user and calls grantModerator', () => {
        const store = makeStore({isHost: true}, {p1: {id: 'p1', displayName: 'Alice', role: 'user'}});
        render(
            <Provider store={store}>
                <ParticipantMenu participantId='p1'/>
            </Provider>,
        );
        openMenu();
        const item = screen.getByTestId('participant-menu-role-toggle-p1');
        expect(item).toHaveTextContent('Make moderator');
        fireEvent.click(item);
        expect(grantModerator).toHaveBeenCalledWith('p1');
        expect(revokeModerator).not.toHaveBeenCalled();
    });

    it('role-toggle offers "remove moderator" for a moderator and calls revokeModerator', () => {
        const store = makeStore({isHost: true}, {p1: {id: 'p1', displayName: 'Alice', role: 'moderator'}});
        render(
            <Provider store={store}>
                <ParticipantMenu participantId='p1'/>
            </Provider>,
        );
        openMenu();
        const item = screen.getByTestId('participant-menu-role-toggle-p1');
        expect(item).toHaveTextContent('Remove moderator');
        fireEvent.click(item);
        expect(revokeModerator).toHaveBeenCalledWith('p1');
        expect(grantModerator).not.toHaveBeenCalled();
    });

    it('grant/revoke screen-share items call the matching controller functions', () => {
        const store = makeStore({isHost: true}, {p1: {id: 'p1', displayName: 'Alice'}});
        render(
            <Provider store={store}>
                <ParticipantMenu participantId='p1'/>
            </Provider>,
        );
        openMenu();
        fireEvent.click(screen.getByTestId('participant-menu-grant-screen-share-p1'));
        expect(grantScreenShare).toHaveBeenCalledWith('p1');

        openMenu();
        fireEvent.click(screen.getByTestId('participant-menu-revoke-screen-share-p1'));
        expect(revokeScreenShare).toHaveBeenCalledWith('p1');
    });

    it('kick and ban items call the matching controller functions', () => {
        const store = makeStore({isHost: true}, {p1: {id: 'p1', displayName: 'Alice'}});
        render(
            <Provider store={store}>
                <ParticipantMenu participantId='p1'/>
            </Provider>,
        );
        openMenu();
        fireEvent.click(screen.getByTestId('participant-menu-kick-p1'));
        expect(kick).toHaveBeenCalledWith('p1');

        openMenu();
        fireEvent.click(screen.getByTestId('participant-menu-ban-p1'));
        expect(ban).toHaveBeenCalledWith('p1');
    });

    it('renders the open menu in a portal attached to document.body', () => {
        const store = makeStore({isHost: true}, {p1: {id: 'p1', displayName: 'Alice'}});
        render(
            <Provider store={store}>
                <div data-testid='tile-like-parent'>
                    <ParticipantMenu participantId='p1'/>
                </div>
            </Provider>,
        );
        openMenu();
        const menu = screen.getByTestId('participant-menu-mute-p1').parentElement as HTMLElement;
        expect(menu.parentElement).toBe(document.body);
        expect(screen.getByTestId('tile-like-parent')).not.toContainElement(menu);
    });

    it('does not close on mousedown inside the menu, so item clicks still land', () => {
        const store = makeStore({isHost: true}, {p1: {id: 'p1', displayName: 'Alice'}});
        render(
            <Provider store={store}>
                <ParticipantMenu participantId='p1'/>
            </Provider>,
        );
        openMenu();
        const item = screen.getByTestId('participant-menu-mute-p1');
        fireEvent.mouseDown(item);
        expect(screen.getByTestId('participant-menu-mute-p1')).toBeInTheDocument();
        fireEvent.click(item);
        expect(forceMute).toHaveBeenCalledWith('p1');
    });

    it('closes the menu on outside click', () => {
        const store = makeStore({isHost: true}, {p1: {id: 'p1', displayName: 'Alice'}});
        render(
            <Provider store={store}>
                <div data-testid='outside'>{'outside'}</div>
                <ParticipantMenu participantId='p1'/>
            </Provider>,
        );
        openMenu();
        expect(screen.getByTestId('participant-menu-mute-p1')).toBeInTheDocument();
        fireEvent.mouseDown(screen.getByTestId('outside'));
        expect(screen.queryByTestId('participant-menu-mute-p1')).not.toBeInTheDocument();
    });

    it('closes the menu on Escape', () => {
        const store = makeStore({isHost: true}, {p1: {id: 'p1', displayName: 'Alice'}});
        render(
            <Provider store={store}>
                <ParticipantMenu participantId='p1'/>
            </Provider>,
        );
        openMenu();
        expect(screen.getByTestId('participant-menu-mute-p1')).toBeInTheDocument();
        fireEvent.keyDown(window, {key: 'Escape'});
        expect(screen.queryByTestId('participant-menu-mute-p1')).not.toBeInTheDocument();
    });
});
