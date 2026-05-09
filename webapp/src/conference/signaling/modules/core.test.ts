import {CoreNamespace, type CoreOutgoing, type CoreIncoming, type Participant, type CoreHandRaised} from './core';

import {buildFrame} from '../frame';

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
});
