import {
    activeMeetingsReducer,
    activeMeetingStarted,
    activeMeetingEnded,
    activeMeetingDismissed,
    activeMeetingsReset,
    type ActiveMeetingsState,
} from './slice_active_meetings';

const initial: ActiveMeetingsState = {byChannelID: {}};

const am1 = {
    channelID: 'ch1',
    roomID: 'room1',
    hostUserID: 'user1',
    hostName: 'Alice',
    postID: 'post1',
    receivedAt: 1000,
};

const am2 = {
    channelID: 'ch2',
    roomID: 'room2',
    hostUserID: 'user2',
    hostName: 'Bob',
    receivedAt: 2000,
};

describe('activeMeetingsReducer', () => {
    it('starts with empty state', () => {
        const state = activeMeetingsReducer(undefined, {type: '@@INIT'});
        expect(state).toEqual({byChannelID: {}});
    });

    it('adds a meeting on STARTED', () => {
        const state = activeMeetingsReducer(initial, activeMeetingStarted(am1));
        const entry = state.byChannelID[am1.channelID];
        expect(entry).toEqual({...am1, dismissed: false});
    });

    it('replaces an existing meeting and clears dismissed on STARTED', () => {
        // First: set up a dismissed entry
        let state = activeMeetingsReducer(initial, activeMeetingStarted(am1));
        state = activeMeetingsReducer(state, activeMeetingDismissed({channelID: am1.channelID}));
        expect(state.byChannelID[am1.channelID].dismissed).toBe(true);

        // Now start a fresh meeting in the same channel
        const fresh = {...am1, roomID: 'room1b', receivedAt: 9999};
        state = activeMeetingsReducer(state, activeMeetingStarted(fresh));
        const entry = state.byChannelID[am1.channelID];
        expect(entry.roomID).toBe('room1b');
        expect(entry.dismissed).toBe(false);
    });

    it('removes a meeting on ENDED', () => {
        let state = activeMeetingsReducer(initial, activeMeetingStarted(am1));
        state = activeMeetingsReducer(state, activeMeetingEnded({channelID: am1.channelID}));
        expect(state.byChannelID[am1.channelID]).toBeUndefined();
    });

    it('sets dismissed flag on DISMISSED without removing', () => {
        let state = activeMeetingsReducer(initial, activeMeetingStarted(am1));
        state = activeMeetingsReducer(state, activeMeetingDismissed({channelID: am1.channelID}));
        const entry = state.byChannelID[am1.channelID];
        expect(entry).toBeDefined();
        expect(entry.dismissed).toBe(true);
    });

    it('is a no-op when DISMISSED on absent channelID', () => {
        const state = activeMeetingsReducer(initial, activeMeetingDismissed({channelID: 'nonexistent'}));
        expect(state).toBe(initial);
    });

    it('empties the map on RESET', () => {
        let state = activeMeetingsReducer(initial, activeMeetingStarted(am1));
        state = activeMeetingsReducer(state, activeMeetingStarted(am2));
        expect(Object.keys(state.byChannelID)).toHaveLength(2);

        state = activeMeetingsReducer(state, activeMeetingsReset());
        expect(state.byChannelID).toEqual({});
    });

    it('handles multiple meetings independently', () => {
        let state = activeMeetingsReducer(initial, activeMeetingStarted(am1));
        state = activeMeetingsReducer(state, activeMeetingStarted(am2));
        state = activeMeetingsReducer(state, activeMeetingEnded({channelID: am1.channelID}));
        expect(state.byChannelID[am1.channelID]).toBeUndefined();
        expect(state.byChannelID[am2.channelID]).toBeDefined();
    });

    it('is a no-op when ENDED on absent channelID', () => {
        const state = activeMeetingsReducer(initial, activeMeetingEnded({channelID: 'nonexistent'}));
        expect(state).toBe(initial);
    });
});
