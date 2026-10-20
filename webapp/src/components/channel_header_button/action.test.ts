import type {Action, Store} from 'redux';

import type {GlobalState} from '@mattermost/types/store';

import {startMeetingAction} from './action';

const mockFetch = jest.fn();
const mockOpen = jest.fn();

beforeEach(() => {
    global.fetch = mockFetch;
    global.open = mockOpen;
    mockFetch.mockReset();
    mockOpen.mockReset();
    window.localStorage.clear();
});

function makeStore(connected: boolean) {
    const store = {
        getState: () => ({
            'plugins-com.github.morzan1001.mattermost-plugin-opentalk': {oauth: {connected}},
        }),
        dispatch: jest.fn(),
        subscribe: jest.fn(),
    };
    return store as typeof store & Store<GlobalState, Action>;
}

describe('startMeetingAction', () => {
    it('asks for a channel and skips fetch when the App Bar calls it without one', async () => {
        const store = makeStore(true);
        const action = startMeetingAction(store);
        await action(undefined);
        expect(mockFetch).not.toHaveBeenCalled();
        expect(mockOpen).not.toHaveBeenCalled();
        expect(store.dispatch).toHaveBeenCalledTimes(1);
        expect(store.dispatch.mock.calls[0][0]).toEqual({
            type: 'opentalk/notice/set',
            payload: {kind: 'info', message: 'Open a channel first to start an OpenTalk meeting.'},
        });
    });

    it('opens the connect flow when not connected and skips fetch', async () => {
        const store = makeStore(false);
        const action = startMeetingAction(store);
        await action({id: 'ch-1'});
        expect(mockOpen).toHaveBeenCalled();
        expect(mockOpen.mock.calls[0][0]).toContain('/oauth/start');
        expect(store.dispatch).toHaveBeenCalled();
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('POSTs to /api/v1/meetings when connected', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({room_id: 'r', invite_code: 'i', ticket: 't', resumption: 're', roomserver_url: 'wss://x', post_id: 'p'}),
        });
        const action = startMeetingAction(makeStore(true));
        await action({id: 'ch-1'});
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const [url, init] = mockFetch.mock.calls[0];
        expect(url).toContain('/plugins/com.github.morzan1001.mattermost-plugin-opentalk/api/v1/meetings');
        expect(init.method).toBe('POST');
        const body = JSON.parse(init.body);
        expect(body.channel_id).toBe('ch-1');
        expect(typeof body.device_secret).toBe('string');
        expect(body.device_secret.length).toBe(64); // 32 bytes hex
    });

    it('dispatches an error notice on fetch error', async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            status: 500,
            text: async () => 'boom',
        });
        const store = makeStore(true);
        const action = startMeetingAction(store);
        await action({id: 'ch-1'});
        const noticeCall = store.dispatch.mock.calls.find(
            (c) => c[0]?.type === 'opentalk/notice/set',
        );
        expect(noticeCall).toBeDefined();
        expect(noticeCall[0].payload.message).toContain('500');
    });
});
