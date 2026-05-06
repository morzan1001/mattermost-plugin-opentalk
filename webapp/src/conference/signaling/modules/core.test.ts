import {buildFrame} from '../frame';
import {CoreNamespace, type CoreOutgoing, type CoreIncoming, type Participant} from './core';

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
});
