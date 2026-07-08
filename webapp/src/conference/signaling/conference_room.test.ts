import {ConferenceRoom, type AuthProvider} from './conference_room';

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

beforeEach(() => {
    FakeWebSocket.instances = [];
    (global as any).WebSocket = FakeWebSocket;
});

function makeFakeAuth(overrides: Partial<{ticket: string; resumption: string; roomserverURL: string}> = {}): AuthProvider {
    return {
        getTicket: jest.fn().mockResolvedValue({
            ticket: 'ticket-abc',
            resumption: 'resumption-1',
            roomserverURL: 'wss://rs.example',
            ...overrides,
        }),
    };
}

function getWS(): FakeWebSocket {
    expect(FakeWebSocket.instances.length).toBeGreaterThan(0);
    return FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
}

function emit(ws: FakeWebSocket, raw: object) {
    ws.onmessage?.({data: JSON.stringify(raw)} as MessageEvent);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function makeConnectedRoom(participants: any[] = []): Promise<{room: ConferenceRoom; ws: FakeWebSocket}> {
    const room = new ConferenceRoom(makeFakeAuth(), 'wss://rs.example');
    const connectPromise = room.connect('room-1', 'ch-1', 'alice', 'dev-1');
    await Promise.resolve();
    await Promise.resolve();
    const ws = getWS();
    ws.onopen?.({} as Event);
    emit(ws, {namespace: 'control', payload: {message: 'join_success', id: 'self-id', display_name: 'self-name', participants}});
    await connectPromise;
    return {room, ws};
}

function lastSent(ws: FakeWebSocket): object {
    return JSON.parse(ws.sent[ws.sent.length - 1]);
}

describe('ConferenceRoom', () => {
    it('connect() asks the AuthProvider for a ticket and opens the WS', async () => {
        const auth = makeFakeAuth();
        const room = new ConferenceRoom(auth, 'wss://default-rs.example');
        const connectPromise = room.connect('room-1', 'ch-1', 'alice', 'dev-1');

        // Allow microtasks to flush so the AuthProvider promise resolves.
        await Promise.resolve();
        await Promise.resolve();

        expect(auth.getTicket).toHaveBeenCalledWith('room-1', 'ch-1', 'dev-1');
        const ws = getWS();
        expect(ws.url).toBe('wss://rs.example/signaling');

        // Now fire ws open + joinSuccess so connect() resolves.
        ws.onopen?.({} as Event);
        emit(ws, {namespace: 'control', payload: {message: 'join_success', id: 'self-id', display_name: 'self-name', participants: []}});
        await connectPromise;
        expect(room.getState()).toBe('connected');
    });

    it('sends core.join frame after socket opens', async () => {
        const room = new ConferenceRoom(makeFakeAuth(), 'wss://default-rs.example');
        room.connect('room-1', 'ch-1', 'alice', 'dev-1');
        await Promise.resolve();
        await Promise.resolve();

        const ws = getWS();
        ws.onopen?.({} as Event);

        // Sent payload should be snake_cased {namespace: 'control', payload: {action: 'join', display_name: 'alice'}}.
        // The resumption token is persisted after getTicket resolves and is included in the join frame.
        expect(ws.sent.length).toBe(1);
        const sent = JSON.parse(ws.sent[0]);
        expect(sent).toEqual({namespace: 'control', payload: {action: 'join', display_name: 'alice', resumption: 'resumption-1'}});
    });

    it('emits "connected" with participants on joinSuccess', async () => {
        const room = new ConferenceRoom(makeFakeAuth(), 'wss://rs.example');
        const onConnected = jest.fn();
        room.on('connected', onConnected);
        room.connect('room-1', 'ch-1', 'alice', 'dev-1');
        await Promise.resolve();
        await Promise.resolve();

        const ws = getWS();
        ws.onopen?.({} as Event);
        emit(ws, {
            namespace: 'control',
            payload: {
                message: 'join_success',
                id: 'self-id',
                display_name: 'self-name',
                participants: [{id: 'u1', display_name: 'bob'}],
                livekit: {url: 'wss://livekit.example', token: 'lk-tok'},
            },
        });

        expect(onConnected).toHaveBeenCalledTimes(1);
        const data = onConnected.mock.calls[0][0];
        expect(data.participants).toEqual([
            {id: 'self-id', displayName: 'self-name'},
            {id: 'u1', displayName: 'bob'},
        ]);
        expect(data.livekit).toEqual({url: 'wss://livekit.example', token: 'lk-tok'});
        expect(room.getParticipants()).toEqual([
            {id: 'self-id', displayName: 'self-name'},
            {id: 'u1', displayName: 'bob'},
        ]);
    });

    it('updates participants list on joined and emits event', async () => {
        const room = new ConferenceRoom(makeFakeAuth(), 'wss://rs.example');
        const onJoined = jest.fn();
        room.on('participant_joined', onJoined);
        room.connect('room-1', 'ch-1', 'alice', 'dev-1');
        await Promise.resolve();
        await Promise.resolve();

        const ws = getWS();
        ws.onopen?.({} as Event);
        emit(ws, {namespace: 'control', payload: {message: 'join_success', id: 'self-id', display_name: 'self-name', participants: []}});

        emit(ws, {
            namespace: 'control',
            payload: {
                message: 'joined',
                id: 'u2',
                control: {display_name: 'carol'},
            },
        });

        expect(onJoined).toHaveBeenCalledWith({id: 'u2', displayName: 'carol'});
        expect(room.getParticipants()).toEqual([
            {id: 'self-id', displayName: 'self-name'},
            {id: 'u2', displayName: 'carol'},
        ]);
    });

    it('removes participants on left and emits event', async () => {
        const room = new ConferenceRoom(makeFakeAuth(), 'wss://rs.example');
        const onLeft = jest.fn();
        room.on('participant_left', onLeft);
        room.connect('room-1', 'ch-1', 'alice', 'dev-1');
        await Promise.resolve();
        await Promise.resolve();

        const ws = getWS();
        ws.onopen?.({} as Event);
        emit(ws, {
            namespace: 'control',
            payload: {
                message: 'join_success',
                id: 'self-id',
                display_name: 'self-name',
                participants: [{id: 'u2', control: {display_name: 'carol'}}, {id: 'u3', control: {display_name: 'dave'}}],
            },
        });

        emit(ws, {namespace: 'control', payload: {message: 'left', id: 'u2'}});

        expect(onLeft).toHaveBeenCalledWith({id: 'u2'});
        expect(room.getParticipants()).toEqual([
            {id: 'self-id', displayName: 'self-name'},
            {id: 'u3', displayName: 'dave'},
        ]);
    });

    it('leave() sends core.leave and disconnects the socket', async () => {
        const room = new ConferenceRoom(makeFakeAuth(), 'wss://rs.example');
        room.connect('room-1', 'ch-1', 'alice', 'dev-1');
        await Promise.resolve();
        await Promise.resolve();
        const ws = getWS();
        ws.onopen?.({} as Event);
        emit(ws, {namespace: 'control', payload: {message: 'join_success', id: 'self-id', display_name: 'self-name', participants: []}});

        await room.leave();

        // Last sent message should be the leave frame.
        const lastSent = JSON.parse(ws.sent[ws.sent.length - 1]);
        expect(lastSent).toEqual({namespace: 'control', payload: {action: 'leave'}});
        expect(ws.readyState).toBe(3);
        expect(room.getState()).toBe('closed');
    });

    it('emits "closed" when WebSocket closes', async () => {
        const room = new ConferenceRoom(makeFakeAuth(), 'wss://rs.example');
        const onClosed = jest.fn();
        room.on('closed', onClosed);
        room.connect('room-1', 'ch-1', 'alice', 'dev-1');
        await Promise.resolve();
        await Promise.resolve();

        const ws = getWS();
        ws.onopen?.({} as Event);
        emit(ws, {namespace: 'control', payload: {message: 'join_success', id: 'self-id', display_name: 'self-name', participants: []}});

        ws.close();
        expect(onClosed).toHaveBeenCalledWith(expect.objectContaining({code: 1000}));
        expect(room.getState()).toBe('closed');
    });

    it('rejects connect() if AuthProvider throws', async () => {
        const auth: AuthProvider = {
            getTicket: jest.fn().mockRejectedValue(new Error('unauthorized')),
        };
        const room = new ConferenceRoom(auth, 'wss://rs.example');
        await expect(room.connect('room-1', 'ch-1', 'alice', 'dev-1')).rejects.toThrow(/unauthorized/);
        expect(room.getState()).toBe('idle');
    });

    it('initial state is idle and getParticipants() returns empty array', () => {
        const room = new ConferenceRoom(makeFakeAuth(), 'wss://rs.example');
        expect(room.getState()).toBe('idle');
        expect(room.getParticipants()).toEqual([]);
    });
});

describe('ConferenceRoom host moderation senders', () => {
    it('forceMute() sends a livekit force_mute frame', async () => {
        const {room, ws} = await makeConnectedRoom();
        room.forceMute(['u1', 'u2']);
        expect(lastSent(ws)).toEqual({namespace: 'livekit', payload: {action: 'force_mute', participants: ['u1', 'u2']}});
    });

    it('kick() sends a moderation kick frame', async () => {
        const {room, ws} = await makeConnectedRoom();
        room.kick('u1');
        expect(lastSent(ws)).toEqual({namespace: 'moderation', payload: {action: 'kick', target: 'u1'}});
    });

    it('ban() sends a moderation ban frame', async () => {
        const {room, ws} = await makeConnectedRoom();
        room.ban('u1');
        expect(lastSent(ws)).toEqual({namespace: 'moderation', payload: {action: 'ban', target: 'u1'}});
    });

    it('grantModerator() sends a control grant_moderator_role frame', async () => {
        const {room, ws} = await makeConnectedRoom();
        room.grantModerator('u1');
        expect(lastSent(ws)).toEqual({namespace: 'control', payload: {action: 'grant_moderator_role', target: 'u1'}});
    });

    it('revokeModerator() sends a control revoke_moderator_role frame', async () => {
        const {room, ws} = await makeConnectedRoom();
        room.revokeModerator('u1');
        expect(lastSent(ws)).toEqual({namespace: 'control', payload: {action: 'revoke_moderator_role', target: 'u1'}});
    });

    it('resetRaisedHands(target) sends a moderation reset_raised_hands frame with target', async () => {
        const {room, ws} = await makeConnectedRoom();
        room.resetRaisedHands('u1');
        expect(lastSent(ws)).toEqual({namespace: 'moderation', payload: {action: 'reset_raised_hands', target: 'u1'}});
    });

    it('resetRaisedHands() with no arg omits the target key', async () => {
        const {room, ws} = await makeConnectedRoom();
        room.resetRaisedHands();
        expect(lastSent(ws)).toEqual({namespace: 'moderation', payload: {action: 'reset_raised_hands'}});
    });

    it('grantScreenShare() sends a livekit grant_screen_share_permission frame', async () => {
        const {room, ws} = await makeConnectedRoom();
        room.grantScreenShare(['u1']);
        expect(lastSent(ws)).toEqual({namespace: 'livekit', payload: {action: 'grant_screen_share_permission', participants: ['u1']}});
    });

    it('revokeScreenShare() sends a livekit revoke_screen_share_permission frame', async () => {
        const {room, ws} = await makeConnectedRoom();
        room.revokeScreenShare(['u1']);
        expect(lastSent(ws)).toEqual({namespace: 'livekit', payload: {action: 'revoke_screen_share_permission', participants: ['u1']}});
    });

    it('senders are no-ops before the room is connected', () => {
        const room = new ConferenceRoom(makeFakeAuth(), 'wss://rs.example');
        expect(() => room.kick('u1')).not.toThrow();
    });
});

describe('ConferenceRoom host moderation inbound', () => {
    it('emits force_muted on a livekit forceMuted frame', async () => {
        const {room, ws} = await makeConnectedRoom();
        const onForceMuted = jest.fn();
        room.on('force_muted', onForceMuted);
        emit(ws, {namespace: 'livekit', payload: {message: 'force_muted', moderator: 'mod-1'}});
        expect(onForceMuted).toHaveBeenCalledWith({moderator: 'mod-1'});
    });

    it('emits role_updated with the local id and mutates the self entry on control roleUpdated', async () => {
        const {room, ws} = await makeConnectedRoom();
        const onRole = jest.fn();
        room.on('role_updated', onRole);
        emit(ws, {namespace: 'control', payload: {message: 'role_updated', new_role: 'moderator'}});
        expect(onRole).toHaveBeenCalledWith({participantId: 'self-id', newRole: 'moderator'});
        expect(room.getParticipants().find((p) => p.id === 'self-id')?.role).toBe('moderator');
    });

    it('emits role_updated moderator for the target on control moderatorRoleGranted', async () => {
        const {room, ws} = await makeConnectedRoom([{id: 'u1', control: {display_name: 'bob'}}]);
        const onRole = jest.fn();
        room.on('role_updated', onRole);
        emit(ws, {namespace: 'control', payload: {message: 'moderator_role_granted', target: 'u1'}});
        expect(onRole).toHaveBeenCalledWith({participantId: 'u1', newRole: 'moderator'});
        expect(room.getParticipants().find((p) => p.id === 'u1')?.role).toBe('moderator');
    });

    it('emits role_updated user for the target on control moderatorRoleRevoked', async () => {
        const {room, ws} = await makeConnectedRoom([{id: 'u1', control: {display_name: 'bob', role: 'moderator'}}]);
        const onRole = jest.fn();
        room.on('role_updated', onRole);
        emit(ws, {namespace: 'control', payload: {message: 'moderator_role_revoked', target: 'u1'}});
        expect(onRole).toHaveBeenCalledWith({participantId: 'u1', newRole: 'user'});
        expect(room.getParticipants().find((p) => p.id === 'u1')?.role).toBe('user');
    });

    it('emits role_updated when a control update carries a role', async () => {
        const {room, ws} = await makeConnectedRoom([{id: 'u1', control: {display_name: 'bob'}}]);
        const onRole = jest.fn();
        room.on('role_updated', onRole);
        emit(ws, {namespace: 'control', payload: {message: 'update', id: 'u1', control: {role: 'moderator'}}});
        expect(onRole).toHaveBeenCalledWith({participantId: 'u1', newRole: 'moderator'});
    });

    it('emits hand_lowered with the local id on moderation raisedHandResetByModerator', async () => {
        const {room, ws} = await makeConnectedRoom();
        const onHandLowered = jest.fn();
        room.on('hand_lowered', onHandLowered);
        emit(ws, {namespace: 'moderation', payload: {message: 'raised_hand_reset_by_moderator', issued_by: 'mod-1'}});
        expect(onHandLowered).toHaveBeenCalledWith({participantId: 'self-id'});
    });
});
