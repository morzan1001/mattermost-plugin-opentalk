import {joinMeeting} from './rest';

describe('joinMeeting', () => {
    const mockFetch = jest.fn();
    beforeEach(() => {
        (global as any).fetch = mockFetch;
        mockFetch.mockReset();
    });

    it('POSTs with anti-CSRF header and channel + device_secret', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ticket: 't', resumption: 'r', roomserver_url: 'wss://x'}),
        });
        const out = await joinMeeting('room-1', 'ch-1', 'dev-secret');
        expect(out.ticket).toBe('t');
        expect(out.resumption).toBe('r');
        expect(out.roomserver_url).toBe('wss://x');
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const [url, init] = mockFetch.mock.calls[0];
        expect(url).toContain('/plugins/com.github.morzan1001.mattermost-plugin-opentalk/api/v1/meetings/room-1/join');
        expect(init.method).toBe('POST');
        expect(init.headers['X-Requested-With']).toBe('XMLHttpRequest');
        expect(init.headers['Content-Type']).toBe('application/json');
        expect(JSON.parse(init.body)).toEqual({channel_id: 'ch-1', device_secret: 'dev-secret'});
    });

    it('passes optional resumption when provided', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ticket: 't', resumption: 'r-new', roomserver_url: 'wss://x'}),
        });
        await joinMeeting('room-1', 'ch-1', 'dev', 'res-old');
        const [, init] = mockFetch.mock.calls[0];
        expect(JSON.parse(init.body)).toEqual({
            channel_id: 'ch-1',
            device_secret: 'dev',
            resumption: 'res-old',
        });
    });

    it('encodes the room_id path segment', async () => {
        mockFetch.mockResolvedValue({ok: true, json: async () => ({ticket: '', resumption: '', roomserver_url: ''})});
        await joinMeeting('room/with#special chars', 'ch-1', 'dev');
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/api/v1/meetings/room%2Fwith%23special%20chars/join');
    });

    it('throws on non-ok response with status + body in message', async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            status: 502,
            text: async () => 'bad gateway',
        });
        await expect(joinMeeting('room-1', 'ch-1', 'dev')).rejects.toThrow(/502.*bad gateway/);
    });

    it('throws on 404 (no active meeting)', async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            status: 404,
            text: async () => 'no active meeting in this channel',
        });
        await expect(joinMeeting('room-1', 'ch-1', 'dev')).rejects.toThrow(/404/);
    });
});
