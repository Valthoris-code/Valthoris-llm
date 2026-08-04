import { useContext } from 'react';
import { I18nContext } from './I18nContext';
import type { I18nValue } from './I18nContext';

/** Access the active locale and the translation helpers. */
export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used inside <I18nProvider>');
  }
  return ctx;
}

/** Shorthand for components that only need the translate function. */
export function useT() {
  return useI18n().t;
}
