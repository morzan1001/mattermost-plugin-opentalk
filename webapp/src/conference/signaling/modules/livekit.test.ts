import {
    LivekitNamespace,
    type LiveKitOutgoing,
    type LiveKitIncoming,
} from './livekit';

import {buildFrame} from '../frame';
import {SignalingSocket} from '../socket';

class FakeWebSocket {
    static instances: FakeWebSocket[] = [];
    public sent: string[] = [];
    constructor(public url: string, public protocols?: string | string[]) {
        FakeWebSocket.instances.push(this);
    }
    send(d: string) {
        this.sent.push(d);
    }
    close() {}
}

// Exercises the real send path (buildFrame + SignalingSocket's snake-casing)
// so wire-format regressions show up here instead of only at runtime.
function sentWireFrame(namespace: string, action: string, payload: object): Record<string, unknown> {
    (global as unknown as {WebSocket: typeof FakeWebSocket}).WebSocket = FakeWebSocket;
    const socket = new SignalingSocket('wss://rs.example', 'ticket');
    socket.connect();
    socket.send(buildFrame(namespace, action, payload));
    return JSON.parse(FakeWebSocket.instances[FakeWebSocket.instances.length - 1].sent[0]);
}

describe('livekit module types', () => {
    it('LivekitNamespace constant is "livekit"', () => {
        expect(LivekitNamespace).toBe('livekit');
    });

    it('typechecks a grantScreenSharePermission outgoing frame', () => {
        const f = buildFrame(
            LivekitNamespace,
            'grantScreenSharePermission',
            {participants: ['u1', 'u2']} satisfies Omit<Extract<LiveKitOutgoing, {action: 'grantScreenSharePermission'}>, 'action'>,
        );
        expect(f.payload.action).toBe('grantScreenSharePermission');
    });

    it('typechecks a credentials incoming frame', () => {
        const m: LiveKitIncoming = {
            action: 'credentials',
            room: 'room-1',
            token: 'tok',
            publicUrl: 'wss://lk.example',
        };
        if (m.action === 'credentials') {
            expect(m.token).toBe('tok');
        }
    });

    it('typechecks an error incoming frame', () => {
        const m: LiveKitIncoming = {action: 'error', error: 'livekitUnavailable'};
        expect(m.action).toBe('error');
    });

    it('forceMute serializes to livekit namespace with snake_case action and fields', () => {
        const wire = sentWireFrame(
            LivekitNamespace,
            'forceMute',
            {participants: ['u1', 'u2']} satisfies Omit<Extract<LiveKitOutgoing, {action: 'forceMute'}>, 'action'>,
        );
        expect(wire).toEqual({
            namespace: 'livekit',
            payload: {action: 'force_mute', participants: ['u1', 'u2']},
        });
    });

    it('enableMicrophoneRestrictions serializes with snake_case action and field', () => {
        const wire = sentWireFrame(
            LivekitNamespace,
            'enableMicrophoneRestrictions',
            {unrestrictedParticipants: ['u1']} satisfies Omit<Extract<LiveKitOutgoing, {action: 'enableMicrophoneRestrictions'}>, 'action'>,
        );
        expect(wire).toEqual({
            namespace: 'livekit',
            payload: {action: 'enable_microphone_restrictions', unrestricted_participants: ['u1']},
        });
    });

    it('disableMicrophoneRestrictions serializes with snake_case action and no fields', () => {
        const wire = sentWireFrame(
            LivekitNamespace,
            'disableMicrophoneRestrictions',
            {} satisfies Omit<Extract<LiveKitOutgoing, {action: 'disableMicrophoneRestrictions'}>, 'action'>,
        );
        expect(wire).toEqual({
            namespace: 'livekit',
            payload: {action: 'disable_microphone_restrictions'},
        });
    });

    it('typechecks a forceMuted incoming frame sent to the muted target', () => {
        const m: LiveKitIncoming = {action: 'forceMuted', moderator: 'mod1'};
        if (m.action === 'forceMuted') {
            expect(m.moderator).toBe('mod1');
        }
    });

    it('typechecks a microphoneRestrictionsEnabled incoming frame', () => {
        const m: LiveKitIncoming = {action: 'microphoneRestrictionsEnabled', unrestrictedParticipants: ['u1']};
        if (m.action === 'microphoneRestrictionsEnabled') {
            expect(m.unrestrictedParticipants).toEqual(['u1']);
        }
    });

    it('typechecks a microphoneRestrictionsDisabled incoming frame', () => {
        const m: LiveKitIncoming = {action: 'microphoneRestrictionsDisabled'};
        expect(m.action).toBe('microphoneRestrictionsDisabled');
    });
});
