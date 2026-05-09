import {
    sessionReducer,
    connectStarted,
    connected,
    participantsChanged,
    disconnected,
    connectError,
    setMicEnabled,
    setCamEnabled,
    setScreenShareEnabled,
    setLivekitConnected,
    setExpanded,
    setMinimized,
    setRaiseHandsEnabled,
} from './slice_session';

describe('sessionReducer', () => {
    it('starts idle', () => {
        expect(sessionReducer(undefined, {type: '@@INIT'})).toEqual({
            status: 'idle',
            participantCount: 0,
            micEnabled: false,
            isHost: false,
            camEnabled: false,
            screenShareEnabled: false,
            livekitConnected: false,
            expanded: false,
            minimized: false,
            joinedAt: undefined,
            localParticipantId: undefined,
            raiseHandsEnabled: false,
        });
    });

    it('reflects connectStarted', () => {
        const next = sessionReducer(undefined, connectStarted({channelID: 'ch', roomID: 'r'}));
        expect(next).toEqual({
            status: 'connecting',
            channelID: 'ch',
            roomID: 'r',
            participantCount: 0,
            micEnabled: false,
            isHost: false,
            camEnabled: false,
            screenShareEnabled: false,
            livekitConnected: false,
            expanded: false,
            minimized: false,
            joinedAt: undefined,
            localParticipantId: undefined,
            raiseHandsEnabled: false,
        });
    });

    it('reflects connected and clears error', () => {
        const before = Date.now();
        const next = sessionReducer(
            {
                status: 'connecting',
                channelID: 'c',
                roomID: 'r',
                participantCount: 0,
                error: 'old',
                micEnabled: false,
                isHost: false,
                camEnabled: false,
                screenShareEnabled: false,
                livekitConnected: false,
                expanded: false,
                minimized: false,
                raiseHandsEnabled: true,
            },
            connected({participantCount: 3}),
        );
        const after = Date.now();
        expect(next.status).toBe('connected');
        expect(next.participantCount).toBe(3);
        expect(next.error).toBeUndefined();
        expect(next.joinedAt).toBeGreaterThanOrEqual(before);
        expect(next.joinedAt).toBeLessThanOrEqual(after);
    });

    it('reflects participantsChanged', () => {
        const next = sessionReducer(
            {
                status: 'connected',
                channelID: 'c',
                roomID: 'r',
                participantCount: 3,
                micEnabled: false,
                isHost: false,
                camEnabled: false,
                screenShareEnabled: false,
                livekitConnected: false,
                expanded: false,
                minimized: false,
                raiseHandsEnabled: true,
            },
            participantsChanged({participantCount: 4}),
        );
        expect(next.participantCount).toBe(4);
    });

    it('reflects disconnected', () => {
        const next = sessionReducer(
            {
                status: 'connected',
                channelID: 'c',
                roomID: 'r',
                participantCount: 3,
                micEnabled: true,
                isHost: false,
                camEnabled: true,
                screenShareEnabled: true,
                livekitConnected: true,
                expanded: true,
                minimized: true,
                joinedAt: 12345,
                raiseHandsEnabled: true,
            },
            disconnected(),
        );
        expect(next).toEqual({
            status: 'idle',
            participantCount: 0,
            micEnabled: false,
            isHost: false,
            camEnabled: false,
            screenShareEnabled: false,
            livekitConnected: false,
            expanded: false,
            minimized: false,
            joinedAt: undefined,
            localParticipantId: undefined,
            raiseHandsEnabled: false,
        });
    });

    it('reflects connectError back to idle with error', () => {
        const next = sessionReducer(
            {
                status: 'connecting',
                channelID: 'c',
                roomID: 'r',
                participantCount: 0,
                micEnabled: false,
                isHost: false,
                camEnabled: false,
                screenShareEnabled: false,
                livekitConnected: false,
                expanded: true,
                minimized: false,
                joinedAt: 99999,
                raiseHandsEnabled: true,
            },
            connectError({error: 'boom'}),
        );
        expect(next.status).toBe('idle');
        expect(next.error).toBe('boom');
        expect(next.expanded).toBe(false);
        expect(next.minimized).toBe(false);
        expect(next.joinedAt).toBeUndefined();
    });

    it('toggles micEnabled', () => {
        let s = sessionReducer(undefined, setMicEnabled(true));
        expect(s.micEnabled).toBe(true);
        s = sessionReducer(s, setMicEnabled(false));
        expect(s.micEnabled).toBe(false);
    });

    it('toggles camEnabled', () => {
        let s = sessionReducer(undefined, setCamEnabled(true));
        expect(s.camEnabled).toBe(true);
        s = sessionReducer(s, setCamEnabled(false));
        expect(s.camEnabled).toBe(false);
    });

    it('reflects setScreenShareEnabled', () => {
        let s = sessionReducer(undefined, setScreenShareEnabled(true));
        expect(s.screenShareEnabled).toBe(true);
        s = sessionReducer(s, setScreenShareEnabled(false));
        expect(s.screenShareEnabled).toBe(false);
    });

    it('toggles livekitConnected', () => {
        let s = sessionReducer(undefined, setLivekitConnected(true));
        expect(s.livekitConnected).toBe(true);
        s = sessionReducer(s, setLivekitConnected(false));
        expect(s.livekitConnected).toBe(false);
    });

    it('setExpanded sets expanded field', () => {
        let s = sessionReducer(undefined, setExpanded(true));
        expect(s.expanded).toBe(true);
        s = sessionReducer(s, setExpanded(false));
        expect(s.expanded).toBe(false);
    });

    it('setMinimized sets minimized field', () => {
        let s = sessionReducer(undefined, setMinimized(true));
        expect(s.minimized).toBe(true);
        s = sessionReducer(s, setMinimized(false));
        expect(s.minimized).toBe(false);
    });

    it('setRaiseHandsEnabled toggles raiseHandsEnabled', () => {
        let s = sessionReducer(undefined, setRaiseHandsEnabled(false));
        expect(s.raiseHandsEnabled).toBe(false);
        s = sessionReducer(s, setRaiseHandsEnabled(true));
        expect(s.raiseHandsEnabled).toBe(true);
    });
});
