import {fireEvent, render, screen} from '@testing-library/react';
import React from 'react';
import {Provider} from 'react-redux';
import {createStore} from 'redux';

import {ParticipantPanel} from './participant_panel';

import {setPinnedParticipant} from '../../store/slice_session';
import {PLUGIN_STATE_KEY} from '../../util/selectors';

const stateKey = PLUGIN_STATE_KEY;

interface PanelOverrides {
    order?: string[];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    byId?: Record<string, any>;
    localParticipantId?: string;
    pinnedParticipantId?: string;
    isHost?: boolean;
}

function renderPanel(overrides: PanelOverrides) {
    const store = createStore(() => ({
        [stateKey]: {
            session: {
                isHost: overrides.isHost ?? false,
                localParticipantId: overrides.localParticipantId,
                pinnedParticipantId: overrides.pinnedParticipantId,
            },
            participants: {byId: overrides.byId ?? {}, order: overrides.order ?? []},
        },
        entities: {users: {currentUserId: 'u1', profiles: {u1: {locale: 'de'}}}},
    }));
    store.dispatch = jest.fn();

    render(
        <Provider store={store}>
            <ParticipantPanel/>
        </Provider>,
    );

    return store;
}

describe('ParticipantPanel', () => {
    it('renders one row per participant with the self marker', () => {
        renderPanel({order: ['p1', 'p2'], byId: {p1: {id: 'p1', displayName: 'Anna'}, p2: {id: 'p2', displayName: 'Bernd'}}, localParticipantId: 'p1'});
        expect(screen.getAllByTestId(/^participant-row-/)).toHaveLength(2);
        expect(screen.getByTestId('participant-row-p1')).toHaveTextContent('(Du)');
    });

    it('shows mute, hand and moderator badges', () => {
        renderPanel({order: ['p1'], byId: {p1: {id: 'p1', displayName: 'Anna', muted: true, handRaised: true, role: 'moderator'}}});
        expect(screen.getByTestId('participant-row-muted-p1')).toBeInTheDocument();
        expect(screen.getByTestId('participant-row-hand-p1')).toBeInTheDocument();
        expect(screen.getByTestId('participant-row-moderator-p1')).toBeInTheDocument();
    });

    it('pins the participant when the row is clicked', () => {
        const store = renderPanel({order: ['p1'], byId: {p1: {id: 'p1', displayName: 'Anna'}}});
        fireEvent.click(screen.getByTestId('participant-row-p1'));
        expect(store.dispatch).toHaveBeenCalledWith(setPinnedParticipant('p1'));
    });

    it('unpins the participant when the pinned row is clicked again', () => {
        const store = renderPanel({order: ['p1'], byId: {p1: {id: 'p1', displayName: 'Anna'}}, pinnedParticipantId: 'p1'});
        fireEvent.click(screen.getByTestId('participant-row-p1'));
        expect(store.dispatch).toHaveBeenCalledWith(setPinnedParticipant(null));
    });

    it('is reachable by keyboard and pins on Enter and Space', () => {
        const store = renderPanel({order: ['p1'], byId: {p1: {id: 'p1', displayName: 'Anna'}}});
        const row = screen.getByTestId('participant-row-p1');
        expect(row).toHaveAttribute('role', 'button');
        expect(row).toHaveAttribute('tabindex', '0');

        fireEvent.keyDown(row, {key: 'Enter'});
        fireEvent.keyDown(row, {key: ' '});
        expect(store.dispatch).toHaveBeenCalledTimes(2);
        expect(store.dispatch).toHaveBeenCalledWith(setPinnedParticipant('p1'));
    });

    it('ignores keys that bubble up from the moderation menu', () => {
        const store = renderPanel({order: ['p1'], byId: {p1: {id: 'p1', displayName: 'Anna'}}, localParticipantId: 'me', isHost: true});
        fireEvent.keyDown(screen.getByTestId('participant-menu-trigger-p1'), {key: 'Enter'});
        expect(store.dispatch).not.toHaveBeenCalled();
    });

    it('offers the moderation menu to a host', () => {
        renderPanel({order: ['p1'], byId: {p1: {id: 'p1', displayName: 'Anna'}}, localParticipantId: 'me', isHost: true});
        expect(screen.getByTestId('participant-menu-trigger-p1')).toBeInTheDocument();
    });

    it('does not pin the row when the moderation menu is clicked', () => {
        const store = renderPanel({order: ['p1'], byId: {p1: {id: 'p1', displayName: 'Anna'}}, localParticipantId: 'me', isHost: true});
        fireEvent.click(screen.getByTestId('participant-menu-trigger-p1'));
        expect(store.dispatch).not.toHaveBeenCalled();
    });
});
