import React from 'react';
import { useI18n } from '../i18n/useI18n';

/** Toolbar language selector. Unavailable locales are listed but disabled. */
export default function LanguageSelector({ compact = false }: { compact?: boolean }) {
  const { locale, locales, setLocale, t } = useI18n();

  return (
    <label className="lang-selector">
      <span className="sr-only">{t('common.language')}</span>
      <select
        value={locale}
        onChange={e => setLocale(e.target.value as typeof locale)}
        aria-label={t('common.language')}
        className={compact ? 'lang-select lang-select-compact' : 'lang-select'}
      >
        {locales.map(meta => (
          <option key={meta.code} value={meta.code} disabled={!meta.available}>
            {meta.flag} {compact ? meta.code.toUpperCase() : meta.label}
            {meta.available ? '' : ' — soon'}
          </option>
        ))}
      </select>
    </label>
  );
}
