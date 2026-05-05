import {oauthReducer, setConnected} from './slice_oauth';

describe('oauthReducer', () => {
    it('starts disconnected', () => {
        expect(oauthReducer(undefined, {type: '@@INIT'} as any)).toEqual({connected: false});
    });

    it('reflects setConnected(true, email)', () => {
        const next = oauthReducer(undefined, setConnected(true, 'alice@example.com'));
        expect(next).toEqual({connected: true, email: 'alice@example.com'});
    });

    it('reflects setConnected(false)', () => {
        const next = oauthReducer({connected: true, email: 'a'}, setConnected(false));
        expect(next).toEqual({connected: false, email: undefined});
    });
});
