import {SignalingSocket} from './socket';

class FakeWebSocket {
    static instances: FakeWebSocket[] = [];
    public readyState = 0;
    public onopen?: (e: Event) => void;
    public onmessage?: (e: MessageEvent) => void;
    public onclose?: (e: CloseEvent) => void;
    public onerror?: (e: Event) => void;
    public sent: string[] = [];
    public protocols: string[];
    constructor(public url: string, protocols?: string | string[]) {
        this.protocols = Array.isArray(protocols) ? protocols : (protocols ? [protocols] : []);
        FakeWebSocket.instances.push(this);
    }
    send(d: string) {
        this.sent.push(d);
    }
    close() {
        this.readyState = 3;
        this.onclose?.({code: 1000} as CloseEvent);
    }
}

beforeEach(() => {
    FakeWebSocket.instances = [];
    (global as any).WebSocket = FakeWebSocket;
});

describe('SignalingSocket', () => {
    it('opens WebSocket to <baseURL>/signaling and sends ticket as Sec-WebSocket-Protocol', () => {
        const s = new SignalingSocket('wss://rs.example', 'ticket-abc');
        s.connect();
        expect(FakeWebSocket.instances).toHaveLength(1);
        expect(FakeWebSocket.instances[0].url).toBe('wss://rs.example/signaling');
        expect(FakeWebSocket.instances[0].protocols).toEqual([
            'ticket#ticket-abc',
            'opentalk-signaling-json-v1.0',
        ]);
    });

    it('strips trailing slash from base URL', () => {
        const s = new SignalingSocket('wss://rs.example/', 'ticket');
        s.connect();
        expect(FakeWebSocket.instances[0].url).toBe('wss://rs.example/signaling');
    });

    it('keeps ticket "#" unencoded inside the Sec-WebSocket-Protocol header', () => {
        // Real OpenTalk tickets have the form "<roomID>#<random>". The "#"
        // belongs to the protocol-name token (RFC 7230 tchar) and is
        // transmitted verbatim; it is not a URL fragment marker here.
        const s = new SignalingSocket('wss://rs.example', 'room-1#secret-abc');
        s.connect();
        expect(FakeWebSocket.instances[0].url).toBe('wss://rs.example/signaling');
        expect(FakeWebSocket.instances[0].protocols[0]).toBe('ticket#room-1#secret-abc');
    });

    it('emits "open" when WebSocket opens', () => {
        const s = new SignalingSocket('wss://rs.example', 'ticket');
        const onOpen = jest.fn();
        s.on('open', onOpen);
        s.connect();
        FakeWebSocket.instances[0].onopen?.({} as Event);
        expect(onOpen).toHaveBeenCalled();
    });

    it('camelCases keys in incoming JSON messages', () => {
        const s = new SignalingSocket('wss://rs.example', 'ticket');
        const onMessage = jest.fn();
        s.on('message', onMessage);
        s.connect();
        FakeWebSocket.instances[0].onmessage?.({data: JSON.stringify({snake_case_key: 'v', nested: {another_key: 1}})} as MessageEvent);
        expect(onMessage).toHaveBeenCalledWith({snakeCaseKey: 'v', nested: {anotherKey: 1}});
    });

    it('snake_cases keys in outgoing payloads', () => {
        const s = new SignalingSocket('wss://rs.example', 'ticket');
        s.connect();
        FakeWebSocket.instances[0].onopen?.({} as Event);
        s.send({camelCaseKey: 'v', payload: {action: 'join', displayName: 'alice'}});
        expect(FakeWebSocket.instances[0].sent).toHaveLength(1);
        const sent = JSON.parse(FakeWebSocket.instances[0].sent[0]);
        expect(sent).toEqual({camel_case_key: 'v', payload: {action: 'join', display_name: 'alice'}});
    });

    it('emits "close" with code on disconnect', () => {
        const s = new SignalingSocket('wss://rs.example', 'ticket');
        const onClose = jest.fn();
        s.on('close', onClose);
        s.connect();
        FakeWebSocket.instances[0].close();
        expect(onClose).toHaveBeenCalledWith(expect.objectContaining({code: 1000}));
    });

    it('disconnect() closes the WebSocket', () => {
        const s = new SignalingSocket('wss://rs.example', 'ticket');
        s.connect();
        const ws = FakeWebSocket.instances[0];
        s.disconnect();
        expect(ws.readyState).toBe(3);
    });

    it('does not preserve known wire-protocol "action" values when round-tripping', () => {
        // sanity: "action" with a known camelCase token like "joinSuccess" must
        // become "join_success" outgoing
        const s = new SignalingSocket('wss://rs.example', 'ticket');
        s.connect();
        FakeWebSocket.instances[0].onopen?.({} as Event);
        s.send({namespace: 'core', payload: {action: 'joinSuccess'}});
        const sent = JSON.parse(FakeWebSocket.instances[0].sent[0]);
        expect(sent.payload.action).toBe('join_success');
    });
});

describe('SignalingSocket echo heartbeat', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    function openSocket(): {s: SignalingSocket; ws: FakeWebSocket} {
        const s = new SignalingSocket('wss://rs.example', 'ticket');
        s.connect();
        const ws = FakeWebSocket.instances[0];
        ws.onopen?.({} as Event);
        return {s, ws};
    }

    function sentFrames(ws: FakeWebSocket): object[] {
        return ws.sent.map((raw) => JSON.parse(raw));
    }

    it('sends an echo ping every 12 seconds once open', () => {
        const {ws} = openSocket();
        const echoReply = {data: JSON.stringify({namespace: 'echo', payload: {action: 'echo'}})} as MessageEvent;

        jest.advanceTimersByTime(12 * 1000);
        ws.onmessage?.(echoReply);
        jest.advanceTimersByTime(12 * 1000);

        const frames = sentFrames(ws);
        expect(frames).toHaveLength(2);
        for (const f of frames) {
            expect(f).toEqual({namespace: 'echo', payload: {action: 'ping'}});
        }
    });

    it('sends no pings before the socket opens and none after close', () => {
        const s = new SignalingSocket('wss://rs.example', 'ticket');
        s.connect();
        const ws = FakeWebSocket.instances[0];

        jest.advanceTimersByTime(30 * 1000);
        expect(ws.sent).toHaveLength(0);

        ws.onopen?.({} as Event);
        jest.advanceTimersByTime(12 * 1000);
        expect(ws.sent).toHaveLength(1);

        // An echo must be delivered before closing: a leaked heartbeat tick
        // would otherwise take its dead-socket branch (which never sends)
        // instead of exposing itself through this assertion.
        ws.onmessage?.({data: JSON.stringify({namespace: 'echo', payload: {action: 'echo'}})} as MessageEvent);
        ws.close();

        jest.advanceTimersByTime(60 * 1000);
        expect(ws.sent).toHaveLength(1);
        expect(jest.getTimerCount()).toBe(0);
    });

    it('stops the heartbeat when the socket errors without a close', () => {
        const {ws} = openSocket();

        jest.advanceTimersByTime(12 * 1000);
        ws.onerror?.(new Event('error'));

        expect(jest.getTimerCount()).toBe(0);
    });

    it('keeps the connection alive while echo replies arrive', () => {
        const {ws} = openSocket();
        const closeSpy = jest.spyOn(ws, 'close');

        for (let i = 0; i < 10; i++) {
            jest.advanceTimersByTime(12 * 1000);
            ws.onmessage?.({data: JSON.stringify({namespace: 'echo', payload: {action: 'echo'}})} as MessageEvent);
        }

        expect(closeSpy).not.toHaveBeenCalled();
        expect(sentFrames(ws)).toHaveLength(10);
    });

    it('force-closes with code 4999 when no echo arrives within the timeout', () => {
        const {s, ws} = openSocket();
        const onClose = jest.fn();
        s.on('close', onClose);
        const closeSpy = jest.spyOn(ws, 'close');

        // t=12s: first ping goes out unanswered. t=24s: next tick sees the ping
        // is older than the 10s timeout and kills the socket.
        jest.advanceTimersByTime(24 * 1000);

        expect(closeSpy).toHaveBeenCalledWith(4999, 'signaling heartbeat timeout');
        expect(onClose).toHaveBeenCalled();

        // The dead socket must not keep being pinged, re-closed, or hold a timer.
        jest.advanceTimersByTime(60 * 1000);
        expect(closeSpy).toHaveBeenCalledTimes(1);
        expect(jest.getTimerCount()).toBe(0);
    });
});
