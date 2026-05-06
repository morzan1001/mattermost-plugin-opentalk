import {
    incomingCallsReducer,
    incomingCallReceived,
    incomingCallDismissed,
    incomingCallCleared,
    incomingCallsReset,
} from './slice_incoming_calls';
import type {IncomingCall} from './slice_incoming_calls';

const call1: IncomingCall = {
    channelID: 'chan1',
    roomID: 'room1',
    hostUserID: 'user1',
    hostName: 'Alice',
    receivedAt: 1000,
};

const call2: IncomingCall = {
    channelID: 'chan2',
    roomID: 'room2',
    hostUserID: 'user2',
    hostName: 'Bob',
    receivedAt: 2000,
};

describe('incomingCallsReducer', () => {
    it('starts with empty state', () => {
        expect(incomingCallsReducer(undefined, {type: '@@INIT'})).toEqual({
            byChannelID: {},
        });
    });

    it('received — adds a call to byChannelID', () => {
        const state = incomingCallsReducer(undefined, incomingCallReceived(call1));
        expect(state.byChannelID[call1.channelID]).toMatchObject({
            channelID: call1.channelID,
            roomID: call1.roomID,
            hostUserID: call1.hostUserID,
            hostName: call1.hostName,
            receivedAt: call1.receivedAt,
            dismissed: false,
        });
    });

    it('received — replaces existing entry for the same channel (and resets dismissed)', () => {
        let state = incomingCallsReducer(undefined, incomingCallReceived(call1));
        state = incomingCallsReducer(state, incomingCallDismissed({channelID: call1.channelID}));
        expect(state.byChannelID[call1.channelID].dismissed).toBe(true);

        const updatedCall: IncomingCall = {
            ...call1,
            hostName: 'Alice Updated',
            receivedAt: 9999,
        };
        state = incomingCallsReducer(state, incomingCallReceived(updatedCall));
        expect(state.byChannelID[call1.channelID].hostName).toBe('Alice Updated');
        expect(state.byChannelID[call1.channelID].receivedAt).toBe(9999);
        expect(state.byChannelID[call1.channelID].dismissed).toBe(false);
    });

    it('dismissed — flips the dismissed flag to true', () => {
        let state = incomingCallsReducer(undefined, incomingCallReceived(call1));
        state = incomingCallsReducer(state, incomingCallDismissed({channelID: call1.channelID}));
        expect(state.byChannelID[call1.channelID].dismissed).toBe(true);
    });

    it('dismissed — no-op when channel is absent', () => {
        const before = incomingCallsReducer(undefined, {type: '@@INIT'});
        const after = incomingCallsReducer(before, incomingCallDismissed({channelID: 'nonexistent'}));
        expect(after).toEqual(before);
    });

    it('cleared — removes the entry entirely', () => {
        let state = incomingCallsReducer(undefined, incomingCallReceived(call1));
        state = incomingCallsReducer(state, incomingCallCleared({channelID: call1.channelID}));
        expect(state.byChannelID[call1.channelID]).toBeUndefined();
    });

    it('cleared — no-op when channel is absent', () => {
        const before = incomingCallsReducer(undefined, {type: '@@INIT'});
        const after = incomingCallsReducer(before, incomingCallCleared({channelID: 'nonexistent'}));
        expect(after).toEqual(before);
    });

    it('reset — empties the map', () => {
        let state = incomingCallsReducer(undefined, incomingCallReceived(call1));
        state = incomingCallsReducer(state, incomingCallReceived(call2));
        expect(Object.keys(state.byChannelID)).toHaveLength(2);

        state = incomingCallsReducer(state, incomingCallsReset());
        expect(state).toEqual({byChannelID: {}});
    });
});
