import {LivekitNamespace, type LiveKitOutgoing, type LiveKitIncoming} from './livekit';

import {buildFrame} from '../frame';

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
});
