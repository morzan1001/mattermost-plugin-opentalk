import {buildFrame, type SignalingFrame} from './frame';

describe('SignalingFrame helpers', () => {
    it('buildFrame produces {namespace, payload: {action, ...}}', () => {
        const f = buildFrame('core', 'join', {displayName: 'alice'});
        expect(f).toEqual({namespace: 'core', payload: {action: 'join', displayName: 'alice'}});
    });

    it('buildFrame works with empty payload', () => {
        const f = buildFrame('core', 'leave', {});
        expect(f).toEqual({namespace: 'core', payload: {action: 'leave'}});
    });

    it('SignalingFrame<TAction, TPayload> typechecks (compile-time only)', () => {
        // This test exists mainly to prevent regressions in the generic types.
        const f: SignalingFrame<'join', {displayName: string}> = buildFrame('core', 'join', {displayName: 'a'});
        expect(f.payload.action).toBe('join');
    });
});
