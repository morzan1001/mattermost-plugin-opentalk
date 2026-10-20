import {useSelector} from 'react-redux';

import {selectCurrentUserLocale} from './selectors';

/**
 * A pair of translations for a single user-facing string.
 * Use as: t({de: '...', en: '...'}) — returns the matching variant
 * for the current MM-user locale (de for de/de-*, en otherwise).
 */
export interface Translatable {
    de: string;
    en: string;
}

// Module-level locale cache, set once at plugin-init from the Redux store.
// React components should prefer useT() so they re-render on locale changes.
let moduleLocale: 'de' | 'en' = 'en';

export function setModuleLocale(locale: string | undefined): void {
    moduleLocale = isGermanLocale(locale) ? 'de' : 'en';
}

/** Imperative form — use only outside React renders. */
export function t(m: Translatable): string {
    return m[moduleLocale];
}

export function useT(): (m: Translatable) => string {
    const locale = useSelector(selectCurrentUserLocale);
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
