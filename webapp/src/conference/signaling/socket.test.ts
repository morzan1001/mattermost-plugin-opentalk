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
