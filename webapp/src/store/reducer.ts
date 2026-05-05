import {combineReducers} from 'redux';
import {oauthReducer} from './slice_oauth';

export default combineReducers({
    oauth: oauthReducer,
});
