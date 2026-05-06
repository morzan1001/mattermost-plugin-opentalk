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
        });
    });

    it('reflects connected and clears error', () => {
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
            },
            connected({participantCount: 3}),
        );
        expect(next.status).toBe('connected');
        expect(next.participantCount).toBe(3);
        expect(next.error).toBeUndefined();
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
                camEnabled: true,
                screenShareEnabled: true,
                livekitConnected: true,
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
            },
            connectError({error: 'boom'}),
        );
        expect(next.status).toBe('idle');
        expect(next.error).toBe('boom');
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
});
