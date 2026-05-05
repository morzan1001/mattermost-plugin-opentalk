import Plugin from './plugin';

describe('Plugin', () => {
    it('initialize is callable without throwing', async () => {
        const plugin = new Plugin();
        const fakeRegistry = {} as any;
        const fakeStore = {dispatch: jest.fn(), getState: jest.fn(), subscribe: jest.fn()} as any;
        await expect(plugin.initialize(fakeRegistry, fakeStore)).resolves.toBeUndefined();
    });

    it('uninitialize is callable without throwing', () => {
        const plugin = new Plugin();
        expect(() => plugin.uninitialize()).not.toThrow();
    });
});
