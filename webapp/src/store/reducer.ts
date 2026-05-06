import {combineReducers} from 'redux';

import {oauthReducer} from './slice_oauth';
import {sessionReducer} from './slice_session';
import {tracksReducer} from './slice_tracks';

export default combineReducers({
    oauth: oauthReducer,
    session: sessionReducer,
    tracks: tracksReducer,
});
