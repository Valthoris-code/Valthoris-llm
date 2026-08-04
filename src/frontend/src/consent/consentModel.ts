/**
 * VALTHORIS consent model.
 *
 * Consent is stored locally (localStorage) so the platform is usable without a
 * backend. Every write also produces a record shaped for future server-side
 * synchronisation — see `pendingSync` below.
 */
export const COOKIE_CATEGORIES = [
  'essential',
  'analytics',
  'performance',
  'marketing',
  'security',
  'fraud',
] as const;

export type CookieCategory = (typeof COOKIE_CATEGORIES)[number];

/** Categories the platform cannot operate without. */
export const REQUIRED_CATEGORIES: CookieCategory[] = ['essential'];

export type CookiePreferences = Record<CookieCategory, boolean>;

export interface ConsentRecord {
  /** Schema version — bump to force re-consent after a policy change. */
  version: number;
  acceptedTerms: boolean;
  acceptedPrivacy: boolean;
  acceptedCookies: boolean;
  confirmedAge: boolean;
  preferences: CookiePreferences;
  /** ISO timestamp of the last update. */
  updatedAt: string;
  /** Locale in which the consent was given (required for GDPR evidence). */
  locale: string;
}

export const CONSENT_VERSION = 1;

export const CONSENT_STORAGE_KEY = 'valthoris.consent.v1';

export function defaultPreferences(optIn: boolean): CookiePreferences {
  return COOKIE_CATEGORIES.reduce((acc, category) => {
    acc[category] = REQUIRED_CATEGORIES.includes(category) ? true : optIn;
    return acc;
  }, {} as CookiePreferences);
}

export function essentialOnlyRecord(locale: string): ConsentRecord {
  return {
    version: CONSENT_VERSION,
    acceptedTerms: true,
    acceptedPrivacy: true,
    acceptedCookies: true,
    confirmedAge: true,
    preferences: defaultPreferences(false),
    updatedAt: new Date().toISOString(),
    locale,
  };
}

export function readConsent(): ConsentRecord | null {
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentRecord;
    if (parsed.version !== CONSENT_VERSION) return null;
    // Guard against hand-edited or partially written records.
    if (!parsed.preferences || typeof parsed.preferences !== 'object') return null;
    return {
      ...parsed,
      preferences: COOKIE_CATEGORIES.reduce((acc, category) => {
        acc[category] = REQUIRED_CATEGORIES.includes(category)
          ? true
          : parsed.preferences[category] === true;
        return acc;
      }, {} as CookiePreferences),
    };
  } catch {
    return null;
  }
}

export function writeConsent(record: ConsentRecord): void {
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Storage may be unavailable; consent then applies to the session only.
  }
  // TODO(backend): synchronise the consent record with the compliance service
  // (proof of consent, timestamp, locale, IP-derived jurisdiction).
}

export function clearConsent(): void {
  try {
    window.localStorage.removeItem(CONSENT_STORAGE_KEY);
  } catch {
    // ignore
  }
}
