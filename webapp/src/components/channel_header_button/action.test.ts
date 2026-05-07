import {startMeetingAction} from './action';

const mockFetch = jest.fn();
const mockAlert = jest.fn();

beforeEach(() => {
    (global as any).fetch = mockFetch;
    (global as any).alert = mockAlert;
    mockFetch.mockReset();
    mockAlert.mockReset();

    const store: Record<string, any> = {};
    (global as any).localStorage = {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => {
            store[k] = v;
        },
    };
    (global as any).crypto = {
        getRandomValues: (arr: Uint8Array) => {
            for (let i = 0; i < arr.length; i++) {
                arr[i] = i;
            }
            return arr;
        },
    };
});

function makeStore(connected: boolean) {
    return {
        getState: () => ({
            'plugins-com.github.morzan1001.mattermost-plugin-opentalk': {oauth: {connected}},
        }),
        dispatch: jest.fn(),
        subscribe: jest.fn(),
    } as any;
}

describe('startMeetingAction', () => {
    it('alerts when not connected and skips fetch', async () => {
        const action = startMeetingAction(makeStore(false));
        await action({id: 'ch-1'});
        expect(mockAlert).toHaveBeenCalled();
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

    it('alerts on fetch error', async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            status: 500,
            text: async () => 'boom',
        });
        const action = startMeetingAction(makeStore(true));
        await action({id: 'ch-1'});
        expect(mockAlert).toHaveBeenCalled();
        expect(mockAlert.mock.calls[0][0]).toContain('500');
    });
});
