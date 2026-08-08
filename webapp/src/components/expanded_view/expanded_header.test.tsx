import {fireEvent, render, screen} from '@testing-library/react';
import React from 'react';
import {Provider} from 'react-redux';
import {createStore} from 'redux';

import {ExpandedHeader} from './expanded_header';

import {PLUGIN_STATE_KEY} from '../../util/selectors';

const stateKey = PLUGIN_STATE_KEY;

interface HeaderOverrides {
    channelName?: string;
    participantCount?: number;
    sharer?: {id: string; displayName: string};
    panelOpen?: boolean;
    isFullscreen?: boolean;
    onTogglePanel?: () => void;
    onToggleFullscreen?: () => void;
}

function renderHeader(overrides: HeaderOverrides) {
    const {sharer} = overrides;
    const store = createStore(() => ({
        [stateKey]: {
            session: {channelID: 'c1', participantCount: overrides.participantCount ?? 0},
            participants: sharer ? {byId: {[sharer.id]: sharer}, order: [sharer.id]} : {byId: {}, order: []},
            tracks: {perParticipant: sharer ? {[sharer.id]: {screenTrackId: 'screen-1'}} : {}, activeSpeakers: []},
        },
        entities: {channels: {channels: {c1: {display_name: overrides.channelName ?? 'Team'}}}},
    }));

    return render(
        <Provider store={store}>
            <ExpandedHeader
                mode='grid'
                onModeChange={jest.fn()}
                panelOpen={overrides.panelOpen ?? false}
                onTogglePanel={overrides.onTogglePanel ?? jest.fn()}
                isFullscreen={overrides.isFullscreen ?? false}
                onToggleFullscreen={overrides.onToggleFullscreen ?? jest.fn()}
            />
        </Provider>,
    );
}

describe('ExpandedHeader', () => {
    it('shows the channel name when Mattermost provides one', () => {
        renderHeader({channelName: 'Team', participantCount: 3});
        expect(screen.getByText('Team')).toBeInTheDocument();
    });

    it('falls back to the generic title for channels without a display name', () => {
        renderHeader({channelName: '', participantCount: 3});
        expect(screen.getByText('OpenTalk meeting')).toBeInTheDocument();
    });

    it('names the participant who is sharing their screen', () => {
        renderHeader({sharer: {id: 'p2', displayName: 'Bernd'}});
        expect(screen.getByTestId('expanded-header-sharing')).toHaveTextContent('Bernd');
    });

    it('renders no sharing notice when nobody shares', () => {
        renderHeader({});
        expect(screen.queryByTestId('expanded-header-sharing')).toBeNull();
    });

    it('toggles the panel and fullscreen through their buttons', () => {
        const onTogglePanel = jest.fn();
        const onToggleFullscreen = jest.fn();
        renderHeader({onTogglePanel, onToggleFullscreen});
        fireEvent.click(screen.getByTestId('expanded-header-panel-toggle'));
        fireEvent.click(screen.getByTestId('expanded-header-fullscreen-toggle'));
        expect(onTogglePanel).toHaveBeenCalled();
        expect(onToggleFullscreen).toHaveBeenCalled();
    });
});
