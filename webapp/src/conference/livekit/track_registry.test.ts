import * as registry from './track_registry';

describe('track_registry', () => {
    beforeEach(() => registry.clear());

    it('register + get round-trip', () => {
        const fake = {sid: 't1'} as never;
        registry.register('t1', fake);
        expect(registry.get('t1')).toBe(fake);
    });
    it('unregister removes the entry', () => {
        registry.register('t1', {} as never);
        registry.unregister('t1');
        expect(registry.get('t1')).toBeUndefined();
    });
    it('clear empties the registry', () => {
        registry.register('t1', {} as never);
        registry.register('t2', {} as never);
        registry.clear();
        expect(registry.get('t1')).toBeUndefined();
        expect(registry.get('t2')).toBeUndefined();
    });
});
