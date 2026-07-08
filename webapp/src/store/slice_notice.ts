const ACTION_TYPES = {
    SET: 'opentalk/notice/set',
    CLEARED: 'opentalk/notice/cleared',
} as const;

export type NoticeKind = 'error' | 'info';

export interface NoticeState {
    message: string | null;
    kind: NoticeKind;

    // Bumped on every set so a banner's auto-hide timer restarts for a fresh notice.
    seq: number;
}

const initial: NoticeState = {message: null, kind: 'error', seq: 0};

export function noticeSet(payload: {message: string; kind?: NoticeKind}) {
    return {type: ACTION_TYPES.SET, payload};
}
export function noticeCleared() {
    return {type: ACTION_TYPES.CLEARED};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAction = {type: string; payload?: any};

export function noticeReducer(state: NoticeState = initial, action: AnyAction): NoticeState {
    switch (action.type) {
    case ACTION_TYPES.SET:
        return {message: action.payload.message, kind: action.payload.kind ?? 'error', seq: state.seq + 1};
    case ACTION_TYPES.CLEARED:
        return {...state, message: null};
    default:
        return state;
    }
}
