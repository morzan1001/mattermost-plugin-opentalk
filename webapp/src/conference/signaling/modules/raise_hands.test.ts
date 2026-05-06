import {buildFrame} from '../frame';
import {RaiseHandsNamespace, type RaiseHandsOutgoing, type RaiseHandsIncoming} from './raise_hands';

describe('raise_hands module types', () => {
    it('RaiseHandsNamespace constant is "raise_hands"', () => {
        expect(RaiseHandsNamespace).toBe('raise_hands');
    });

    it('typechecks a raiseHand outgoing frame', () => {
        const f = buildFrame(
            RaiseHandsNamespace,
            'raiseHand',
            {} satisfies Omit<Extract<RaiseHandsOutgoing, {action: 'raiseHand'}>, 'action'>,
        );
        expect(f.payload.action).toBe('raiseHand');
    });

    it('typechecks a resetRaisedHands outgoing frame with optional target', () => {
        const f = buildFrame(
            RaiseHandsNamespace,
            'resetRaisedHands',
            {target: ['u1', 'u2']} satisfies Omit<Extract<RaiseHandsOutgoing, {action: 'resetRaisedHands'}>, 'action'>,
        );
        expect(f.payload.action).toBe('resetRaisedHands');
    });

    it('typechecks a handRaised incoming frame', () => {
        const m: RaiseHandsIncoming = {action: 'handRaised', participant: 'u1'};
        if (m.action === 'handRaised') {
            expect(m.participant).toBe('u1');
        }
    });

    it('typechecks an error incoming frame with RaiseHandsError', () => {
        const m: RaiseHandsIncoming = {action: 'error', error: 'raiseHandsDisabled'};
        expect(m.action).toBe('error');
    });
});
