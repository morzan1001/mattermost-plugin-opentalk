import type * as StatusModule from './status';

const STATUS_URL = '/api/v4/users/me/status/custom';

async function flushPromises(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('OpenTalk custom status', () => {
    const mockFetch = jest.fn();
    let status: typeof StatusModule;

    function mockCurrentStatus(customStatus?: {emoji: string; text: string}) {
        mockFetch.mockImplementation((url: string) => {
            if (url === '/api/v4/users/me') {
                const props = customStatus ? {customStatus: JSON.stringify(customStatus)} : {};
                return Promise.resolve({ok: true, json: async () => ({props})});
            }
            return Promise.resolve({ok: true});
        });
    }

    function statusWrites() {
        return mockFetch.mock.calls.filter(([url]: [string]) => url === STATUS_URL);
    }

    beforeEach(() => {
        global.fetch = mockFetch;
        mockFetch.mockReset();
        window.localStorage.clear();
        jest.isolateModules(() => {
            status = jest.requireActual('./status');
        });
    });

    it('leaves the status alone when it was never set', () => {
        mockCurrentStatus();

        status.clearOpenTalkStatus();

        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('deletes the meeting status when the user had none before', async () => {
        mockCurrentStatus();
        status.setOpenTalkStatus();
        await flushPromises();
        mockFetch.mockClear();

        status.clearOpenTalkStatus();

        expect(statusWrites()).toEqual([[STATUS_URL, expect.objectContaining({method: 'DELETE'})]]);
    });

    it('sends the MMCSRF cookie as X-CSRF-Token on its writes', async () => {
        document.cookie = 'MMCSRF=csrf-token';
        try {
            mockCurrentStatus();
            status.setOpenTalkStatus();
            await flushPromises();
            status.clearOpenTalkStatus();

            const methods = statusWrites().map(([, init]) => [init.method, init.headers['X-CSRF-Token']]);
            expect(methods).toEqual([['PUT', 'csrf-token'], ['DELETE', 'csrf-token']]);
        } finally {
            document.cookie = 'MMCSRF=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        }
    });

    it('restores the prior status once and does not delete it on a repeated clear', async () => {
        const vacation = {emoji: 'palm_tree', text: 'Vacation'};
        mockCurrentStatus(vacation);
        status.setOpenTalkStatus();
        await flushPromises();
        mockFetch.mockClear();

        status.clearOpenTalkStatus();
        status.clearOpenTalkStatus();

        expect(statusWrites()).toHaveLength(1);
        const [, init] = statusWrites()[0];
        expect(init.method).toBe('PUT');
        expect(JSON.parse(init.body)).toEqual(vacation);
    });
});
