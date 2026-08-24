import {participantRemoved} from './slice_participants';
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
    setIsHost,
    setPinnedParticipant,
    setReconnectAttempt,
} from './slice_session';

describe('sessionReducer', () => {
    it('starts idle', () => {
        expect(sessionReducer(undefined, {type: '@@INIT'})).toEqual({
            status: 'idle',
            participantCount: 0,
            micEnabled: false,
            isHost: false,
            isRoomOwner: false,
            camEnabled: false,
            screenShareEnabled: false,
            livekitConnected: false,
            expanded: false,
            minimized: false,
            joinedAt: undefined,
            localParticipantId: undefined,
            raiseHandsEnabled: false,
            reconnectAttempt: 0,
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
            isRoomOwner: false,
            camEnabled: false,
            screenShareEnabled: false,
            livekitConnected: false,
            expanded: false,
            minimized: false,
            joinedAt: undefined,
            localParticipantId: undefined,
            raiseHandsEnabled: false,
            reconnectAttempt: 0,
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
                isRoomOwner: false,
                camEnabled: false,
                screenShareEnabled: false,
                livekitConnected: false,
                expanded: false,
                minimized: false,
                raiseHandsEnabled: true,
                reconnectAttempt: 2,
            },
            connected({participantCount: 3}),
        );
        const after = Date.now();
        expect(next.status).toBe('connected');
        expect(next.participantCount).toBe(3);
        expect(next.reconnectAttempt).toBe(0);
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
                isRoomOwner: false,
                camEnabled: false,
                screenShareEnabled: false,
                livekitConnected: false,
                expanded: false,
                minimized: false,
                raiseHandsEnabled: true,
                reconnectAttempt: 0,
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
                isRoomOwner: true,
                camEnabled: true,
                screenShareEnabled: true,
                livekitConnected: true,
                expanded: true,
                minimized: true,
                joinedAt: 12345,
                raiseHandsEnabled: true,
                reconnectAttempt: 3,
            },
            disconnected(),
        );
        expect(next).toEqual({
            status: 'idle',
            participantCount: 0,
            micEnabled: false,
            isHost: false,
            isRoomOwner: false,
            camEnabled: false,
            screenShareEnabled: false,
            livekitConnected: false,
            expanded: false,
            minimized: false,
            joinedAt: undefined,
            localParticipantId: undefined,
            raiseHandsEnabled: false,

            // The banner must survive per-attempt teardowns mid-rejoin.
            reconnectAttempt: 3,
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
                isRoomOwner: false,
                camEnabled: false,
                screenShareEnabled: false,
                livekitConnected: false,
                expanded: true,
                minimized: false,
                joinedAt: 99999,
                raiseHandsEnabled: true,
                reconnectAttempt: 1,
            },
            connectError({error: 'boom'}),
        );
        expect(next.status).toBe('idle');
        expect(next.error).toBe('boom');
        expect(next.expanded).toBe(false);
        expect(next.minimized).toBe(false);
        expect(next.joinedAt).toBeUndefined();
        expect(next.reconnectAttempt).toBe(1);
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

    it('setIsHost toggles isHost', () => {
        let s = sessionReducer(undefined, setIsHost(true));
        expect(s.isHost).toBe(true);
        s = sessionReducer(s, setIsHost(false));
        expect(s.isHost).toBe(false);
    });

    it('connected sets isRoomOwner from the payload', () => {
        expect(sessionReducer(undefined, connected({participantCount: 1, isRoomOwner: true})).isRoomOwner).toBe(true);
        expect(sessionReducer(undefined, connected({participantCount: 1, isRoomOwner: false})).isRoomOwner).toBe(false);
        expect(sessionReducer(undefined, connected({participantCount: 1})).isRoomOwner).toBe(false);
    });

    it('setIsHost does not touch isRoomOwner (mid-call moderator promotion)', () => {
        const owned = sessionReducer(undefined, connected({participantCount: 1, isHost: true, isRoomOwner: true}));
        expect(sessionReducer(owned, setIsHost(false)).isRoomOwner).toBe(true);

        const guest = sessionReducer(undefined, connected({participantCount: 1, isHost: false, isRoomOwner: false}));
        expect(sessionReducer(guest, setIsHost(true)).isRoomOwner).toBe(false);
    });

    it('setPinnedParticipant stores and clears the pinned id', () => {
        const pinned = sessionReducer(undefined, setPinnedParticipant('p1'));
        expect(pinned.pinnedParticipantId).toBe('p1');
        expect(sessionReducer(pinned, setPinnedParticipant(null)).pinnedParticipantId).toBeUndefined();
    });

    it('clears the pin when the pinned participant is removed', () => {
        const pinned = sessionReducer(undefined, setPinnedParticipant('p1'));
        const after = sessionReducer(pinned, participantRemoved({id: 'p1'}));
        expect(after.pinnedParticipantId).toBeUndefined();
    });

    it('keeps the pin when a different participant is removed', () => {
        const pinned = sessionReducer(undefined, setPinnedParticipant('p1'));
        expect(sessionReducer(pinned, participantRemoved({id: 'p2'})).pinnedParticipantId).toBe('p1');
    });

    it('clears the pin on disconnect', () => {
        const pinned = sessionReducer(undefined, setPinnedParticipant('p1'));
        expect(sessionReducer(pinned, disconnected()).pinnedParticipantId).toBeUndefined();
    });

    it('setReconnectAttempt stores and resets the attempt number', () => {
        const s = sessionReducer(undefined, setReconnectAttempt(2));
        expect(s.reconnectAttempt).toBe(2);
        expect(sessionReducer(s, setReconnectAttempt(0)).reconnectAttempt).toBe(0);
    });

    it('connectStarted preserves a running rejoin attempt', () => {
        const retrying = sessionReducer(undefined, setReconnectAttempt(3));
        const next = sessionReducer(retrying, connectStarted({channelID: 'ch', roomID: 'r'}));
        expect(next.status).toBe('connecting');
        expect(next.reconnectAttempt).toBe(3);
    });
});
