jest.mock('./client/rest', () => ({
    ...jest.requireActual('./client/rest'),
    getConnectionStatus: jest.fn(),
    setRingtonePref: jest.fn(() => Promise.resolve()),
}));

import {getConnectionStatus, setRingtonePref} from './client/rest';
import manifest from './manifest';
import Plugin from './plugin';
import {RINGTONE_CHANGED_EVENT, ringtoneSettingKey} from './user_settings';
import {PLUGIN_STATE_KEY} from './util/selectors';

const pluginId: string = manifest.id;

describe('Plugin', () => {
    function setup() {
        const registerReducer = jest.fn();
        const registerWebSocketEventHandler = jest.fn();
        const registry = {registerReducer, registerWebSocketEventHandler} as any;
        const dispatch = jest.fn();
        const store = {dispatch, getState: jest.fn(), subscribe: jest.fn()} as any;
        return {plugin: new Plugin(), registry, store, registerReducer, registerWebSocketEventHandler, dispatch};
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function stateWith(overrides: any = {}) {
        return {
            entities: {users: {currentUserId: 'me'}},
            [PLUGIN_STATE_KEY]: {session: {status: 'idle'}},
            ...overrides,
        };
    }

    async function incomingHandler(setupResult: ReturnType<typeof setup>) {
        await setupResult.plugin.initialize(setupResult.registry, setupResult.store);
        const handler = setupResult.registerWebSocketEventHandler.mock.calls.find(
            ([event]: [string]) => event === `custom_${pluginId}_incoming_call`,
        )?.[1];
        expect(handler).toBeDefined();
        return handler;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function foreignCallMsg(overrides: any = {}) {
        return {
            data: {
                channel_id: 'ch-1',
                room_id: 'room-1',
                host_user_id: 'someone-else',
                host_name: 'Alice',
                ...overrides,
            },
        };
    }

    function dispatchedReceived(dispatch: jest.Mock) {
        return dispatch.mock.calls.filter(
            ([action]: [{type?: string}]) => action?.type === 'opentalk/incoming_calls/received',
        );
    }

    it('initialize registers a reducer', async () => {
        const {plugin, registry, store, registerReducer} = setup();
        await plugin.initialize(registry, store);
        expect(registerReducer).toHaveBeenCalledTimes(1);
    });

    it('initialize subscribes to the user_connected_state ws event', async () => {
        const {plugin, registry, store, registerWebSocketEventHandler} = setup();
        await plugin.initialize(registry, store);
        expect(registerWebSocketEventHandler).toHaveBeenCalledWith(
            `custom_${pluginId}_user_connected_state`,
            expect.any(Function),
        );
    });

    it('ws-event-handler dispatches setConnected on incoming message', async () => {
        const {plugin, registry, store, registerWebSocketEventHandler, dispatch} = setup();
        await plugin.initialize(registry, store);
        const handler = registerWebSocketEventHandler.mock.calls[0][1];
        handler({data: {mm_user_id: 'u1', connected: true, email: 'a@b'}});
        expect(dispatch).toHaveBeenCalledWith({
            type: 'opentalk/oauth/set_connected',
            connected: true,
            email: 'a@b',
        });
    });

    it('uninitialize is callable without throwing', () => {
        const {plugin} = setup();
        expect(() => plugin.uninitialize()).not.toThrow();
    });

    it('incoming_call handler dispatches even when ringtone is disabled', async () => {
        const s = setup();
        (s.store.getState as jest.Mock).mockReturnValue(stateWith());
        try {
            window.localStorage.setItem(ringtoneSettingKey, 'false');
            const handler = await incomingHandler(s);

            handler(foreignCallMsg());

            expect(dispatchedReceived(s.dispatch)).toHaveLength(1);
        } finally {
            window.localStorage.removeItem(ringtoneSettingKey);
        }
    });

    it('incoming_call handler dispatches rings without a server timestamp (staleness is owned by the modal)', async () => {
        const s = setup();
        (s.store.getState as jest.Mock).mockReturnValue(stateWith());
        const handler = await incomingHandler(s);

        handler(foreignCallMsg({created_at_unix_ms: Date.now() - 60000}));

        expect(dispatchedReceived(s.dispatch)).toHaveLength(1);
    });

    it('incoming_call handler drops rings for calls hosted by myself', async () => {
        const s = setup();
        (s.store.getState as jest.Mock).mockReturnValue(stateWith());
        const handler = await incomingHandler(s);

        handler(foreignCallMsg({host_user_id: 'me'}));

        expect(dispatchedReceived(s.dispatch)).toHaveLength(0);
    });

    it('incoming_call handler drops re-rings for the channel the session is already in', async () => {
        const s = setup();
        (s.store.getState as jest.Mock).mockReturnValue(
            stateWith({[PLUGIN_STATE_KEY]: {session: {status: 'connected', channelID: 'ch-1'}}}),
        );
        const handler = await incomingHandler(s);

        handler(foreignCallMsg({channel_id: 'ch-1'}));
        expect(dispatchedReceived(s.dispatch)).toHaveLength(0);

        // A ring for another channel still comes through.
        handler(foreignCallMsg({channel_id: 'ch-2', room_id: 'room-2'}));
        expect(dispatchedReceived(s.dispatch)).toHaveLength(1);
    });

    async function wsHandler(s: ReturnType<typeof setup>, eventName: string) {
        await s.plugin.initialize(s.registry, s.store);
        const handler = s.registerWebSocketEventHandler.mock.calls.find(
            ([event]: [string]) => event === `custom_${pluginId}_${eventName}`,
        )?.[1];
        expect(handler).toBeDefined();
        return handler;
    }

    describe('ringtone preference sync', () => {
        let events: Array<CustomEvent<boolean>>;
        const recordEvent = (e: Event) => {
            events.push(e as CustomEvent<boolean>);
        };
        beforeEach(() => {
            window.localStorage.clear();

            // Neutral seed default; individual tests override the payload.
            (getConnectionStatus as jest.Mock).mockResolvedValue({connected: false});
            events = [];
            window.addEventListener(RINGTONE_CHANGED_EVENT, recordEvent);
        });

        afterEach(() => {
            window.removeEventListener(RINGTONE_CHANGED_EVENT, recordEvent);
            window.localStorage.clear();
        });

        describe('connection seeding', () => {
            it('applies me.ringtone_enabled locally without echoing a POST', async () => {
                const s = setup();
                (getConnectionStatus as jest.Mock).mockResolvedValue({connected: true, ringtone_enabled: false});

                await s.plugin.initialize(s.registry, s.store);

                expect(window.localStorage.getItem(ringtoneSettingKey)).toBe('false');
                expect(events).toHaveLength(1);
                expect(events[0].detail).toBe(false);
                expect(setRingtonePref).not.toHaveBeenCalled();
            });

            it('seeds true when the server reports an enabled ringtone', async () => {
                const s = setup();
                (getConnectionStatus as jest.Mock).mockResolvedValue({connected: false, ringtone_enabled: true});

                await s.plugin.initialize(s.registry, s.store);

                expect(window.localStorage.getItem(ringtoneSettingKey)).toBe('true');
                expect(events[0].detail).toBe(true);
            });

            it('leaves the local setting untouched when me omits ringtone_enabled', async () => {
                const s = setup();
                (getConnectionStatus as jest.Mock).mockResolvedValue({connected: true});

                await s.plugin.initialize(s.registry, s.store);

                expect(window.localStorage.getItem(ringtoneSettingKey)).toBeNull();
                expect(events).toHaveLength(0);
                expect(setRingtonePref).not.toHaveBeenCalled();
            });
        });

        describe('ring_setting_changed ws handler', () => {
            it('stores the change locally for the own user without POSTing', async () => {
                const s = setup();
                (s.store.getState as jest.Mock).mockReturnValue(stateWith());
                const handler = await wsHandler(s, 'ring_setting_changed');

                handler({data: {mm_user_id: 'me', enabled: false}});

                expect(window.localStorage.getItem(ringtoneSettingKey)).toBe('false');
                expect(events).toHaveLength(1);
                expect(events[0].detail).toBe(false);
                expect(setRingtonePref).not.toHaveBeenCalled();
            });

            it('ignores changes for other users', async () => {
                const s = setup();
                (s.store.getState as jest.Mock).mockReturnValue(stateWith());
                const handler = await wsHandler(s, 'ring_setting_changed');

                handler({data: {mm_user_id: 'someone-else', enabled: false}});

                expect(window.localStorage.getItem(ringtoneSettingKey)).toBeNull();
                expect(events).toHaveLength(0);
            });
        });

        describe('window.opentalk handle', () => {
            it('ringtone() persists and POSTs the preference', async () => {
                const s = setup();
                (s.store.getState as jest.Mock).mockReturnValue(stateWith());
                await s.plugin.initialize(s.registry, s.store);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const returned = (window as any).opentalk.ringtone(false);

                expect(returned).toBe(false);
                expect(window.localStorage.getItem(ringtoneSettingKey)).toBe('false');
                expect(setRingtonePref).toHaveBeenCalledTimes(1);
                expect(setRingtonePref).toHaveBeenCalledWith(false);
            });

            it('killRing clears the slice and disables the ringtone persistently', async () => {
                const s = setup();
                (s.store.getState as jest.Mock).mockReturnValue(stateWith());
                await s.plugin.initialize(s.registry, s.store);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (window as any).opentalk.killRing();

                expect(s.dispatch).toHaveBeenCalledWith(
                    expect.objectContaining({type: 'opentalk/incoming_calls/reset'}),
                );
                expect(window.localStorage.getItem(ringtoneSettingKey)).toBe('false');
                expect(setRingtonePref).toHaveBeenCalledWith(false);
            });
        });
    });
});
