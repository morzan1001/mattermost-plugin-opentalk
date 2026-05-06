import {combineReducers} from 'redux';

import {incomingCallsReducer} from './slice_incoming_calls';
import {oauthReducer} from './slice_oauth';
import {participantsReducer} from './slice_participants';
import {sessionReducer} from './slice_session';
import {tracksReducer} from './slice_tracks';

export default combineReducers({
    incomingCalls: incomingCallsReducer,
    oauth: oauthReducer,
    participants: participantsReducer,
    session: sessionReducer,
    tracks: tracksReducer,
});
