const ACTION_TYPES = {
    RECEIVED: 'opentalk/incoming_calls/received',
    DISMISSED: 'opentalk/incoming_calls/dismissed',
    CLEARED: 'opentalk/incoming_calls/cleared',
    RESET: 'opentalk/incoming_calls/reset',
} as const;

export interface IncomingCall {
    channelID: string;
    roomID: string;
    hostUserID: string;
    hostName: string;
    receivedAt: number;
    dismissed?: boolean;
}

export interface IncomingCallsState {
    byChannelID: Record<string, IncomingCall>;
}

const initial: IncomingCallsState = {byChannelID: {}};

export function incomingCallReceived(call: IncomingCall) {
    return {type: ACTION_TYPES.RECEIVED, payload: {call}};
}
export function incomingCallDismissed(payload: {channelID: string}) {
    return {type: ACTION_TYPES.DISMISSED, payload};
}
export function incomingCallCleared(payload: {channelID: string}) {
    return {type: ACTION_TYPES.CLEARED, payload};
}
export function incomingCallsReset() {
    return {type: ACTION_TYPES.RESET};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAction = {type: string; payload?: any};

export function incomingCallsReducer(state: IncomingCallsState = initial, action: AnyAction): IncomingCallsState {
    switch (action.type) {
    case ACTION_TYPES.RECEIVED: {
        const {call} = action.payload as {call: IncomingCall};
        return {
            ...state,
            byChannelID: {
                ...state.byChannelID,
                [call.channelID]: {...call, dismissed: false},
            },
        };
    }
    case ACTION_TYPES.DISMISSED: {
        const {channelID} = action.payload as {channelID: string};
        const existing = state.byChannelID[channelID];
        if (!existing) {
            return state;
        }
        return {
            ...state,
            byChannelID: {
                ...state.byChannelID,
                [channelID]: {...existing, dismissed: true},
            },
        };
    }
    case ACTION_TYPES.CLEARED: {
        const {channelID} = action.payload as {channelID: string};
        if (!state.byChannelID[channelID]) {
            return state;
        }
        const byChannelID = {...state.byChannelID};
        delete byChannelID[channelID];
        return {...state, byChannelID};
    }
    case ACTION_TYPES.RESET:
        return initial;
    default:
        return state;
    }
}
