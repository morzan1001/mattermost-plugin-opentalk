import {render, screen, fireEvent} from '@testing-library/react';
import React from 'react';
import {Provider} from 'react-redux';
import {createStore} from 'redux';

jest.mock('../../conference/controller', () => ({
    startConferenceConnection: jest.fn().mockResolvedValue(undefined),
}));

import PostTypeMeeting from './component';

import {startConferenceConnection} from '../../conference/controller';

const basePost = {
    id: 'post-1',
    type: 'custom_opentalk_meeting',
    channel_id: 'ch-1',
    props: {
        room_id: 'room-1',
        invite_code: 'inv-1',
        host_username: 'alice',
        frontend_url: 'https://opentalk.example',
        status: 'STARTED',
        started_at: 1715000000,
    },
};

function makeStore() {
    return createStore(() => ({
        entities: {
            users: {
                currentUserId: 'u1',
                profiles: {u1: {username: 'tester'}},
            },
        },
        'plugins-com.github.morzan1001.mattermost-plugin-opentalk': {
            oauth: {connected: true},
            session: {status: 'idle', participantCount: 0},
        },
    }));
}

function renderWithStore(post: any) {
    return render(
        <Provider store={makeStore()}>
            <PostTypeMeeting post={post}/>
        </Provider>,
    );
}

describe('PostTypeMeeting', () => {
    beforeEach(() => {
        (startConferenceConnection as jest.Mock).mockClear();
    });

    it('renders host + join button for STARTED meeting', () => {
        renderWithStore(basePost as any);
        expect(screen.getByText(/alice/)).toBeInTheDocument();
        const join = screen.getByRole('button', {name: /Join meeting/i});
        expect(join).toBeInTheDocument();
    });

    it('calls startConferenceConnection when JOIN clicked', () => {
        renderWithStore(basePost as any);
        fireEvent.click(screen.getByRole('button', {name: /Join meeting/i}));
        expect(startConferenceConnection).toHaveBeenCalledWith(
            'room-1',
            'ch-1',
            'tester',
            expect.any(Object),
        );
    });

    it('shows dial-in line if SIP props present', () => {
        const p = {...basePost, props: {...basePost.props, dial_in_number: '+49 30 555 1234', dial_in_pin: '4242'}};
        renderWithStore(p as any);
        expect(screen.getByText(/PIN 4242/)).toBeInTheDocument();
        expect(screen.getByText(/4242/)).toBeInTheDocument();
    });

    it('shows ENDED state without JOIN button + duration', () => {
        const p = {
            ...basePost,
            props: {
                ...basePost.props,
                status: 'ENDED',
                ended_at: 1715000900,
                duration_seconds: 900,
            },
        };
        renderWithStore(p as any);
        expect(screen.queryByRole("button", {name: /Join meeting/i})).toBeNull();
        expect(screen.getByText(/Meeting ended/)).toBeInTheDocument();
        expect(screen.getByText(/15:00/)).toBeInTheDocument();
    });

    it('shows MISSED state', () => {
        const p = {...basePost, props: {...basePost.props, status: 'MISSED'}};
        renderWithStore(p as any);
        expect(screen.queryByRole("button", {name: /Join meeting/i})).toBeNull();
        expect(screen.getByText(/Meeting missed/)).toBeInTheDocument();
    });
});
