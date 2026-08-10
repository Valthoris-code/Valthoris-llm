import React, { useCallback, useEffect, useState } from 'react';
import { useActorsReady } from '../hooks/useActors';
import type { ThreatEntry, ThreatStats } from '../../../declarations/threat_intelligence/index.d.ts';

/**
 * Threat Intelligence — backed by the `threat_intelligence` canister.
 *
 * Stats : threat_intelligence.getStats
 * Feed  : threat_intelligence.listActiveThreats
 *
 * Both are query calls that work for anonymous visitors, so the page renders
 * real data before the user signs in. Failures show the real canister error
 * instead of a permanent "loading" skeleton.
 */

const FEED_LIMIT = 50;

/** Variant → the single key it carries (e.g. `{ high: null }` → "high"). */
function variantKey(value: object): string {
  return Object.keys(value)[0] ?? 'unknown';
}

function severityBadge(severity: string): string {
  if (severity === 'critical' || severity === 'high') return 'badge-red';
  if (severity === 'medium') return 'badge-amber';
  return 'badge-cyan';
}

function formatTime(ns: bigint): string {
  return new Date(Number(ns / BigInt(1_000_000))).toLocaleString();
}

export default function ThreatIntelligence() {
  const { actors, ready } = useActorsReady();

  const [stats, setStats] = useState<ThreatStats | null>(null);
  const [threats, setThreats] = useState<ThreatEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [threatStats, active] = await Promise.all([
        actors.threatIntelligence.getStats(),
        actors.threatIntelligence.listActiveThreats(BigInt(FEED_LIMIT)),
      ]);
      setStats(threatStats);
      setThreats(active);
    } catch (e) {
      setStats(null);
      setThreats([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [actors]);

  useEffect(() => {
    if (!ready) return;
    void load();
  }, [ready, load]);

  const cards = [
    { icon: '📚', label: 'Indicators',      value: stats?.totalEntries,    color: 'var(--accent-cyan)',  desc: 'Total indicators stored' },
    { icon: '📍', label: 'Active IOCs',     value: stats?.activeThreats,   color: 'var(--accent-blue)',  desc: 'Currently active indicators' },
    { icon: '🔥', label: 'Critical',        value: stats?.criticalThreats, color: 'var(--accent-red)',   desc: 'Critical severity' },
    { icon: '⚠',  label: 'High severity',   value: stats?.highThreats,     color: 'var(--accent-amber)', desc: 'High severity' },
  ];

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <h1 style={{ margin: 0 }}>🛡 Threat Intelligence</h1>
        <span className="badge-beta">BETA</span>
        <button
          className="btn-secondary"
          style={{ marginLeft: 'auto', fontSize: '0.8rem' }}
          onClick={() => void load()}
          disabled={loading}
        >
          🔄 {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      <p className="text-muted">
        Aggregated threat feeds and indicators of compromise from the <code>threat_intelligence</code> canister.
      </p>

      {error && <div className="alert-error mt-2" role="alert">⚠ {error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
        {cards.map(s => (
          <div key={s.label} className="card glass" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <span style={{ fontSize: '1.8rem' }}>{s.icon}</span>
            <div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: s.color }}>
                {s.value === undefined ? '—' : String(s.value)}
              </div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{s.label}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="card mt-3">
        <h3 style={{ marginTop: 0 }}>Recent Threat Indicators</h3>

        {loading ? (
          <div className="spinner" role="status" aria-label="Loading" />
        ) : threats.length === 0 ? (
          <p className="text-muted" style={{ padding: '1.5rem 0', textAlign: 'center' }}>
            {error
              ? 'The threat feed could not be loaded.'
              : 'No active indicators are published in the canister yet.'}
          </p>
        ) : (
          threats.map(threat => {
            const severity = variantKey(threat.severity);
            return (
              <div
                key={threat.id}
                style={{
                  display: 'flex',
                  gap: '1rem',
                  padding: '0.75rem 0',
                  borderBottom: '1px solid var(--border)',
                  alignItems: 'center',
                }}
              >
                <span className={`badge ${severityBadge(severity)}`} style={{ fontSize: '0.7rem', flexShrink: 0 }}>
                  {severity.toUpperCase()}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, wordBreak: 'break-all' }}>{threat.indicator}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {variantKey(threat.indicatorType)} · {variantKey(threat.category)} · confidence {String(threat.confidence)}%
                  </div>
                  {threat.description && (
                    <div style={{ fontSize: '0.82rem', marginTop: 4 }}>{threat.description}</div>
                  )}
                  {threat.tags.length > 0 && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
                      {threat.tags.map(tag => `#${tag}`).join(' ')}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                  {formatTime(threat.lastSeen)}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
