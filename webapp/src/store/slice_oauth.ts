const SET_CONNECTED = 'opentalk/oauth/set_connected';

export interface OAuthState {
    connected: boolean;
    email?: string;
}

const initialState: OAuthState = {connected: false};

export interface SetConnectedAction {
    type: typeof SET_CONNECTED;
    connected: boolean;
    email?: string;
}

export function setConnected(connected: boolean, email?: string): SetConnectedAction {
    return {type: SET_CONNECTED, connected, email};
}

export function oauthReducer(state: OAuthState = initialState, action: SetConnectedAction | {type: string}): OAuthState {
    switch (action.type) {
    case SET_CONNECTED:
        return {
            connected: (action as SetConnectedAction).connected,
            email: (action as SetConnectedAction).email,
        };
    default:
        return state;
    }
}
