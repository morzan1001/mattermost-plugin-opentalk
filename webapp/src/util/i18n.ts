import {useSelector} from 'react-redux';

/**
 * A pair of translations for a single user-facing string.
 * Use as: t({de: '...', en: '...'}) — returns the matching variant
 * for the current MM-user locale (de for de/de-*, en otherwise).
 */
export interface Translatable {
    de: string;
    en: string;
}

/**
 * Module-level locale cache, set once at plugin-init from the Redux store.
 * Used by the imperative t() form (alerts, error messages, anything outside
 * a React render). React components should prefer useT() so they re-render
 * if the locale changes.
 */
let _moduleLocale: 'de' | 'en' = 'en';

export function setModuleLocale(locale: string | undefined): void {
    _moduleLocale = isGermanLocale(locale) ? 'de' : 'en';
}

/** Imperative form — use only outside React renders. */
export function t(m: Translatable): string {
    return m[_moduleLocale];
}

/**
 * React hook — returns a `t` function bound to the current user's locale.
 * Re-renders when the locale changes.
 */
export function useT(): (m: Translatable) => string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const locale = useSelector((s: any) => {
        const id = s?.entities?.users?.currentUserId;
        if (!id) {
            return undefined;
        }
        return s?.entities?.users?.profiles?.[id]?.locale as string | undefined;
    });
    const lang: 'de' | 'en' = isGermanLocale(locale) ? 'de' : 'en';
    return (m) => m[lang];
}

function isGermanLocale(locale: string | undefined): boolean {
    if (!locale) {
        return false;
    }
    const lower = locale.toLowerCase();
    return lower === 'de' || lower.startsWith('de-') || lower.startsWith('de_');
}
