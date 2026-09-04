/**
 * /admin/threat-intelligence — Threat Intelligence.
 *
 * Indicators aggregated by threat type, computed from the tables this project
 * owns: the reports, the blacklist and the entity reputation. There is no
 * external feed behind this page, and a type with nothing behind it shows zero
 * rather than a plausible-looking number.
 */

import React, { useEffect, useState } from 'react';
import { fetchThreatIntel } from '../adminApi';
import type { ThreatIntelSummary } from '../adminApi';
import { ADMIN_GENERIC_ERROR } from '../adminClient';
import { EmptyState, formatDate } from './commandCenterUi';

/** One glyph per indicator, matching the vocabulary the backend returns. */
const ICONS: Record<string, string> = {
  phone_scam: '📞',
  phishing: '🎣',
  fraudulent_url: '🔗',
  malicious_ip: '🌐',
  suspicious_domain: '🏷',
  crypto_fraud: '₿',
  suspicious_iban: '🏦',
  romance_scam: '💔',
};

export default function ThreatIntelligencePage() {
  const [data, setData] = useState<ThreatIntelSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchThreatIntel()
      .then(result => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError(ADMIN_GENERIC_ERROR);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const indicators = data?.indicators ?? [];
  const everything = indicators.reduce((sum, indicator) => sum + indicator.total, 0);

  return (
    <>
      <h1 className="vadmin-page-title">Threat Intelligence</h1>
      <p className="vadmin-page-sub">
        Indicadores agregados por tipo de ameaça, calculados a partir das denúncias, da
        blacklist e da reputação registadas neste Supabase.
      </p>

      {error && <div className="vadmin-alert" role="alert">{error}</div>}
      {loading && !data && <EmptyState>A agregar os indicadores…</EmptyState>}

      {data && everything === 0 && (
        <EmptyState>
          Ainda não existe nenhum indicador: não há denúncias, entradas de blacklist nem
          entidades avaliadas.
        </EmptyState>
      )}

      {data && everything > 0 && (
        <>
          <div className="vadmin-card vadmin-table-wrap">
            <table className="vadmin-table">
              <thead>
                <tr>
                  <th>Tipo de ameaça</th>
                  <th style={{ textAlign: 'right' }}>Denúncias</th>
                  <th style={{ textAlign: 'right' }}>Últimos 7 dias</th>
                  <th style={{ textAlign: 'right' }}>Confirmadas</th>
                  <th style={{ textAlign: 'right' }}>Na blacklist</th>
                  <th style={{ textAlign: 'right' }}>Entidades sinalizadas</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {indicators.map(indicator => (
                  <tr key={indicator.key}>
                    <td>
                      <span aria-hidden="true">{ICONS[indicator.key] ?? '•'}</span>{' '}
                      {indicator.label}
                    </td>
                    <td style={{ textAlign: 'right' }}>{indicator.reports}</td>
                    <td style={{ textAlign: 'right' }}>{indicator.reports7d}</td>
                    <td style={{ textAlign: 'right' }}>{indicator.confirmed}</td>
                    <td style={{ textAlign: 'right' }}>{indicator.blacklisted}</td>
                    <td style={{ textAlign: 'right' }}>{indicator.flaggedEntities}</td>
                    <td style={{ textAlign: 'right' }}>{indicator.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="vadmin-stat-hint" style={{ marginTop: '0.8rem' }}>
            Gerado em {formatDate(data.generatedAt)}. Os totais somam denúncias e entradas
            ativas de blacklist do mesmo tipo; nada é estimado.
          </p>
        </>
      )}
    </>
  );
}
