import {ModerationNamespace, type ModerationOutgoing, type ModerationIncoming, type ModerationRaiseHandsEnabled} from './moderation';

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

describe('moderation module types', () => {
    it('ModerationNamespace constant is "moderation"', () => {
        expect(ModerationNamespace).toBe('moderation');
    });

    it('typechecks a kick outgoing frame', () => {
        const f = buildFrame(
            ModerationNamespace,
            'kick',
            {target: 'u1'} satisfies Omit<Extract<ModerationOutgoing, {action: 'kick'}>, 'action'>,
        );
        expect(f.payload.action).toBe('kick');
    });

    it('typechecks a debrief outgoing frame', () => {
        const f = buildFrame(
            ModerationNamespace,
            'debrief',
            {kickScope: 'all'} satisfies Omit<Extract<ModerationOutgoing, {action: 'debrief'}>, 'action'>,
        );
        expect(f.payload.action).toBe('debrief');
    });

    it('debrief serializes the kick_scope value verbatim (only keys are snake-cased)', () => {
        const wire = sentWireFrame(
            ModerationNamespace,
            'debrief',
            {kickScope: 'users_and_guests'} satisfies Omit<Extract<ModerationOutgoing, {action: 'debrief'}>, 'action'>,
        );
        expect(wire).toEqual({
            namespace: 'moderation',
            payload: {action: 'debrief', kick_scope: 'users_and_guests'},
        });
    });

    it('typechecks an error incoming frame with ModerationError enum value', () => {
        const m: ModerationIncoming = {action: 'error', error: 'insufficient_permissions'};
        expect(m.action).toBe('error');
    });

    it('typechecks an enableRaiseHands outgoing frame in moderation namespace', () => {
        const f = buildFrame(
            ModerationNamespace,
            'enableRaiseHands',
            {} satisfies Omit<Extract<ModerationOutgoing, {action: 'enableRaiseHands'}>, 'action'>,
        );
        expect(f.payload.action).toBe('enableRaiseHands');
    });

    it('resetRaisedHands serializes with a single target string', () => {
        const wire = sentWireFrame(
            ModerationNamespace,
            'resetRaisedHands',
            {target: 'u1'} satisfies Omit<Extract<ModerationOutgoing, {action: 'resetRaisedHands'}>, 'action'>,
        );
        expect(wire).toEqual({
            namespace: 'moderation',
            payload: {action: 'reset_raised_hands', target: 'u1'},
        });
    });

    it('resetRaisedHands serializes with a target array', () => {
        const wire = sentWireFrame(
            ModerationNamespace,
            'resetRaisedHands',
            {target: ['u1', 'u2']} satisfies Omit<Extract<ModerationOutgoing, {action: 'resetRaisedHands'}>, 'action'>,
        );
        expect(wire).toEqual({
            namespace: 'moderation',
            payload: {action: 'reset_raised_hands', target: ['u1', 'u2']},
        });
    });

    it('typechecks a raiseHandsEnabled incoming frame in moderation namespace', () => {
        const m: ModerationRaiseHandsEnabled = {action: 'raiseHandsEnabled', issuedBy: 'host1'};
        expect(m.issuedBy).toBe('host1');
    });

    it('typechecks a raisedHandResetByModerator incoming frame carrying only issuedBy', () => {
        const m: ModerationIncoming = {action: 'raisedHandResetByModerator', issuedBy: 'mod1'};
        if (m.action === 'raisedHandResetByModerator') {
            expect(m.issuedBy).toBe('mod1');
        }
    });

    it('typechecks a waitingRoomDisabled incoming frame with no fields', () => {
        const m: ModerationIncoming = {action: 'waitingRoomDisabled'};
        expect(m.action).toBe('waitingRoomDisabled');
    });

    it('typechecks an inWaitingRoom incoming frame with no fields', () => {
        const m: ModerationIncoming = {action: 'inWaitingRoom'};
        expect(m.action).toBe('inWaitingRoom');
    });

    it('typechecks a joinedWaitingRoom incoming frame sent to moderators', () => {
        const m: ModerationIncoming = {action: 'joinedWaitingRoom', id: 'u1', control: {displayName: 'alice'}};
        if (m.action === 'joinedWaitingRoom') {
            expect(m.id).toBe('u1');
            expect(m.control?.displayName).toBe('alice');
        }
    });

    it('typechecks a leftWaitingRoom incoming frame sent to moderators', () => {
        const m: ModerationIncoming = {action: 'leftWaitingRoom', id: 'u1'};
        if (m.action === 'leftWaitingRoom') {
            expect(m.id).toBe('u1');
        }
    });

    it('typechecks a sessionEnded incoming frame broadcast before disconnect', () => {
        const m: ModerationIncoming = {action: 'sessionEnded', issuedBy: 'mod1'};
        if (m.action === 'sessionEnded') {
            expect(m.issuedBy).toBe('mod1');
        }
    });
});
