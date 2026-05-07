// Reset module state between tests by re-importing the module fresh each time.
// We use jest.isolateModules to avoid cross-test contamination of the singleton.

import type {DesktopSource} from './desktop_capturer';

const makeSources = (): DesktopSource[] => [
    {id: 'screen:0:0', name: 'Screen 1', thumbnailURL: ''},
    {id: 'window:42:0', name: 'Terminal', thumbnailURL: ''},
];

describe('screen_picker', () => {
    it('pickScreenSource resolves with the chosen id when resolveScreenPicker is called', async () => {
        const {pickScreenSource, resolveScreenPicker} = await import('./screen_picker');
        const sources = makeSources();
        const promise = pickScreenSource(sources);
        resolveScreenPicker('screen:0:0');
        const result = await promise;
        expect(result).toBe('screen:0:0');
    });

    it('pickScreenSource resolves with null when the user cancels (id=null)', async () => {
        jest.resetModules();
        const {pickScreenSource, resolveScreenPicker} = await import('./screen_picker');
        const promise = pickScreenSource(makeSources());
        resolveScreenPicker(null);
        const result = await promise;
        expect(result).toBeNull();
    });

    it('opening a second picker cancels the first one (resolves null) and resolves the second', async () => {
        jest.resetModules();
        const {pickScreenSource, resolveScreenPicker} = await import('./screen_picker');
        const first = pickScreenSource(makeSources());
        const second = pickScreenSource(makeSources());

        // The first promise should have been cancelled already.
        const firstResult = await first;
        expect(firstResult).toBeNull();

        // Resolve the second picker explicitly.
        resolveScreenPicker('window:42:0');
        const secondResult = await second;
        expect(secondResult).toBe('window:42:0');
    });
});
