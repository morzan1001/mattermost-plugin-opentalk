const ACTION_TYPES = {
    STARTED: 'opentalk/active_meetings/started',
    ENDED: 'opentalk/active_meetings/ended',
    DISMISSED: 'opentalk/active_meetings/dismissed',
    RESET: 'opentalk/active_meetings/reset',
} as const;

export interface ActiveMeeting {
    channelID: string;
    roomID: string;
    hostUserID: string;
    hostName: string;
    postID?: string;
    receivedAt: number;
    dismissed?: boolean;
}

export interface ActiveMeetingsState {
    byChannelID: Record<string, ActiveMeeting>;
}

const initial: ActiveMeetingsState = {byChannelID: {}};

export function activeMeetingStarted(am: ActiveMeeting) {
    return {type: ACTION_TYPES.STARTED, payload: {am}};
}
export function activeMeetingEnded(payload: {channelID: string}) {
    return {type: ACTION_TYPES.ENDED, payload};
}
export function activeMeetingDismissed(payload: {channelID: string}) {
    return {type: ACTION_TYPES.DISMISSED, payload};
}
export function activeMeetingsReset() {
    return {type: ACTION_TYPES.RESET};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAction = {type: string; payload?: any};

export function activeMeetingsReducer(state: ActiveMeetingsState = initial, action: AnyAction): ActiveMeetingsState {
    switch (action.type) {
    case ACTION_TYPES.STARTED: {
        const {am} = action.payload as {am: ActiveMeeting};
        return {
            ...state,
            byChannelID: {
                ...state.byChannelID,
                [am.channelID]: {...am, dismissed: false},
            },
        };
    }
    case ACTION_TYPES.ENDED: {
        const {channelID} = action.payload as {channelID: string};
        if (!state.byChannelID[channelID]) {
            return state;
        }
        const byChannelID = {...state.byChannelID};
        delete byChannelID[channelID];
        return {...state, byChannelID};
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
    case ACTION_TYPES.RESET:
        return initial;
    default:
        return state;
    }
}
