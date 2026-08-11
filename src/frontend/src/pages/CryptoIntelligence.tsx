import React, { useState } from 'react';
import { useActors } from '../hooks/useActors';
import type { LookupResult } from '../../../declarations/identity/index.d.ts';
import type { ThreatResult } from '../../../declarations/threat_intelligence/index.d.ts';
import type { Report } from '../../../declarations/community/index.d.ts';

/**
 * Crypto Intelligence.
 *
 * A wallet address is resolved against the three canisters that actually hold
 * data about identifiers:
 *   • identity            — reputation / known-scammer record for the address
 *   • threat_intelligence — indicator match (all `check*` entry points resolve
 *                           the same indicator index, so the raw address is
 *                           looked up directly)
 *   • community           — reports filed against this exact address
 *
 * Nothing is inferred or invented: when a source has no record the UI says so,
 * and when a source fails its error is shown without discarding the results of
 * the sources that answered.
 */

/** Variant → the single key it carries (e.g. `{ high: null }` → "high"). */
function variantKey(value: object): string {
  return Object.keys(value)[0] ?? 'unknown';
}

function optionalVariant(value: [] | [object]): string | null {
  const [first] = value;
  return first ? variantKey(first) : null;
}

interface Outcome {
  address: string;
  reputation?: LookupResult;
  threat?: ThreatResult;
  reports: Report[];
  errors: string[];
}

export default function CryptoIntelligence() {
  const actors = useActors();

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const handleScan = async () => {
    const address = query.trim();
    if (!address || loading) return;

    setLoading(true);
    setOutcome(null);

    const errors: string[] = [];
    let reputation: LookupResult | undefined;
    let threat: ThreatResult | undefined;
    let reports: Report[] = [];

    try {
      reputation = await actors.identity.lookupWallet(address);
    } catch (e) {
      errors.push(`identity: ${e instanceof Error ? e.message : String(e)}`);
    }

    try {
      threat = await actors.threatIntelligence.checkHash(address);
    } catch (e) {
      errors.push(`threat_intelligence: ${e instanceof Error ? e.message : String(e)}`);
    }

    try {
      reports = await actors.community.getReportsByTarget(address);
    } catch (e) {
      errors.push(`community: ${e instanceof Error ? e.message : String(e)}`);
    }

    setOutcome({ address, reputation, threat, reports, errors });
    setLoading(false);
  };

  const threatSeverity = outcome?.threat ? optionalVariant(outcome.threat.severity) : null;
  const threatCategory = outcome?.threat ? optionalVariant(outcome.threat.category) : null;

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <h1 style={{ margin: 0 }}>₿ Crypto Intelligence</h1>
        <span className="badge-beta">BETA</span>
      </div>
      <p className="text-muted">
        Check a wallet address against the Valthoris reputation, threat-indicator and community
        report canisters.
      </p>

      <div className="card mt-2" style={{ maxWidth: 620 }}>
        <div className="mb-2">
          <label
            style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}
          >
            Wallet address
          </label>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="0x… or 1A1zP1…"
            onKeyDown={e => e.key === 'Enter' && void handleScan()}
          />
        </div>

        <button
          className="btn-primary"
          style={{ width: '100%' }}
          onClick={() => void handleScan()}
          disabled={loading || !query.trim()}
        >
          {loading ? '⏳ Querying canisters…' : '₿ Analyze wallet'}
        </button>
      </div>

      {outcome && (
        <div className="card mt-2" style={{ maxWidth: 620 }}>
          <h3 style={{ marginTop: 0 }}>Result for {outcome.address}</h3>

          {outcome.errors.map(err => (
            <div className="alert-error" key={err} style={{ marginBottom: '0.5rem' }}>
              {err}
            </div>
          ))}

          <h4 style={{ marginBottom: '0.25rem' }}>Reputation (identity canister)</h4>
          {!outcome.reputation ? (
            <p className="text-muted" style={{ margin: 0, fontSize: '0.85rem' }}>
              Source unavailable — see the error above.
            </p>
          ) : !outcome.reputation.found ? (
            <p className="text-muted" style={{ margin: 0, fontSize: '0.85rem' }}>
              No record found for this address.
            </p>
          ) : (
            <ul style={{ margin: '0 0 0 1rem', fontSize: '0.85rem' }}>
              <li>Risk score: <strong>{String(outcome.reputation.riskScore)}</strong></li>
              <li>Trust score: <strong>{String(outcome.reputation.trustScore)}</strong></li>
              <li>Reports recorded: <strong>{String(outcome.reputation.reportCount)}</strong></li>
              <li>Known scammer: <strong>{outcome.reputation.isKnownScammer ? 'yes' : 'no'}</strong></li>
              <li>
                Verified business:{' '}
                <strong>{outcome.reputation.isVerifiedBusiness ? 'yes' : 'no'}</strong>
              </li>
              {outcome.reputation.notes.map(note => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}

          <h4 style={{ marginBottom: '0.25rem' }}>Threat indicators (threat_intelligence canister)</h4>
          {!outcome.threat ? (
            <p className="text-muted" style={{ margin: 0, fontSize: '0.85rem' }}>
              Source unavailable — see the error above.
            </p>
          ) : !outcome.threat.isThreat ? (
            <p className="text-muted" style={{ margin: 0, fontSize: '0.85rem' }}>
              No active indicator matches this address.
            </p>
          ) : (
            <ul style={{ margin: '0 0 0 1rem', fontSize: '0.85rem' }}>
              <li>Severity: <strong>{threatSeverity ?? 'unknown'}</strong></li>
              <li>Category: <strong>{threatCategory ?? 'unknown'}</strong></li>
              <li>Confidence: <strong>{String(outcome.threat.confidence)}</strong></li>
              <li>Matching indicators: <strong>{String(outcome.threat.matchedIndicators)}</strong></li>
              {outcome.threat.details.map(detail => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          )}

          <h4 style={{ marginBottom: '0.25rem' }}>Community reports (community canister)</h4>
          {outcome.reports.length === 0 ? (
            <p className="text-muted" style={{ margin: 0, fontSize: '0.85rem' }}>
              No community report filed against this address.
            </p>
          ) : (
            <ul style={{ margin: '0 0 0 1rem', fontSize: '0.85rem' }}>
              {outcome.reports.map(report => (
                <li key={report.id}>
                  <strong>{variantKey(report.category)}</strong> — {report.description} (
                  {variantKey(report.status)}, risk {String(report.riskScore)})
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
