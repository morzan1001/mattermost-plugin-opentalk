import {SignalingSocket} from './socket';
import {EventListener} from './event_listener';

class FakeWebSocket {
    static instances: FakeWebSocket[] = [];
    public readyState = 0;
    public onopen?: (e: Event) => void;
    public onmessage?: (e: MessageEvent) => void;
    public onclose?: (e: CloseEvent) => void;
    public onerror?: (e: Event) => void;
    public sent: string[] = [];
    constructor(public url: string, _protocols?: string | string[]) {
        FakeWebSocket.instances.push(this);
    }
    send(d: string) { this.sent.push(d); }
    close() {
        this.readyState = 3;
        this.onclose?.({code: 1000} as CloseEvent);
    }
}

beforeEach(() => {
    FakeWebSocket.instances = [];
    (global as any).WebSocket = FakeWebSocket;
});

function emitRaw(ws: FakeWebSocket, raw: object) {
    ws.onmessage?.({data: JSON.stringify(raw)} as MessageEvent);
}

describe('EventListener', () => {
    it('routes a normalized frame to a (namespace, action) handler', () => {
        const sock = new SignalingSocket('wss://rs', 't');
        sock.connect();
        const el = new EventListener(sock);

        const handler = jest.fn();
        el.on('control', 'joinSuccess', handler);

        // Wire format: payload.message="join_success", snake_case keys throughout.
        emitRaw(FakeWebSocket.instances[0], {
            namespace: 'control',
            payload: {message: 'join_success', participants: []},
        });

        expect(handler).toHaveBeenCalledTimes(1);
        const got = handler.mock.calls[0][0];
        expect(got).toMatchObject({action: 'joinSuccess', participants: []});
    });

    it('handles outgoing-style frames where payload.action is already set', () => {
        const sock = new SignalingSocket('wss://rs', 't');
        sock.connect();
        const el = new EventListener(sock);
        const handler = jest.fn();
        el.on('moderation', 'kicked', handler);

        emitRaw(FakeWebSocket.instances[0], {
            namespace: 'moderation',
            payload: {action: 'kicked', target: 'u1'},
        });

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0]).toMatchObject({action: 'kicked', target: 'u1'});
    });

    it('does not route a different namespace to the wrong handler', () => {
        const sock = new SignalingSocket('wss://rs', 't');
        sock.connect();
        const el = new EventListener(sock);
        const handler = jest.fn();
        el.on('control', 'joinSuccess', handler);

        emitRaw(FakeWebSocket.instances[0], {
            namespace: 'livekit',
            payload: {message: 'join_success'},
        });

        expect(handler).not.toHaveBeenCalled();
    });

    it('does not route a different action to the wrong handler', () => {
        const sock = new SignalingSocket('wss://rs', 't');
        sock.connect();
        const el = new EventListener(sock);
        const handler = jest.fn();
        el.on('control', 'joinSuccess', handler);

        emitRaw(FakeWebSocket.instances[0], {
            namespace: 'control',
            payload: {message: 'participant_connected'},
        });

        expect(handler).not.toHaveBeenCalled();
    });

    it('onAny receives every normalized frame', () => {
        const sock = new SignalingSocket('wss://rs', 't');
        sock.connect();
        const el = new EventListener(sock);
        const all = jest.fn();
        el.onAny(all);

        emitRaw(FakeWebSocket.instances[0], {namespace: 'control', payload: {message: 'join_success'}});
        emitRaw(FakeWebSocket.instances[0], {namespace: 'livekit', payload: {message: 'credentials'}});

        expect(all).toHaveBeenCalledTimes(2);
    });

    it('on() returns an unsubscribe function', () => {
        const sock = new SignalingSocket('wss://rs', 't');
        sock.connect();
        const el = new EventListener(sock);

        const handler = jest.fn();
        const unsub = el.on('control', 'joinSuccess', handler);

        emitRaw(FakeWebSocket.instances[0], {namespace: 'control', payload: {message: 'join_success'}});
        expect(handler).toHaveBeenCalledTimes(1);

        unsub();
        emitRaw(FakeWebSocket.instances[0], {namespace: 'control', payload: {message: 'join_success'}});
        expect(handler).toHaveBeenCalledTimes(1); // still 1, no second call
    });

    it('dispose() unsubscribes from the socket', () => {
        const sock = new SignalingSocket('wss://rs', 't');
        sock.connect();
        const el = new EventListener(sock);
        const handler = jest.fn();
        el.on('control', 'joinSuccess', handler);

        el.dispose();
        emitRaw(FakeWebSocket.instances[0], {namespace: 'control', payload: {message: 'join_success'}});
        expect(handler).not.toHaveBeenCalled();
    });

    it('camelCases multi-segment action values (snake_case_with_three_words)', () => {
        const sock = new SignalingSocket('wss://rs', 't');
        sock.connect();
        const el = new EventListener(sock);
        const handler = jest.fn();
        el.on('moderation', 'displayNameChangeRestrictionsEnabled', handler);

        emitRaw(FakeWebSocket.instances[0], {
            namespace: 'moderation',
            payload: {message: 'display_name_change_restrictions_enabled'},
        });
        expect(handler).toHaveBeenCalled();
    });
});
