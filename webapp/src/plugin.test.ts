import {id as pluginId} from './manifest';
import Plugin from './plugin';

describe('Plugin', () => {
    function setup() {
        const registerReducer = jest.fn();
        const registerWebSocketEventHandler = jest.fn();
        const registry = {registerReducer, registerWebSocketEventHandler} as any;
        const dispatch = jest.fn();
        const store = {dispatch, getState: jest.fn(), subscribe: jest.fn()} as any;
        return {plugin: new Plugin(), registry, store, registerReducer, registerWebSocketEventHandler, dispatch};
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
});
