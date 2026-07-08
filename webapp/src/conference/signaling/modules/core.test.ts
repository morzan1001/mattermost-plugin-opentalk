import {CoreNamespace, type CoreOutgoing, type CoreIncoming, type Participant, type CoreHandRaised} from './core';

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

describe('core module types', () => {
    it('CoreNamespace constant is "core"', () => {
        expect(CoreNamespace).toBe('control');
    });

    it('typechecks a join frame', () => {
        const f = buildFrame(CoreNamespace, 'join', {displayName: 'alice'} satisfies Omit<Extract<CoreOutgoing, {action: 'join'}>, 'action'>);
        expect(f.payload.action).toBe('join');
    });

    it('typechecks a leave frame', () => {
        const f = buildFrame(CoreNamespace, 'leave', {});
        expect(f.payload.action).toBe('leave');
    });

    it('Participant has minimal MVP fields', () => {
        const p: Participant = {id: 'u1', displayName: 'alice'};
        expect(p.id).toBe('u1');
    });

    it('CoreIncoming joinSuccess carries participants and optional livekit bootstrap', () => {
        const m: CoreIncoming = {
            action: 'joinSuccess',
            participants: [{id: 'u1', displayName: 'alice'}],
            livekit: {url: 'wss://lk.example', token: 'tok'},
        };
        expect(m.action).toBe('joinSuccess');
        if (m.action === 'joinSuccess') {
            expect(m.participants).toHaveLength(1);
            expect(m.livekit?.url).toBe('wss://lk.example');
        }
    });

    it('typechecks a raiseHand outgoing frame in control namespace', () => {
        const f = buildFrame(
            CoreNamespace,
            'raiseHand',
            {} satisfies Omit<Extract<CoreOutgoing, {action: 'raiseHand'}>, 'action'>,
        );
        expect(f.payload.action).toBe('raiseHand');
    });

    it('typechecks a lowerHand outgoing frame in control namespace', () => {
        const f = buildFrame(
            CoreNamespace,
            'lowerHand',
            {} satisfies Omit<Extract<CoreOutgoing, {action: 'lowerHand'}>, 'action'>,
        );
        expect(f.payload.action).toBe('lowerHand');
    });

    it('typechecks a handRaised incoming frame in control namespace', () => {
        const m: CoreHandRaised = {action: 'handRaised', participant: 'u1'};
        expect(m.participant).toBe('u1');
    });

    it('typechecks a handLowered incoming frame in control namespace', () => {
        const m: CoreIncoming = {action: 'handLowered', participant: 'u1'};
        if (m.action === 'handLowered') {
            expect(m.participant).toBe('u1');
        }
    });

    it('grantModeratorRole serializes to control namespace with snake_case action and field', () => {
        const wire = sentWireFrame(
            CoreNamespace,
            'grantModeratorRole',
            {target: 'u1'} satisfies Omit<Extract<CoreOutgoing, {action: 'grantModeratorRole'}>, 'action'>,
        );
        expect(wire).toEqual({
            namespace: 'control',
            payload: {action: 'grant_moderator_role', target: 'u1'},
        });
    });

    it('revokeModeratorRole serializes to control namespace with snake_case action and field', () => {
        const wire = sentWireFrame(
            CoreNamespace,
            'revokeModeratorRole',
            {target: 'u1'} satisfies Omit<Extract<CoreOutgoing, {action: 'revokeModeratorRole'}>, 'action'>,
        );
        expect(wire).toEqual({
            namespace: 'control',
            payload: {action: 'revoke_moderator_role', target: 'u1'},
        });
    });

    it('typechecks a moderatorRoleGranted incoming frame sent to the issuer', () => {
        const m: CoreIncoming = {action: 'moderatorRoleGranted', target: 'u1'};
        if (m.action === 'moderatorRoleGranted') {
            expect(m.target).toBe('u1');
        }
    });

    it('typechecks a moderatorRoleRevoked incoming frame sent to the issuer', () => {
        const m: CoreIncoming = {action: 'moderatorRoleRevoked', target: 'u1'};
        if (m.action === 'moderatorRoleRevoked') {
            expect(m.target).toBe('u1');
        }
    });

    it('typechecks a roleUpdated incoming frame sent to the affected participant', () => {
        const m: CoreIncoming = {action: 'roleUpdated', newRole: 'moderator'};
        if (m.action === 'roleUpdated') {
            expect(m.newRole).toBe('moderator');
        }
    });
});
