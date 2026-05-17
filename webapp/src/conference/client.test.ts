import {OpenTalkConferenceClient} from './client';

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
    send(d: string) {
        this.sent.push(d);
    }
    close() {
        this.readyState = 3;
        this.onclose?.({code: 1000} as CloseEvent);
    }
}

const mockFetch = jest.fn();

beforeEach(() => {
    FakeWebSocket.instances = [];
    (global as any).WebSocket = FakeWebSocket;
    (global as any).fetch = mockFetch;
    mockFetch.mockReset();
});

function emit(ws: FakeWebSocket, raw: object) {
    ws.onmessage?.({data: JSON.stringify(raw)} as MessageEvent);
}

// Flush enough microtasks for the async chain
//   client.connect -> room.connect -> restAuth.getTicket (async)
//     -> await joinMeeting (async, awaits fetch + r.json) -> .then -> new WS
// to settle and the underlying WebSocket to be constructed.
async function flushUntilWS() {
    for (let i = 0; i < 20; i++) {
        if (FakeWebSocket.instances.length > 0) {
            return;
        }
        // eslint-disable-next-line no-await-in-loop
        await Promise.resolve();
    }
}

describe('OpenTalkConferenceClient', () => {
    it('connect() drives joinMeeting REST call + signaling handshake', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ticket: 'tk', resumption: 'rs', roomserver_url: 'wss://rs.example'}),
        });

        const client = new OpenTalkConferenceClient('wss://default-rs.example');
        const onConnected = jest.fn();
        client.on('connected', onConnected);

        const connectPromise = client.connect('room-1', 'ch-1', 'alice', 'dev-1');

        // Wait for AuthProvider promise to resolve and WS to be created.
        // The chain is: client.connect -> room.connect -> restAuth.getTicket
        //   (async) -> await joinMeeting (async, awaits fetch + r.json())
        //   -> .then() -> new WebSocket. Each await adds a microtask hop, so
        // we poll until the WS is actually constructed instead of guessing
        // a fixed flush count.
        await flushUntilWS();

        // REST was called.
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const [url, init] = mockFetch.mock.calls[0];
        expect(url).toContain('/api/v1/meetings/room-1/join');
        expect(init.method).toBe('POST');
        expect(JSON.parse(init.body)).toEqual({channel_id: 'ch-1', device_secret: 'dev-1'});

        // WS opened with the returned ticket.
        const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
        expect(ws.url).toBe('wss://rs.example/signaling');

        // Drive open + joinSuccess.
        ws.onopen?.({} as Event);
        emit(ws, {namespace: 'control', payload: {message: 'join_success', id: 'self-id', display_name: 'self-name', participants: [{id: 'u', display_name: 'alice'}]}});

        await connectPromise;
        expect(onConnected).toHaveBeenCalled();
        expect(client.getState()).toBe('connected');
        expect(client.getParticipants()).toEqual([
            {id: 'self-id', displayName: 'self-name'},
            {id: 'u', displayName: 'alice'},
        ]);
    });

    it('leave() sends core.leave + closes WS', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ticket: 'tk', resumption: 'rs', roomserver_url: 'wss://rs.example'}),
        });
        const client = new OpenTalkConferenceClient('wss://default-rs.example');
        const connect = client.connect('room-1', 'ch-1', 'alice', 'dev-1');
        await flushUntilWS();
        const ws = FakeWebSocket.instances[0];
        ws.onopen?.({} as Event);
        emit(ws, {namespace: 'control', payload: {message: 'join_success', id: 'self-id', display_name: 'self-name', participants: []}});
        await connect;

        await client.leave();
        const lastSent = JSON.parse(ws.sent[ws.sent.length - 1]);
        expect(lastSent).toEqual({namespace: 'control', payload: {action: 'leave'}});
        expect(ws.readyState).toBe(3);
        expect(client.getState()).toBe('closed');
    });

    it('connect() rejects when REST returns a non-ok response', async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            status: 502,
            text: async () => 'bad gateway',
        });
        const client = new OpenTalkConferenceClient('wss://rs.example');
        await expect(client.connect('room-1', 'ch-1', 'alice', 'dev-1')).rejects.toThrow(/502/);
        expect(client.getState()).toBe('idle');
    });

    it('forwards participant_joined / participant_left from underlying ConferenceRoom', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ticket: 'tk', resumption: 'rs', roomserver_url: 'wss://rs.example'}),
        });
        const client = new OpenTalkConferenceClient('wss://rs.example');
        const onJoined = jest.fn();
        const onLeft = jest.fn();
        client.on('participant_joined', onJoined);
        client.on('participant_left', onLeft);

        const connect = client.connect('room-1', 'ch-1', 'alice', 'dev-1');
        await flushUntilWS();
        const ws = FakeWebSocket.instances[0];
        ws.onopen?.({} as Event);
        emit(ws, {namespace: 'control', payload: {message: 'join_success', id: 'self-id', display_name: 'self-name', participants: []}});
        await connect;

        emit(ws, {namespace: 'control', payload: {message: 'joined', id: 'u2', control: {display_name: 'bob'}}});
        emit(ws, {namespace: 'control', payload: {message: 'left', id: 'u2'}});

        expect(onJoined).toHaveBeenCalledWith({id: 'u2', displayName: 'bob'});
        expect(onLeft).toHaveBeenCalledWith({id: 'u2'});
    });
});
