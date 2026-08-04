import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import en from './en';
import pt from './pt';
import { LOCALE_META, SUPPORTED_LOCALES } from './types';
import type { Catalogue, Locale, SupportedLocale } from './types';

const STORAGE_KEY = 'valthoris.locale';

const CATALOGUES: Record<SupportedLocale, Catalogue> = { en, pt };

function isSupported(value: string | null): value is SupportedLocale {
  return !!value && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Resolve the initial locale from storage, then the browser, then English. */
function detectLocale(): SupportedLocale {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isSupported(stored)) return stored;
  } catch {
    // storage unavailable (private mode / SSR) — fall through
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language : '';
  const short = nav.slice(0, 2).toLowerCase();
  return isSupported(short) ? short : 'en';
}

export interface I18nValue {
  locale: SupportedLocale;
  /** Every locale exposed by the selector, including not-yet-available ones. */
  locales: typeof LOCALE_META;
  setLocale: (locale: Locale) => void;
  /** Translate a key; falls back to English and then to the key itself. */
  t: (key: string, vars?: Record<string, string | number>) => string;
  /**
   * Auto-translation entry point for user generated content
   * (community reports, AI conversations, threat descriptions).
   *
   * TODO(backend): route through the VALTHORIS translation service and cache
   * results. Until then the original text is returned unchanged so nothing is
   * silently mistranslated.
   */
  translateContent: (text: string, sourceLocale?: string) => string;
  /** Whether auto-translation of user content is enabled by the user. */
  autoTranslate: boolean;
  setAutoTranslate: (value: boolean) => void;
}

export const I18nContext = createContext<I18nValue | null>(null);

const AUTO_KEY = 'valthoris.autoTranslate';

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>(detectLocale);
  const [autoTranslate, setAutoTranslateState] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(AUTO_KEY) !== 'false';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    if (!isSupported(next)) return; // future locales are not selectable yet
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore persistence failures
    }
  }, []);

  const setAutoTranslate = useCallback((value: boolean) => {
    setAutoTranslateState(value);
    try {
      window.localStorage.setItem(AUTO_KEY, String(value));
    } catch {
      // ignore persistence failures
    }
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const raw = CATALOGUES[locale][key] ?? en[key] ?? key;
      if (!vars) return raw;
      return Object.entries(vars).reduce(
        (acc, [name, value]) => acc.split(`{${name}}`).join(String(value)),
        raw
      );
    },
    [locale]
  );

  const translateContent = useCallback(
    (text: string, sourceLocale?: string) => {
      if (!autoTranslate) return text;
      if (sourceLocale && sourceLocale === locale) return text;
      // TODO(backend): call the translation endpoint; returning the source text
      // keeps the UI honest while the service is not wired.
      return text;
    },
    [autoTranslate, locale]
  );

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      locales: LOCALE_META,
      setLocale,
      t,
      translateContent,
      autoTranslate,
      setAutoTranslate,
    }),
    [locale, setLocale, t, translateContent, autoTranslate, setAutoTranslate]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
