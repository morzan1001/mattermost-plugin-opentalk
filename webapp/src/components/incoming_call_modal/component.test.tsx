import {render, screen, fireEvent, act} from '@testing-library/react';
import React from 'react';
import {Provider} from 'react-redux';
import {createStore} from 'redux';

jest.mock('../../client/rest');
jest.mock('../../conference/controller');
jest.mock('../../hooks/use_ringtone', () => ({
    useRingtone: () => ({start: jest.fn(), stop: jest.fn()}),
}));

import IncomingCallModal from './component';

import {dismissIncomingCall} from '../../client/rest';
import {startConferenceConnection} from '../../conference/controller';
import {incomingCallDismissed, incomingCallCleared} from '../../store/slice_incoming_calls';

const stateKey = 'plugins-com.github.morzan1001.mattermost-plugin-opentalk';

const mockCall = {
    channelID: 'ch-1',
    roomID: 'room-1',
    hostUserID: 'host-user-1',
    hostName: 'Alice Tester',
    receivedAt: 1715000000000,
    dismissed: false,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeStore(sessionOverrides: any = {}, incomingCalls: any = {byChannelID: {}}) {
    const dispatched: unknown[] = [];
    const store = createStore(() => ({
        entities: {
            users: {
                currentUserId: 'u1',
                profiles: {
                    u1: {username: 'tester', nickname: '', first_name: '', last_name: ''},
                },
            },
        },
        [stateKey]: {
            session: {
                status: 'idle',
                ...sessionOverrides,
            },
            incomingCalls,
        },
    }));

    // Track dispatched actions for assertions
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

function renderModal(store: ReturnType<typeof makeStore>) {
    return render(
        <Provider store={store}>
            <IncomingCallModal/>
        </Provider>,
    );
}

beforeEach(() => {
    jest.clearAllMocks();
    (dismissIncomingCall as jest.Mock).mockResolvedValue(undefined);
    (startConferenceConnection as jest.Mock).mockResolvedValue(undefined);
    jest.useRealTimers();
});

describe('IncomingCallModal', () => {
    it('returns null when there are no incoming calls', () => {
        const store = makeStore({status: 'idle'}, {byChannelID: {}});
        const {container} = renderModal(store);
        expect(screen.queryByTestId('incoming-call-modal')).not.toBeInTheDocument();
        expect(container.firstChild).toBeNull();
    });

    it('returns null when user is in a meeting (session.status !== idle)', () => {
        const store = makeStore(
            {status: 'connected'},
            {byChannelID: {'ch-1': mockCall}},
        );
        const {container} = renderModal(store);
        expect(screen.queryByTestId('incoming-call-modal')).not.toBeInTheDocument();
        expect(container.firstChild).toBeNull();
    });

    it('returns null when all incoming calls are dismissed', () => {
        const store = makeStore(
            {status: 'idle'},
            {byChannelID: {'ch-1': {...mockCall, dismissed: true}}},
        );
        const {container} = renderModal(store);
        expect(screen.queryByTestId('incoming-call-modal')).not.toBeInTheDocument();
        expect(container.firstChild).toBeNull();
    });

    it('renders modal when there is a non-dismissed call and status is idle', () => {
        const store = makeStore(
            {status: 'idle'},
            {byChannelID: {'ch-1': mockCall}},
        );
        renderModal(store);
        expect(screen.getByTestId('incoming-call-modal')).toBeInTheDocument();
        expect(screen.getByText('Alice Tester is calling')).toBeInTheDocument();
        expect(screen.getByText('ringing …')).toBeInTheDocument();
    });

    it('Accept calls startConferenceConnection with correct args and dispatches incomingCallCleared', async () => {
        const store = makeStore(
            {status: 'idle'},
            {byChannelID: {'ch-1': mockCall}},
        );
        renderModal(store);

        await act(async () => {
            fireEvent.click(screen.getByText('Accept'));
        });

        expect(startConferenceConnection).toHaveBeenCalledWith(
            'room-1',
            'ch-1',
            'tester',
            expect.any(Object),
        );

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dispatched = (store as any).dispatchedActions as unknown[];
        const clearedAction = incomingCallCleared({channelID: 'ch-1'});
        expect(dispatched).toEqual(
            expect.arrayContaining([
                expect.objectContaining(clearedAction),
            ]),
        );
    });

    it('Decline calls dismissIncomingCall with (channelID, roomID), dispatches incomingCallDismissed then incomingCallCleared', async () => {
        jest.useFakeTimers();
        const store = makeStore(
            {status: 'idle'},
            {byChannelID: {'ch-1': mockCall}},
        );
        renderModal(store);

        await act(async () => {
            fireEvent.click(screen.getByText('Decline'));
        });

        expect(dismissIncomingCall).toHaveBeenCalledWith('ch-1', 'room-1');

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dispatched = (store as any).dispatchedActions as unknown[];
        const dismissedAction = incomingCallDismissed({channelID: 'ch-1'});
        expect(dispatched).toEqual(
            expect.arrayContaining([
                expect.objectContaining(dismissedAction),
            ]),
        );

        // Advance timers to trigger the setTimeout for incomingCallCleared
        await act(async () => {
            jest.advanceTimersByTime(300);
        });

        const clearedAction = incomingCallCleared({channelID: 'ch-1'});
        expect(dispatched).toEqual(
            expect.arrayContaining([
                expect.objectContaining(clearedAction),
            ]),
        );

        jest.useRealTimers();
    });

    it('auto-declines after 30s', async () => {
        jest.useFakeTimers();
        const store = makeStore(
            {status: 'idle'},
            {byChannelID: {'ch-1': mockCall}},
        );
        renderModal(store);

        await act(async () => {
            jest.advanceTimersByTime(30000);
        });

        expect(dismissIncomingCall).toHaveBeenCalledWith('ch-1', 'room-1');

        jest.useRealTimers();
    });
});
