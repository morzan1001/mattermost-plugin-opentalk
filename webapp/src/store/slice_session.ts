const ACTION_TYPES = {
    CONNECT_STARTED: 'opentalk/session/connect_started',
    CONNECTED: 'opentalk/session/connected',
    PARTICIPANTS_CHANGED: 'opentalk/session/participants_changed',
    DISCONNECTED: 'opentalk/session/disconnected',
    CONNECT_ERROR: 'opentalk/session/connect_error',
    SET_MIC_ENABLED: 'opentalk/session/set_mic_enabled',
    SET_CAM_ENABLED: 'opentalk/session/set_cam_enabled',
    SET_SCREEN_SHARE_ENABLED: 'opentalk/session/set_screen_share_enabled',
    SET_LIVEKIT_CONNECTED: 'opentalk/session/set_livekit_connected',
} as const;

export type SessionStatus = 'idle' | 'connecting' | 'connected' | 'leaving';

export interface SessionState {
    status: SessionStatus;
    channelID?: string;
    roomID?: string;
    participantCount: number;
    error?: string;
    micEnabled: boolean;
    camEnabled: boolean;
    screenShareEnabled: boolean;
    livekitConnected: boolean;
}

const initial: SessionState = {
    status: 'idle',
    participantCount: 0,
    micEnabled: false,
    camEnabled: false,
    screenShareEnabled: false,
    livekitConnected: false,
};

export function connectStarted(payload: {channelID: string; roomID: string}) {
    return {type: ACTION_TYPES.CONNECT_STARTED, payload};
}
export function connected(payload: {participantCount: number}) {
    return {type: ACTION_TYPES.CONNECTED, payload};
}
export function participantsChanged(payload: {participantCount: number}) {
    return {type: ACTION_TYPES.PARTICIPANTS_CHANGED, payload};
}
export function disconnected() {
    return {type: ACTION_TYPES.DISCONNECTED};
}
export function connectError(payload: {error: string}) {
    return {type: ACTION_TYPES.CONNECT_ERROR, payload};
}
export function setMicEnabled(value: boolean) {
    return {type: ACTION_TYPES.SET_MIC_ENABLED, payload: {value}};
}
export function setCamEnabled(value: boolean) {
    return {type: ACTION_TYPES.SET_CAM_ENABLED, payload: {value}};
}
export function setScreenShareEnabled(value: boolean) {
    return {type: ACTION_TYPES.SET_SCREEN_SHARE_ENABLED, payload: {value}};
}
export function setLivekitConnected(value: boolean) {
    return {type: ACTION_TYPES.SET_LIVEKIT_CONNECTED, payload: {value}};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAction = {type: string; payload?: any};

export function sessionReducer(state: SessionState = initial, action: AnyAction): SessionState {
    switch (action.type) {
    case ACTION_TYPES.CONNECT_STARTED:
        return {
            ...initial,
            status: 'connecting',
            channelID: action.payload.channelID,
            roomID: action.payload.roomID,
        };
    case ACTION_TYPES.CONNECTED:
        return {
            ...state,
            status: 'connected',
            participantCount: action.payload.participantCount,
            error: undefined,
        };
    case ACTION_TYPES.PARTICIPANTS_CHANGED:
        return {...state, participantCount: action.payload.participantCount};
    case ACTION_TYPES.DISCONNECTED:
        return initial;
    case ACTION_TYPES.CONNECT_ERROR:
        return {...initial, error: action.payload.error};
    case ACTION_TYPES.SET_MIC_ENABLED:
        return {...state, micEnabled: action.payload.value};
    case ACTION_TYPES.SET_CAM_ENABLED:
        return {...state, camEnabled: action.payload.value};
    case ACTION_TYPES.SET_SCREEN_SHARE_ENABLED:
        return {...state, screenShareEnabled: action.payload.value};
    case ACTION_TYPES.SET_LIVEKIT_CONNECTED:
        return {...state, livekitConnected: action.payload.value};
    default:
        return state;
    }
}
