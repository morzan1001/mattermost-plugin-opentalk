import {render, screen, fireEvent, act} from '@testing-library/react';
import React from 'react';
import {Provider} from 'react-redux';
import {createStore} from 'redux';

jest.mock('../../client/rest');
jest.mock('../../conference/controller');
jest.mock('../../hooks/use_ringtone', () => {
    const start = jest.fn();
    const stop = jest.fn();
    return {useRingtone: () => ({start, stop})};
});

import IncomingCallModal from './component';

import {dismissIncomingCall} from '../../client/rest';
import {startConferenceConnection} from '../../conference/controller';
import {useRingtone} from '../../hooks/use_ringtone';
import {
    incomingCallDismissed,
    incomingCallCleared,
    incomingCallReceived,
    incomingCallsReducer,
    type IncomingCall,
    type IncomingCallsState,
} from '../../store/slice_incoming_calls';
import {RINGTONE_CHANGED_EVENT, ringtoneSettingKey} from '../../user_settings';
import {PLUGIN_STATE_KEY} from '../../util/selectors';

const stateKey = PLUGIN_STATE_KEY;

function makeCall(overrides: Partial<IncomingCall> = {}): IncomingCall {
    return {
        channelID: 'ch-1',
        roomID: 'room-1',
        hostUserID: 'host-user-1',
        hostName: 'Alice Tester',
        receivedAt: Date.now(),
        dismissed: false,
        ...overrides,
    };
}

// Reducer-backed incoming-calls slice so tests can dispatch incomingCallReceived
// mid-test (e.g. a same-channel re-ring) and have the modal observe it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeStore(sessionOverrides: any = {}, initialIncomingCalls: IncomingCallsState = {byChannelID: {}}) {
    const dispatched: unknown[] = [];

    // Stable session object so tests can mutate status mid-flow (e.g. a mocked
    // startConferenceConnection flipping it to 'connected') and have selectors
    // observe the change through getState().
    const session = {status: 'idle', ...sessionOverrides};

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reducer = (state: any, action: any) => ({
        entities: {
            users: {
                currentUserId: 'u1',
                profiles: {
                    u1: {username: 'tester', nickname: '', first_name: '', last_name: ''},
                },
            },
        },
        [stateKey]: {
            session,
            incomingCalls: incomingCallsReducer(
                state === undefined ? initialIncomingCalls : state[stateKey].incomingCalls,
                action,
            ),
        },
    });

    const store = createStore(reducer);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (store as any).setSessionStatus = (s: string) => {
        session.status = s;
    };

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

// The mocked hook returns one stable {start, stop} pair; grab it to assert.
function useRingtoneMock(): {start: jest.Mock; stop: jest.Mock} {
    return useRingtone() as unknown as {start: jest.Mock; stop: jest.Mock};
}

beforeEach(() => {
    jest.clearAllMocks();
    (dismissIncomingCall as jest.Mock).mockResolvedValue(undefined);
    (startConferenceConnection as jest.Mock).mockResolvedValue(undefined);
    window.localStorage.clear();
    jest.useRealTimers();
});

afterEach(() => {
    window.localStorage.clear();
});

describe('IncomingCallModal', () => {
    it('returns null when there are no incoming calls', () => {
        const store = makeStore({status: 'idle'}, {byChannelID: {}});
        const {container} = renderModal(store);
        expect(screen.queryByTestId('incoming-call-modal')).not.toBeInTheDocument();
        expect(container.firstChild).toBeNull();
    });

    it('returns null when user is already in a connected meeting', () => {
        const store = makeStore(
            {status: 'connected'},
            {byChannelID: {'ch-1': makeCall()}},
        );
        const {container} = renderModal(store);
        expect(screen.queryByTestId('incoming-call-modal')).not.toBeInTheDocument();
        expect(container.firstChild).toBeNull();
    });

    it('returns null when session.status is connecting (SwitchCallModal handles non-idle states)', () => {
        const store = makeStore(
            {status: 'connecting'},
            {byChannelID: {'ch-1': makeCall()}},
        );
        const {container} = renderModal(store);
        expect(screen.queryByTestId('incoming-call-modal')).not.toBeInTheDocument();
        expect(container.firstChild).toBeNull();
    });

    it('returns null when all incoming calls are dismissed', () => {
        const store = makeStore(
            {status: 'idle'},
            {byChannelID: {'ch-1': makeCall({dismissed: true})}},
        );
        const {container} = renderModal(store);
        expect(screen.queryByTestId('incoming-call-modal')).not.toBeInTheDocument();
        expect(container.firstChild).toBeNull();
    });

    it('renders modal when there is a non-dismissed call and status is idle', () => {
        const store = makeStore(
            {status: 'idle'},
            {byChannelID: {'ch-1': makeCall()}},
        );
        renderModal(store);
        expect(screen.getByTestId('incoming-call-modal')).toBeInTheDocument();
        expect(screen.getByText('Alice Tester is calling')).toBeInTheDocument();
        expect(screen.getByText('ringing …')).toBeInTheDocument();
    });

    it('Accept calls startConferenceConnection with correct args and dispatches incomingCallCleared', async () => {
        const store = makeStore(
            {status: 'idle'},
            {byChannelID: {'ch-1': makeCall()}},
        );

        // A successful connect leaves the session non-idle; the modal only
        // clears the ring once it observes that.
        (startConferenceConnection as jest.Mock).mockImplementation(async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (store as any).setSessionStatus('connected');
        });
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

    it('Accept that fails to connect keeps the ringing call (no incomingCallCleared)', async () => {
        const store = makeStore(
            {status: 'idle'},
            {byChannelID: {'ch-1': makeCall()}},
        );

        // startConferenceConnection swallows connect errors and stays 'idle';
        // the modal must not clear the call so the user can retry.
        (startConferenceConnection as jest.Mock).mockResolvedValue(undefined);
        renderModal(store);

        await act(async () => {
            fireEvent.click(screen.getByText('Accept'));
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dispatched = (store as any).dispatchedActions as unknown[];
        const clearedAction = incomingCallCleared({channelID: 'ch-1'});
        expect(dispatched).not.toContainEqual(
            expect.objectContaining(clearedAction),
        );
    });

    it('shows the newest non-dismissed call when several channels ring at once', () => {
        const store = makeStore(
            {status: 'idle'},
            {byChannelID: {
                'ch-1': makeCall({receivedAt: Date.now() - 5000}),
                'ch-2': makeCall({
                    channelID: 'ch-2',
                    roomID: 'room-2',
                    hostUserID: 'host-user-2',
                    hostName: 'Bob Later',
                    receivedAt: Date.now(),
                }),
            }},
        );
        renderModal(store);

        expect(screen.getByText('Bob Later is calling')).toBeInTheDocument();
        expect(screen.queryByText('Alice Tester is calling')).not.toBeInTheDocument();
    });

    it('Decline failure warns, keeps the entry and re-enables the buttons for a re-ring', async () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        (dismissIncomingCall as jest.Mock).mockRejectedValue(new Error('network down'));
        const store = makeStore(
            {status: 'idle'},
            {byChannelID: {'ch-1': makeCall()}},
        );
        renderModal(store);

        await act(async () => {
            fireEvent.click(screen.getByText('Decline'));
        });

        expect(dismissIncomingCall).toHaveBeenCalledWith('ch-1', 'room-1');
        expect(warnSpy).toHaveBeenCalledWith('[opentalk] dismiss failed:', 'network down');

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dispatched = (store as any).dispatchedActions as unknown[];
        expect(dispatched).not.toEqual(
            expect.arrayContaining([
                expect.objectContaining(incomingCallCleared({channelID: 'ch-1'})),
            ]),
        );

        // Entry survived: a same-channel re-ring shows again with usable buttons.
        await act(async () => {
            store.dispatch(incomingCallReceived(makeCall()));
        });
        const acceptBtn = screen.getByRole('button', {name: 'Accept'}) as HTMLButtonElement;
        expect(acceptBtn.disabled).toBe(false);
        expect((screen.getByRole('button', {name: 'Decline'}) as HTMLButtonElement).disabled).toBe(false);

        warnSpy.mockRestore();
    });

    it('Decline calls dismissIncomingCall with (channelID, roomID), dispatches incomingCallDismissed then incomingCallCleared', async () => {
        jest.useFakeTimers();
        const store = makeStore(
            {status: 'idle'},
            {byChannelID: {'ch-1': makeCall()}},
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

    describe('freshness window', () => {
        afterEach(() => {
            jest.useRealTimers();
        });

        it('auto-declines a fresh call with dismissIncomingCall after 30s', async () => {
            jest.useFakeTimers();
            const store = makeStore(
                {status: 'idle'},
                {byChannelID: {'ch-1': makeCall()}},
            );
            renderModal(store);

            await act(async () => {
                jest.advanceTimersByTime(29999);
            });
            expect(dismissIncomingCall).not.toHaveBeenCalled();

            await act(async () => {
                jest.advanceTimersByTime(1);
            });

            expect(dismissIncomingCall).toHaveBeenCalledWith('ch-1', 'room-1');

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const dispatched = (store as any).dispatchedActions as unknown[];
            expect(dispatched).toEqual(
                expect.arrayContaining([
                    expect.objectContaining(incomingCallDismissed({channelID: 'ch-1'})),
                ]),
            );
        });

        it('re-ring on the same channel reschedules auto-decline to the new receivedAt + 30s', async () => {
            jest.useFakeTimers();
            const store = makeStore(
                {status: 'idle'},
                {byChannelID: {'ch-1': makeCall()}},
            );
            renderModal(store);

            await act(async () => {
                jest.advanceTimersByTime(20000);
            });
            expect(dismissIncomingCall).not.toHaveBeenCalled();

            // Same-channel re-ring at t=20s: the deadline must move to t=50s.
            await act(async () => {
                store.dispatch(incomingCallReceived(makeCall()));
            });

            // Past the original t=30s deadline: must still be ringing.
            await act(async () => {
                jest.advanceTimersByTime(10000);
            });
            expect(dismissIncomingCall).not.toHaveBeenCalled();

            await act(async () => {
                jest.advanceTimersByTime(19999);
            });
            expect(dismissIncomingCall).not.toHaveBeenCalled();

            await act(async () => {
                jest.advanceTimersByTime(1);
            });
            expect(dismissIncomingCall).toHaveBeenCalledTimes(1);
        });

        it('stale entry (receivedAt 31s ago) expires locally without dismissIncomingCall or MISSED marking', () => {
            const stale = makeCall({receivedAt: Date.now() - 31000});
            const store = makeStore(
                {status: 'idle'},
                {byChannelID: {'ch-1': stale}},
            );
            renderModal(store);

            expect(screen.queryByTestId('incoming-call-modal')).not.toBeInTheDocument();

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const dispatched = (store as any).dispatchedActions as unknown[];
            expect(dispatched).toEqual(
                expect.arrayContaining([
                    expect.objectContaining(incomingCallCleared({channelID: 'ch-1'})),
                ]),
            );
            expect(dispatched).not.toEqual(
                expect.arrayContaining([
                    expect.objectContaining(incomingCallDismissed({channelID: 'ch-1'})),
                ]),
            );
            expect(dismissIncomingCall).not.toHaveBeenCalled();
        });
    });

    describe('keyboard', () => {
        it('focuses the Accept button when a call rings', () => {
            const store = makeStore(
                {status: 'idle'},
                {byChannelID: {'ch-1': makeCall()}},
            );
            renderModal(store);

            expect(document.activeElement).toBe(screen.getByRole('button', {name: 'Accept'}));
        });

        it('Enter accepts the current call', async () => {
            const store = makeStore(
                {status: 'idle'},
                {byChannelID: {'ch-1': makeCall()}},
            );
            renderModal(store);

            await act(async () => {
                fireEvent.keyDown(window, {key: 'Enter'});
            });

            expect(startConferenceConnection).toHaveBeenCalledWith(
                'room-1',
                'ch-1',
                'tester',
                expect.any(Object),
            );
        });

        it('Escape declines the current call', async () => {
            jest.useFakeTimers();
            const store = makeStore(
                {status: 'idle'},
                {byChannelID: {'ch-1': makeCall()}},
            );
            renderModal(store);

            await act(async () => {
                fireEvent.keyDown(window, {key: 'Escape'});
            });

            expect(dismissIncomingCall).toHaveBeenCalledWith('ch-1', 'room-1');

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const dispatched = (store as any).dispatchedActions as unknown[];
            expect(dispatched).toEqual(
                expect.arrayContaining([
                    expect.objectContaining(incomingCallDismissed({channelID: 'ch-1'})),
                ]),
            );

            jest.useRealTimers();
        });
    });

    describe('avatar fallback', () => {
        it('swaps the avatar image to host initials on image error', () => {
            const store = makeStore(
                {status: 'idle'},
                {byChannelID: {'ch-1': makeCall({hostName: 'Alice Tester'})}},
            );
            renderModal(store);

            expect(screen.queryByText('AT')).not.toBeInTheDocument();
            fireEvent.error(screen.getByAltText('Alice Tester'));

            expect(screen.queryByAltText('Alice Tester')).not.toBeInTheDocument();
            expect(screen.getByText('AT')).toBeInTheDocument();
        });

        it('shows the image again when a different host calls next', () => {
            const store = makeStore(
                {status: 'idle'},
                {byChannelID: {'ch-1': makeCall({hostName: 'Alice Tester'})}},
            );
            renderModal(store);
            fireEvent.error(screen.getByAltText('Alice Tester'));
            expect(screen.getByText('AT')).toBeInTheDocument();

            act(() => {
                store.dispatch(incomingCallReceived(makeCall({
                    channelID: 'ch-2',
                    roomID: 'room-2',
                    hostUserID: 'host-user-2',
                    hostName: 'Bob Fields',
                })));
            });

            expect(screen.getByAltText('Bob Fields')).toBeInTheDocument();
            expect(screen.queryByText('AT')).not.toBeInTheDocument();
        });
    });

    describe('mid-ring setting change', () => {
        function renderRinging() {
            const store = makeStore(
                {status: 'idle'},
                {byChannelID: {'ch-1': makeCall()}},
            );
            renderModal(store);
        }

        it('does not start the ringtone when the setting is off at ring time', () => {
            window.localStorage.setItem(ringtoneSettingKey, 'false');
            renderRinging();

            expect(useRingtoneMock().start).not.toHaveBeenCalled();
        });

        it('stops the ringtone when the custom event flips the setting off mid-ring', () => {
            renderRinging();
            expect(useRingtoneMock().start).toHaveBeenCalledTimes(1);
            expect(useRingtoneMock().stop).not.toHaveBeenCalled();

            act(() => {
                window.localStorage.setItem(ringtoneSettingKey, 'false');
                window.dispatchEvent(new CustomEvent(RINGTONE_CHANGED_EVENT, {detail: false}));
            });

            expect(useRingtoneMock().stop).toHaveBeenCalledTimes(1);
        });

        it('keeps ringing when the custom event enables the setting mid-ring', () => {
            renderRinging();

            act(() => {
                window.dispatchEvent(new CustomEvent(RINGTONE_CHANGED_EVENT, {detail: true}));
            });

            expect(useRingtoneMock().stop).not.toHaveBeenCalled();
        });

        it('stops the ringtone on a storage event for the ringtone key (other tab)', () => {
            renderRinging();

            act(() => {
                window.localStorage.setItem(ringtoneSettingKey, 'false');
                window.dispatchEvent(new StorageEvent('storage', {key: ringtoneSettingKey}));
            });

            expect(useRingtoneMock().stop).toHaveBeenCalledTimes(1);
        });

        it('ignores storage events for other keys', () => {
            renderRinging();

            act(() => {
                window.localStorage.setItem(ringtoneSettingKey, 'false');
                window.dispatchEvent(new StorageEvent('storage', {key: 'unrelated:key'}));
            });

            expect(useRingtoneMock().stop).not.toHaveBeenCalled();
        });

        it('removes the listeners when the modal tears down', () => {
            const store = makeStore(
                {status: 'idle'},
                {byChannelID: {'ch-1': makeCall()}},
            );
            const {unmount} = renderModal(store);
            unmount();

            // Effect teardown stops the ring itself; baseline taken after it.
            const stopsAfterTeardown = useRingtoneMock().stop.mock.calls.length;

            act(() => {
                window.localStorage.setItem(ringtoneSettingKey, 'false');
                window.dispatchEvent(new CustomEvent(RINGTONE_CHANGED_EVENT, {detail: false}));
                window.dispatchEvent(new StorageEvent('storage', {key: ringtoneSettingKey}));
            });

            // Only the effect-cleanup stop fired; no listener reacted afterwards.
            expect(useRingtoneMock().stop).toHaveBeenCalledTimes(stopsAfterTeardown);
        });
    });
});
