import React, { useState } from 'react';
import { useActors } from '../hooks/useActors';
import AnalysisReport from './AnalysisReport';
import CryptoAnalysisPanel from './CryptoAnalysisPanel';
import type { CommunityReportSummary } from './CryptoAnalysisPanel';
import { analyseIndicator, isAiBackendConfigured } from '../services/aiChatService';
import type { AiChatSource, AiVerdict, AnalysableKind, LocalEvidence } from '../services/aiChatService';
import type { LookupResult } from '../../../declarations/identity/index.d.ts';
import type { ThreatResult } from '../../../declarations/threat_intelligence/index.d.ts';
import type { Report } from '../../../declarations/community/index.d.ts';

/**
 * Lookup tool — every tab is wired to a real canister query.
 *
 * identity            : reputation for phone / email / domain / IBAN / wallet
 * threat_intelligence : IOC match for url / domain / email / QR payload
 * community           : reports filed against the exact target (all tabs)
 *
 * All three are `query` calls that accept anonymous callers, so the tool works
 * before sign-in. When a source fails, its error is displayed — the tool never
 * renders a fabricated verdict.
 *
 * On top of the canisters, the same value is sent to the `ai-chat` Edge
 * Function's `analyse` action: it runs the external intelligence providers the
 * AI Assistant runs and computes the traffic-light verdict from *both* bodies
 * of evidence. That is what keeps this tool and the assistant from disagreeing
 * about the same number — there is one verdict function, not two.
 */

export type LookupType = 'phone' | 'email' | 'iban' | 'crypto' | 'url' | 'qr' | 'domain' | 'username';

const CONFIG: Record<LookupType, { label: string; icon: string; placeholder: string; desc: string }> = {
  phone:    { label: 'Phone Number',  icon: '📞', placeholder: '+1 555 123 4567',         desc: 'Check if this phone number is associated with known scams or fraud.' },
  email:    { label: 'Email Address', icon: '✉️', placeholder: 'user@example.com',         desc: 'Verify if this email address appears in threat feeds or scam reports.' },
  iban:     { label: 'IBAN',          icon: '🏦', placeholder: 'GB29 NWBK 6016 1331 9268 19', desc: 'Check this IBAN against known fraud accounts.' },
  crypto:   { label: 'Crypto Wallet', icon: '₿',  placeholder: '1A1zP1eP5QGefi2DMPTf...',  desc: 'Analyze a crypto wallet address for suspicious activity or scam association.' },
  url:      { label: 'URL',           icon: '🌐', placeholder: 'https://example.com',       desc: 'Scan this URL for phishing, malware, or suspicious content.' },
  qr:       { label: 'QR Code',       icon: '📷', placeholder: 'Paste decoded QR content…', desc: 'Analyze the content decoded from a QR code for threats.' },
  domain:   { label: 'Domain',        icon: '🖥', placeholder: 'example.com',               desc: 'Check domain reputation and threat intelligence.' },
  username: { label: 'Username',      icon: '👤', placeholder: '@username',                 desc: 'Search community reports filed against this username.' },
};

interface Props {
  lookupType: LookupType;
}

interface Outcome {
  /** The exact value that was looked up, kept so the panel never drifts. */
  target: string;
  reputation?: LookupResult;
  threat?: ThreatResult;
  reports: Report[];
  errors: string[];
  /** The shared verdict, when the backend could compute one. */
  verdict?: AiVerdict;
  /** Every external source the backend consulted for this value. */
  sources?: AiChatSource[];
}

/** The indicator kind the shared pipeline understands, per lookup tab. */
function analysableKind(type: LookupType, value: string): AnalysableKind | null {
  switch (type) {
    case 'phone':  return 'phone';
    case 'email':  return 'email';
    case 'iban':   return 'iban';
    case 'domain': return 'domain';
    case 'crypto': return /^0x[a-fA-F0-9]{40}$/.test(value) ? 'crypto_eth' : 'crypto_btc';
    case 'url':
    case 'qr':
      // A QR payload is only analysable when what it carries is a link.
      return /^https?:\/\//i.test(value) ? 'url' : null;
    // A username is not an internet indicator: no external provider covers it,
    // so the backend scores it over the community evidence alone.
    case 'username': return 'username';
    default:
      return null;
  }
}

/** Converts a canister answer into the evidence shape the backend expects. */
function localEvidence(outcome: Omit<Outcome, 'verdict'>): LocalEvidence {
  return {
    ...(outcome.reputation
      ? {
        reputation: {
          found: outcome.reputation.found,
          riskScore: Number(outcome.reputation.riskScore),
          trustScore: Number(outcome.reputation.trustScore),
          reportCount: Number(outcome.reputation.reportCount),
          isKnownScammer: outcome.reputation.isKnownScammer,
          isVerifiedBusiness: outcome.reputation.isVerifiedBusiness,
        },
      }
      : {}),
    ...(outcome.threat
      ? {
        threat: {
          isThreat: outcome.threat.isThreat,
          confidence: Number(outcome.threat.confidence),
          severity: optionalVariant(outcome.threat.severity),
          matchedIndicators: Number(outcome.threat.matchedIndicators),
        },
      }
      : {}),
    reports: outcome.reports.map(report => ({
      status: variantKey(report.status),
      riskScore: Number(report.riskScore),
    })),
  };
}

/** Variant → the single key it carries (e.g. `{ high: null }` → "high"). */
function variantKey(value: object): string {
  return Object.keys(value)[0] ?? 'unknown';
}

function optionalVariant(value: [] | [object]): string | null {
  const [first] = value;
  return first ? variantKey(first) : null;
}

/** The community reports, in the plain shape the crypto panel reads. */
function communityReports(reports: Report[]): CommunityReportSummary[] {
  return reports.map(report => ({
    category: variantKey(report.category),
    status: variantKey(report.status),
    riskScore: Number(report.riskScore),
    // The canister keeps nanoseconds since the epoch.
    createdAt: Number(report.createdAt / 1_000_000n),
  }));
}

function severityBadge(severity: string | null): string {
  if (severity === 'critical' || severity === 'high') return 'badge-red';
  if (severity === 'medium') return 'badge-amber';
  return 'badge-cyan';
}

export default function LookupTool({ lookupType }: Props) {
  const actors = useActors();
  const cfg = CONFIG[lookupType];

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const handleLookup = async () => {
    const target = query.trim();
    if (!target || loading) return;

    setLoading(true);
    setOutcome(null);

    const errors: string[] = [];
    let reputation: LookupResult | undefined;
    let threat: ThreatResult | undefined;
    let reports: Report[] = [];

    // ─── identity canister (reputation) ───────────────────────────────────
    try {
      switch (lookupType) {
        case 'phone':  reputation = await actors.identity.lookupPhone(target);  break;
        case 'email':  reputation = await actors.identity.lookupEmail(target);  break;
        case 'domain': reputation = await actors.identity.lookupDomain(target); break;
        case 'iban':   reputation = await actors.identity.lookupIBAN(target);   break;
        case 'crypto': reputation = await actors.identity.lookupWallet(target); break;
        default: break; // url / qr / username have no reputation dimension
      }
    } catch (e) {
      errors.push(`identity: ${e instanceof Error ? e.message : String(e)}`);
    }

    // ─── threat_intelligence canister (IOC match) ─────────────────────────
    try {
      switch (lookupType) {
        case 'url':
        case 'qr':     threat = await actors.threatIntelligence.checkUrl(target);    break;
        case 'domain': threat = await actors.threatIntelligence.checkDomain(target); break;
        case 'email':  threat = await actors.threatIntelligence.checkEmail(target);  break;
        default: break;
      }
    } catch (e) {
      errors.push(`threat_intelligence: ${e instanceof Error ? e.message : String(e)}`);
    }

    // ─── community canister (reports against this exact target) ───────────
    try {
      reports = await actors.community.getReportsByTarget(target);
    } catch (e) {
      errors.push(`community: ${e instanceof Error ? e.message : String(e)}`);
    }

    const canisterOutcome = { target, reputation, threat, reports, errors };
    setOutcome(canisterOutcome);

    // ─── shared verdict (same pipeline as the AI Assistant) ───────────────
    const kind = analysableKind(lookupType, target);
    if (kind && isAiBackendConfigured) {
      try {
        const { verdict, sources } = await analyseIndicator(kind, target, localEvidence(canisterOutcome));
        setOutcome({ ...canisterOutcome, verdict, sources });
      } catch (e) {
        setOutcome({
          ...canisterOutcome,
          errors: [...errors, `verdict: ${e instanceof Error ? e.message : String(e)}`],
        });
      }
    }

    setLoading(false);
  };

  const threatSeverity = outcome?.threat ? optionalVariant(outcome.threat.severity) : null;

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '1.8rem' }}>{cfg.icon}</span>
        <div>
          <h1 style={{ margin: 0 }}>{cfg.label} Lookup</h1>
          <p className="text-muted" style={{ margin: 0, fontSize: '0.88rem' }}>{cfg.desc}</p>
        </div>
        <span className="badge-beta" style={{ marginLeft: 'auto' }}>BETA</span>
      </div>

      <div className="card mt-2" style={{ maxWidth: 600 }}>
        <div className="mb-2">
          <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.4rem' }}>
            {cfg.label}
          </label>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={cfg.placeholder}
            onKeyDown={e => { if (e.key === 'Enter') void handleLookup(); }}
          />
        </div>
        <button
          className="btn-primary"
          style={{ width: '100%' }}
          onClick={() => void handleLookup()}
          disabled={loading || !query.trim()}
        >
          {loading ? '⏳ Searching…' : `🔎 Lookup ${cfg.label}`}
        </button>
      </div>

      {outcome && (
        <div className="card mt-2" style={{ maxWidth: lookupType === 'crypto' ? 860 : 600 }}>
          <h3 style={{ marginTop: 0 }}>Result</h3>

          <AnalysisReport verdict={outcome.verdict} sources={outcome.sources}>
            {lookupType === 'crypto' && (
              <CryptoAnalysisPanel
                address={outcome.target}
                chain={/^0x[a-fA-F0-9]{40}$/.test(outcome.target) ? 'eth' : 'btc'}
                verdict={outcome.verdict}
                sources={outcome.sources ?? []}
                reports={communityReports(outcome.reports)}
              />
            )}
          </AnalysisReport>

          {outcome.errors.map(err => (
            <div key={err} className="alert-error mb-2" role="alert">⚠ {err}</div>
          ))}

          {outcome.reputation && (
            <section className="mb-2">
              <h4 style={{ margin: '0 0 0.4rem' }}>Reputation (identity canister)</h4>
              {outcome.reputation.found ? (
                <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.88rem' }}>
                  <li>Risk score: <strong>{String(outcome.reputation.riskScore)}/100</strong></li>
                  <li>Trust score: <strong>{String(outcome.reputation.trustScore)}/100</strong></li>
                  <li>Reports: <strong>{String(outcome.reputation.reportCount)}</strong></li>
                  {outcome.reputation.isKnownScammer && <li style={{ color: 'var(--accent-red)' }}>⚠ Known scammer</li>}
                  {outcome.reputation.isVerifiedBusiness && <li style={{ color: 'var(--accent-green)' }}>✅ Verified business</li>}
                  {outcome.reputation.notes.map(note => <li key={note}>{note}</li>)}
                </ul>
              ) : (
                <p className="text-muted" style={{ margin: 0, fontSize: '0.88rem' }}>No reputation record for this identifier.</p>
              )}
            </section>
          )}

          {outcome.threat && (
            <section className="mb-2">
              <h4 style={{ margin: '0 0 0.4rem' }}>Threat intelligence</h4>
              {outcome.threat.isThreat ? (
                <div>
                  <span className={`badge ${severityBadge(threatSeverity)}`}>
                    {(threatSeverity ?? 'unknown').toUpperCase()}
                  </span>
                  <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem', fontSize: '0.88rem' }}>
                    <li>Confidence: <strong>{String(outcome.threat.confidence)}%</strong></li>
                    <li>Matched indicators: <strong>{String(outcome.threat.matchedIndicators)}</strong></li>
                    {outcome.threat.details.map(detail => <li key={detail}>{detail}</li>)}
                  </ul>
                </div>
              ) : (
                <p className="text-muted" style={{ margin: 0, fontSize: '0.88rem' }}>
                  No indicator of compromise matched this value.
                </p>
              )}
            </section>
          )}

          <section>
            <h4 style={{ margin: '0 0 0.4rem' }}>Community reports</h4>
            {outcome.reports.length === 0 ? (
              <p className="text-muted" style={{ margin: 0, fontSize: '0.88rem' }}>
                No community reports filed against this target.
              </p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.88rem' }}>
                {outcome.reports.map(report => (
                  <li key={report.id}>
                    <strong>{variantKey(report.category)}</strong> · {variantKey(report.status)} · risk{' '}
                    {String(report.riskScore)}/100 — {report.description}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
