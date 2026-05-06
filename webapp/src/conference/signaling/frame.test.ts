import {buildFrame, isFrame, type SignalingFrame} from './frame';

describe('SignalingFrame helpers', () => {
    it('buildFrame produces {namespace, payload: {action, ...}}', () => {
        const f = buildFrame('core', 'join', {displayName: 'alice'});
        expect(f).toEqual({namespace: 'core', payload: {action: 'join', displayName: 'alice'}});
    });

    it('buildFrame works with empty payload', () => {
        const f = buildFrame('core', 'leave', {});
        expect(f).toEqual({namespace: 'core', payload: {action: 'leave'}});
    });

    it('isFrame discriminates valid frames', () => {
        expect(isFrame({namespace: 'core', payload: {action: 'join'}})).toBe(true);
    });

    it('isFrame rejects malformed inputs', () => {
        expect(isFrame(null)).toBe(false);
        expect(isFrame({})).toBe(false);
        expect(isFrame({namespace: 'core'})).toBe(false);
        expect(isFrame({namespace: 'core', payload: {}})).toBe(false);
        expect(isFrame({namespace: 'core', payload: {action: 123}})).toBe(false);
    });

    it('SignalingFrame<TAction, TPayload> typechecks (compile-time only)', () => {
        // This test exists mainly to prevent regressions in the generic types.
        const f: SignalingFrame<'join', {displayName: string}> = buildFrame('core', 'join', {displayName: 'a'});
        expect(f.payload.action).toBe('join');
    });
});
