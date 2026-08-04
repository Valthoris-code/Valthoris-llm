import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  CONSENT_VERSION,
  clearConsent,
  defaultPreferences,
  essentialOnlyRecord,
  readConsent,
  writeConsent,
} from './consentModel';
import type { ConsentRecord, CookieCategory, CookiePreferences } from './consentModel';

interface ConsentValue {
  consent: ConsentRecord | null;
  /** True when the first-open flow still has to be completed. */
  needsConsent: boolean;
  preferences: CookiePreferences;
  hasCategory: (category: CookieCategory) => boolean;
  acceptAll: (locale: string) => void;
  acceptEssentialOnly: (locale: string) => void;
  savePreferences: (input: {
    preferences: CookiePreferences;
    acceptedTerms: boolean;
    acceptedPrivacy: boolean;
    acceptedCookies: boolean;
    confirmedAge: boolean;
    locale: string;
  }) => void;
  reset: () => void;
}

const ConsentContext = createContext<ConsentValue | null>(null);

export function ConsentProvider({ children }: { children: React.ReactNode }) {
  const [consent, setConsent] = useState<ConsentRecord | null>(() => readConsent());

  const persist = useCallback((record: ConsentRecord) => {
    writeConsent(record);
    setConsent(record);
  }, []);

  const acceptAll = useCallback(
    (locale: string) => {
      persist({
        version: CONSENT_VERSION,
        acceptedTerms: true,
        acceptedPrivacy: true,
        acceptedCookies: true,
        confirmedAge: true,
        preferences: defaultPreferences(true),
        updatedAt: new Date().toISOString(),
        locale,
      });
    },
    [persist]
  );

  const acceptEssentialOnly = useCallback(
    (locale: string) => persist(essentialOnlyRecord(locale)),
    [persist]
  );

  const savePreferences = useCallback<ConsentValue['savePreferences']>(
    input => {
      persist({
        version: CONSENT_VERSION,
        acceptedTerms: input.acceptedTerms,
        acceptedPrivacy: input.acceptedPrivacy,
        acceptedCookies: input.acceptedCookies,
        confirmedAge: input.confirmedAge,
        preferences: { ...input.preferences, essential: true },
        updatedAt: new Date().toISOString(),
        locale: input.locale,
      });
    },
    [persist]
  );

  const reset = useCallback(() => {
    clearConsent();
    setConsent(null);
  }, []);

  const value = useMemo<ConsentValue>(() => {
    const preferences = consent?.preferences ?? defaultPreferences(false);
    return {
      consent,
      needsConsent:
        !consent ||
        !consent.acceptedTerms ||
        !consent.acceptedPrivacy ||
        !consent.acceptedCookies ||
        !consent.confirmedAge,
      preferences,
      hasCategory: (category: CookieCategory) => preferences[category] === true,
      acceptAll,
      acceptEssentialOnly,
      savePreferences,
      reset,
    };
  }, [consent, acceptAll, acceptEssentialOnly, savePreferences, reset]);

  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
}

export function useConsent(): ConsentValue {
  const ctx = useContext(ConsentContext);
  if (!ctx) throw new Error('useConsent must be used inside <ConsentProvider>');
  return ctx;
}
