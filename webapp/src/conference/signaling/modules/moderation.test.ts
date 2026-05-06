import {buildFrame} from '../frame';
import {ModerationNamespace, type ModerationOutgoing, type ModerationIncoming} from './moderation';

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
});
