import {buildFrame} from '../frame';
import {ModerationNamespace, type ModerationOutgoing, type ModerationIncoming, type ModerationRaiseHandsEnabled} from './moderation';

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

    it('typechecks a roleUpdated incoming frame', () => {
        const m: ModerationIncoming = {
            action: 'roleUpdated',
            participantId: 'u1',
            newRole: 'moderator',
        };
        if (m.action === 'roleUpdated') {
            expect(m.newRole).toBe('moderator');
        }
    });

    it('typechecks an error incoming frame with ModerationError enum value', () => {
        const m: ModerationIncoming = {action: 'error', error: 'insufficientPermissions'};
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

    it('typechecks a resetRaisedHands outgoing frame with optional target in moderation namespace', () => {
        const f = buildFrame(
            ModerationNamespace,
            'resetRaisedHands',
            {target: ['u1', 'u2']} satisfies Omit<Extract<ModerationOutgoing, {action: 'resetRaisedHands'}>, 'action'>,
        );
        expect(f.payload.action).toBe('resetRaisedHands');
    });

    it('typechecks a raiseHandsEnabled incoming frame in moderation namespace', () => {
        const m: ModerationRaiseHandsEnabled = {action: 'raiseHandsEnabled', issuedBy: 'host1'};
        expect(m.issuedBy).toBe('host1');
    });

    it('typechecks a raisedHandResetByModerator incoming frame in moderation namespace', () => {
        const m: ModerationIncoming = {action: 'raisedHandResetByModerator', issuedBy: 'mod1', participants: ['u1', 'u2']};
        if (m.action === 'raisedHandResetByModerator') {
            expect(m.participants).toHaveLength(2);
        }
    });
});
