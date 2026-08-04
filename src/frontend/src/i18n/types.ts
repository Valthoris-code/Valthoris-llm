/**
 * VALTHORIS internationalization — core types.
 *
 * Two languages are shipped today (Portuguese and English). The remaining
 * locales are declared so that the selector, routing and persistence layers are
 * already prepared; they fall back to English until their catalogue lands.
 */
export const SUPPORTED_LOCALES = ['pt', 'en'] as const;
export const FUTURE_LOCALES = ['es', 'fr', 'de', 'it'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export type FutureLocale = (typeof FUTURE_LOCALES)[number];
export type Locale = SupportedLocale | FutureLocale;

export const ALL_LOCALES: Locale[] = [...SUPPORTED_LOCALES, ...FUTURE_LOCALES];

export interface LocaleMeta {
  code: Locale;
  label: string;
  flag: string;
  available: boolean;
}

export const LOCALE_META: LocaleMeta[] = [
  { code: 'pt', label: 'Português', flag: '🇵🇹', available: true },
  { code: 'en', label: 'English', flag: '🇬🇧', available: true },
  { code: 'es', label: 'Español', flag: '🇪🇸', available: false },
  { code: 'fr', label: 'Français', flag: '🇫🇷', available: false },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪', available: false },
  { code: 'it', label: 'Italiano', flag: '🇮🇹', available: false },
];

/** Flat dictionary: dotted key → translated string. */
export type Catalogue = Record<string, string>;
