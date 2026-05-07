import {render, screen, fireEvent, act} from '@testing-library/react';
import React from 'react';
import {Provider} from 'react-redux';
import {createStore} from 'redux';

jest.mock('../../client/rest');
jest.mock('../../conference/controller');

import SwitchCallModal from './component';

import {dismissIncomingCall} from '../../client/rest';
import {leaveActiveConference, startConferenceConnection} from '../../conference/controller';
import {incomingCallDismissed, incomingCallCleared} from '../../store/slice_incoming_calls';

const stateKey = 'plugins-com.github.morzan1001.mattermost-plugin-opentalk';

const mockCall = {
    channelID: 'ch-1',
    roomID: 'room-1',
    hostUserID: 'host-user-1',
    hostName: 'Bob Caller',
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
                status: 'connected',
                ...sessionOverrides,
            },
            incomingCalls,
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

function renderModal(store: ReturnType<typeof makeStore>) {
    return render(
        <Provider store={store}>
            <SwitchCallModal/>
        </Provider>,
    );
}

beforeEach(() => {
    jest.clearAllMocks();
    (dismissIncomingCall as jest.Mock).mockResolvedValue(undefined);
    (leaveActiveConference as jest.Mock).mockResolvedValue(undefined);
    (startConferenceConnection as jest.Mock).mockResolvedValue(undefined);
    jest.useRealTimers();
});

describe('SwitchCallModal', () => {
    it('returns null when there is no incoming call', () => {
        const store = makeStore({status: 'connected'}, {byChannelID: {}});
        const {container} = renderModal(store);
        expect(screen.queryByTestId('switch-call-modal')).not.toBeInTheDocument();
        expect(container.firstChild).toBeNull();
    });

    it('returns null when user is idle (IncomingCallModal handles that case)', () => {
        const store = makeStore(
            {status: 'idle'},
            {byChannelID: {'ch-1': mockCall}},
        );
        const {container} = renderModal(store);
        expect(screen.queryByTestId('switch-call-modal')).not.toBeInTheDocument();
        expect(container.firstChild).toBeNull();
    });

    it('renders modal when user is in another call AND there is an incoming call', () => {
        const store = makeStore(
            {status: 'connected'},
            {byChannelID: {'ch-1': mockCall}},
        );
        renderModal(store);
        expect(screen.getByTestId('switch-call-modal')).toBeInTheDocument();
        expect(screen.getByText('Du bist bereits in einem Meeting')).toBeInTheDocument();
        expect(screen.getByText('Bob Caller')).toBeInTheDocument();
        expect(screen.getByText('Wechseln')).toBeInTheDocument();
        expect(screen.getByText('Abbrechen')).toBeInTheDocument();
    });

    it('click Abbrechen calls dismissIncomingCall and dispatches incomingCallDismissed', async () => {
        jest.useFakeTimers();
        const store = makeStore(
            {status: 'connected'},
            {byChannelID: {'ch-1': mockCall}},
        );
        renderModal(store);

        await act(async () => {
            fireEvent.click(screen.getByText('Abbrechen'));
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

    it('click Wechseln calls leaveActiveConference then startConferenceConnection and dispatches incomingCallCleared', async () => {
        jest.useFakeTimers();
        const store = makeStore(
            {status: 'connected'},
            {byChannelID: {'ch-1': mockCall}},
        );
        renderModal(store);

        // Click Wechseln; leaveActiveConference resolves, then there's a
        // 50 ms settle timeout before startConferenceConnection is called.
        fireEvent.click(screen.getByText('Wechseln'));

        // Let leaveActiveConference's promise microtask queue flush.
        await act(async () => {
            await Promise.resolve();
        });

        expect(leaveActiveConference).toHaveBeenCalled();

        // Advance past the 50 ms settle.
        await act(async () => {
            jest.advanceTimersByTime(100);
        });

        expect(startConferenceConnection).toHaveBeenCalledWith(
            'room-1',
            'ch-1',
            expect.any(String),
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

        jest.useRealTimers();
    });
});
