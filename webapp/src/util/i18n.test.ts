import {renderHook} from '@testing-library/react';
import React from 'react';
import {Provider} from 'react-redux';
import {createStore} from 'redux';

import {setModuleLocale, t, useT} from './i18n';

// Helper to build a minimal Redux store with a given locale for the current user.
function makeStoreWithLocale(locale: string | undefined) {
    const profiles: Record<string, {locale?: string}> = {};
    if (locale !== undefined) {
        profiles['u1'] = {locale};
    } else {
        profiles['u1'] = {};
    }
    return createStore(() => ({
        entities: {
            users: {
                currentUserId: 'u1',
                profiles,
            },
        },
    }));
}

function wrapper(store: ReturnType<typeof makeStoreWithLocale>) {
    // eslint-disable-next-line react/display-name
    return ({children}: {children: React.ReactNode}) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        React.createElement(Provider, {store} as any, children);
}

describe('isGermanLocale / useT', () => {
    it('returns German for locale "de"', () => {
        const store = makeStoreWithLocale('de');
        const {result} = renderHook(() => useT(), {wrapper: wrapper(store)});
        expect(result.current({de: 'Hallo', en: 'Hello'})).toBe('Hallo');
    });

    it('returns German for locale "de-DE"', () => {
        const store = makeStoreWithLocale('de-DE');
        const {result} = renderHook(() => useT(), {wrapper: wrapper(store)});
        expect(result.current({de: 'Beitreten', en: 'Join'})).toBe('Beitreten');
    });

    it('returns German for locale "de_CH" (underscore variant)', () => {
        const store = makeStoreWithLocale('de_CH');
        const {result} = renderHook(() => useT(), {wrapper: wrapper(store)});
        expect(result.current({de: 'Anruf', en: 'Call'})).toBe('Anruf');
    });

    it('returns English for locale "en"', () => {
        const store = makeStoreWithLocale('en');
        const {result} = renderHook(() => useT(), {wrapper: wrapper(store)});
        expect(result.current({de: 'Hallo', en: 'Hello'})).toBe('Hello');
    });

    it('returns English for locale "fr"', () => {
        const store = makeStoreWithLocale('fr');
        const {result} = renderHook(() => useT(), {wrapper: wrapper(store)});
        expect(result.current({de: 'Beitreten', en: 'Join'})).toBe('Join');
    });

    it('returns English when locale is undefined', () => {
        const store = makeStoreWithLocale(undefined);
        const {result} = renderHook(() => useT(), {wrapper: wrapper(store)});
        expect(result.current({de: 'Verlassen', en: 'Leave'})).toBe('Leave');
    });
});

describe('setModuleLocale + t()', () => {
    afterEach(() => {
        // Reset to default English after each test.
        setModuleLocale(undefined);
    });

    it('t() returns English by default', () => {
        setModuleLocale(undefined);
        expect(t({de: 'Hallo', en: 'Hello'})).toBe('Hello');
    });

    it('setModuleLocale("de") makes t() return German', () => {
        setModuleLocale('de');
        expect(t({de: 'Beitreten', en: 'Join'})).toBe('Beitreten');
    });

    it('setModuleLocale("de-DE") makes t() return German', () => {
        setModuleLocale('de-DE');
        expect(t({de: 'Anruf', en: 'Call'})).toBe('Anruf');
    });

    it('setModuleLocale("en") makes t() return English', () => {
        setModuleLocale('en');
        expect(t({de: 'Verlassen', en: 'Leave'})).toBe('Leave');
    });

    it('setModuleLocale(undefined) falls back to English', () => {
        setModuleLocale('de');
        setModuleLocale(undefined);
        expect(t({de: 'Hallo', en: 'Hello'})).toBe('Hello');
    });
});
