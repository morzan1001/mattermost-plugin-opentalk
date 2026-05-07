import {render, screen, fireEvent, act} from '@testing-library/react';
import React from 'react';
import {Provider} from 'react-redux';
import {createStore} from 'redux';

jest.mock('../../conference/controller');
jest.mock('../../client/rest');

import ChannelCallToast from './component';

import {startConferenceConnection} from '../../conference/controller';
import {activeMeetingDismissed} from '../../store/slice_active_meetings';

import {PLUGIN_STATE_KEY} from '../../util/selectors';

const stateKey = PLUGIN_STATE_KEY;

const mockMeeting = {
    channelID: 'ch-1',
    roomID: 'room-1',
    hostUserID: 'host-user-1',
    hostName: 'Alice',
    receivedAt: 1715000000000,
    dismissed: false,
};

interface MakeStoreOptions {
    channelID?: string;
    channelType?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    activeMeetings?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sessionOverrides?: any;
}

function makeStore({
    channelID = 'ch-1',
    channelType = 'O',
    activeMeetings = {byChannelID: {'ch-1': mockMeeting}},
    sessionOverrides = {},
}: MakeStoreOptions = {}) {
    const dispatched: unknown[] = [];
    const store = createStore(() => ({
        entities: {
            users: {
                currentUserId: 'u1',
                profiles: {
                    u1: {username: 'tester', nickname: '', first_name: '', last_name: ''},
                },
            },
            channels: {
                currentChannelId: channelID,
                channels: {
                    [channelID]: {id: channelID, type: channelType},
                },
            },
        },
        [stateKey]: {
            session: {
                status: 'idle',
                channelID: undefined,
                ...sessionOverrides,
            },
            activeMeetings,
        },
    }));

    const originalDispatch = store.dispatch.bind(store);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (store as any).dispatchedActions = dispatched;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store.dispatch = (action: any) => {
        dispatched.push(action);
        return originalDispatch(action);
    };

    return store;
}

function renderToast(store: ReturnType<typeof makeStore>) {
    return render(
        <Provider store={store}>
            <ChannelCallToast/>
        </Provider>,
    );
}

beforeEach(() => {
    jest.clearAllMocks();
    (startConferenceConnection as jest.Mock).mockResolvedValue(undefined);
});

describe('ChannelCallToast', () => {
    it('returns null when no active meeting in current channel', () => {
        const store = makeStore({activeMeetings: {byChannelID: {}}});
        const {container} = renderToast(store);
        expect(screen.queryByTestId('channel-call-toast')).not.toBeInTheDocument();
        expect(container.firstChild).toBeNull();
    });

    it('returns null when channel is a DM (type=D)', () => {
        const store = makeStore({channelType: 'D'});
        const {container} = renderToast(store);
        expect(screen.queryByTestId('channel-call-toast')).not.toBeInTheDocument();
        expect(container.firstChild).toBeNull();
    });

    it('returns null when channel is a Group-DM (type=G)', () => {
        const store = makeStore({channelType: 'G'});
        const {container} = renderToast(store);
        expect(screen.queryByTestId('channel-call-toast')).not.toBeInTheDocument();
        expect(container.firstChild).toBeNull();
    });

    it('returns null when user is in the meeting in the same channel', () => {
        const store = makeStore({
            sessionOverrides: {status: 'connected', channelID: 'ch-1'},
        });
        const {container} = renderToast(store);
        expect(screen.queryByTestId('channel-call-toast')).not.toBeInTheDocument();
        expect(container.firstChild).toBeNull();
    });

    it('renders banner when active meeting exists in a public channel', () => {
        const store = makeStore({channelType: 'O'});
        renderToast(store);
        expect(screen.getByTestId('channel-call-toast')).toBeInTheDocument();
        expect(screen.getByText('Meeting running · started by Alice')).toBeInTheDocument();
        expect(screen.getByText('Join')).toBeInTheDocument();
        expect(screen.getByLabelText('Dismiss notification')).toBeInTheDocument();
    });

    it('renders banner when active meeting exists in a private channel', () => {
        const store = makeStore({channelType: 'P'});
        renderToast(store);
        expect(screen.getByTestId('channel-call-toast')).toBeInTheDocument();
    });

    it('renders nothing when meeting is dismissed locally', () => {
        const store = makeStore({
            activeMeetings: {byChannelID: {'ch-1': {...mockMeeting, dismissed: true}}},
        });
        const {container} = renderToast(store);
        expect(screen.queryByTestId('channel-call-toast')).not.toBeInTheDocument();
        expect(container.firstChild).toBeNull();
    });

    it('click Join calls startConferenceConnection with (roomID, channelID, displayName, store)', async () => {
        const store = makeStore({channelType: 'O'});
        renderToast(store);

        await act(async () => {
            fireEvent.click(screen.getByText('Join'));
        });

        expect(startConferenceConnection).toHaveBeenCalledWith(
            'room-1',
            'ch-1',
            'tester',
            expect.any(Object),
        );
    });

    it('click × dispatches activeMeetingDismissed', () => {
        const store = makeStore({channelType: 'O'});
        renderToast(store);

        fireEvent.click(screen.getByLabelText('Dismiss notification'));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dispatched = (store as any).dispatchedActions as unknown[];
        const expectedAction = activeMeetingDismissed({channelID: 'ch-1'});
        expect(dispatched).toEqual(
            expect.arrayContaining([
                expect.objectContaining(expectedAction),
            ]),
        );
    });
});
