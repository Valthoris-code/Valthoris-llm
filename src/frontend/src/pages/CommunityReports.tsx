import React, { useCallback, useEffect, useState } from 'react';
import { useActorsReady } from '../hooks/useActors';
import { useAuth } from '../hooks/useAuth';
import type { Report, ReportCategory } from '../../../declarations/community/index.d.ts';

/**
 * Community Reports — backed by the `community` canister.
 *
 * Feed  : community.listRecentReports / getStats
 * Submit: community.submitReport (requires an authenticated principal)
 * Votes : community.voteConfirm / voteReject
 *
 * Every failure surfaces the real canister error; a rejected submission is
 * never reported as a success.
 */

type CategoryId =
  | 'phishing' | 'smishing' | 'scam' | 'malware' | 'spam'
  | 'fraud' | 'impersonation' | 'cryptoFraud' | 'other';

const CATEGORIES: Array<{ value: CategoryId; label: string }> = [
  { value: 'phishing',      label: '🎣 Phishing' },
  { value: 'smishing',      label: '📱 Smishing' },
  { value: 'scam',          label: '🚨 Scam' },
  { value: 'malware',       label: '🦠 Malware' },
  { value: 'spam',          label: '📨 Spam' },
  { value: 'fraud',         label: '💳 Fraud' },
  { value: 'impersonation', label: '🎭 Impersonation' },
  { value: 'cryptoFraud',   label: '₿ Crypto fraud' },
  { value: 'other',         label: '❓ Other' },
];

function toCategory(id: CategoryId): ReportCategory {
  return { [id]: null } as unknown as ReportCategory;
}

/** Variant → the single key it carries (e.g. `{ phishing: null }` → "phishing"). */
function variantKey(value: object): string {
  return Object.keys(value)[0] ?? 'unknown';
}

function statusBadge(status: string): string {
  if (status === 'confirmed')     return 'badge-red';
  if (status === 'rejected')      return 'badge-green';
  if (status === 'investigating') return 'badge-amber';
  return 'badge-cyan';
}

function formatTime(ns: bigint): string {
  return new Date(Number(ns / BigInt(1_000_000))).toLocaleString();
}

export default function CommunityReports() {
  const { actors, ready } = useActorsReady();
  const { isAuthenticated } = useAuth();

  const [tab, setTab] = useState<'feed' | 'submit'>('feed');
  const [form, setForm] = useState<{ category: CategoryId; target: string; description: string }>({
    category: 'phishing',
    target: '',
    description: '',
  });

  const [reports, setReports] = useState<Report[]>([]);
  const [stats, setStats] = useState<{ total: bigint; confirmed: bigint; pending: bigint } | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedError, setFeedError] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submittedId, setSubmittedId] = useState('');
  const [votingId, setVotingId] = useState('');

  const loadFeed = useCallback(async () => {
    setLoading(true);
    setFeedError('');
    try {
      const [recent, communityStats] = await Promise.all([
        actors.community.listRecentReports(BigInt(50)),
        actors.community.getStats(),
      ]);
      setReports(recent);
      setStats({
        total: communityStats.totalReports,
        confirmed: communityStats.confirmedThreats,
        pending: communityStats.pendingReports,
      });
    } catch (e) {
      setReports([]);
      setStats(null);
      setFeedError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [actors]);

  useEffect(() => {
    if (!ready) return;
    void loadFeed();
  }, [ready, loadFeed]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    setSubmittedId('');

    if (!isAuthenticated) {
      setSubmitError('Sign in with Internet Identity before submitting a report.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await actors.community.submitReport(
        toCategory(form.category),
        form.target.trim(),
        form.description.trim(),
        [],
      );
      if ('err' in result) {
        setSubmitError(result.err);
        return;
      }
      setSubmittedId(result.ok);
      setForm(f => ({ ...f, target: '', description: '' }));
      await loadFeed();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const vote = async (id: string, confirm: boolean) => {
    setFeedError('');
    if (!isAuthenticated) {
      setFeedError('Sign in with Internet Identity to vote on reports.');
      return;
    }
    setVotingId(id);
    try {
      const result = confirm
        ? await actors.community.voteConfirm(id)
        : await actors.community.voteReject(id);
      if ('err' in result) {
        setFeedError(result.err);
        return;
      }
      await loadFeed();
    } catch (err) {
      setFeedError(err instanceof Error ? err.message : String(err));
    } finally {
      setVotingId('');
    }
  };

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>🚨 Community Reports</h1>
        <span className="badge-beta">BETA</span>
      </div>
      <p className="text-muted">Collective threat reporting powered by the VALTHORIS community.</p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
        {(['feed', 'submit'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? 'rgba(0,212,255,0.12)' : 'none',
              border: `1px solid ${tab === t ? 'var(--accent-cyan)' : 'var(--border)'}`,
              color: tab === t ? 'var(--accent-cyan)' : 'var(--text-muted)',
              borderRadius: 6, padding: '0.35rem 1rem', cursor: 'pointer', fontSize: '0.88rem',
            }}
          >
            {t === 'feed' ? '📋 Live Feed' : '➕ Submit Report'}
          </button>
        ))}
      </div>

      {tab === 'feed' && (
        <div>
          {stats && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
              {[
                { label: 'Total reports', value: stats.total,     color: 'var(--accent-cyan)' },
                { label: 'Confirmed',     value: stats.confirmed, color: 'var(--accent-red)' },
                { label: 'Pending',       value: stats.pending,   color: 'var(--accent-amber)' },
              ].map(s => (
                <div key={s.label} className="card glass">
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: s.color }}>{String(s.value)}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {feedError && <div className="alert-error mb-2" role="alert">⚠ {feedError}</div>}

          {loading ? (
            <div className="spinner" role="status" aria-label="Loading" />
          ) : reports.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '2.5rem' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📡</div>
              <p className="text-muted">No community reports yet. Be the first to submit one.</p>
            </div>
          ) : (
            reports.map(report => {
              const status = variantKey(report.status);
              return (
                <div key={report.id} className="card mt-2" style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '1.4rem' }}>🚨</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, wordBreak: 'break-all' }}>{report.target}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                      {variantKey(report.category)} · risk {String(report.riskScore)}/100 · {formatTime(report.createdAt)}
                    </div>
                    <p style={{ margin: 0, fontSize: '0.88rem' }}>{report.description}</p>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
                      <button
                        className="btn-secondary"
                        style={{ fontSize: '0.78rem', padding: '0.25rem 0.6rem' }}
                        disabled={votingId === report.id}
                        onClick={() => void vote(report.id, true)}
                      >
                        👍 Confirm ({String(report.confirmVotes)})
                      </button>
                      <button
                        className="btn-secondary"
                        style={{ fontSize: '0.78rem', padding: '0.25rem 0.6rem' }}
                        disabled={votingId === report.id}
                        onClick={() => void vote(report.id, false)}
                      >
                        👎 Reject ({String(report.rejectVotes)})
                      </button>
                    </div>
                  </div>
                  <span className={`badge ${statusBadge(status)}`} style={{ fontSize: '0.7rem' }}>{status}</span>
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === 'submit' && (
        <div className="card" style={{ maxWidth: 560 }}>
          <form onSubmit={handleSubmit}>
            <h3 style={{ marginTop: 0 }}>Submit a Community Report</h3>

            {submittedId && (
              <div className="alert-success mb-2">
                ✅ Report stored in the community canister — id <code>{submittedId}</code>
              </div>
            )}
            {submitError && <div className="alert-error mb-2" role="alert">⚠ {submitError}</div>}
            {!isAuthenticated && (
              <div className="alert-error mb-2" role="alert">
                Reports are signed with your Internet Identity principal. Sign in first.
              </div>
            )}

            <div className="mb-2">
              <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Category</label>
              <select
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value as CategoryId }))}
              >
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="mb-2">
              <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Target</label>
              <input
                type="text"
                placeholder="Enter the suspicious value…"
                value={form.target}
                onChange={e => setForm(f => ({ ...f, target: e.target.value }))}
                required
              />
            </div>
            <div className="mb-2">
              <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Description</label>
              <textarea
                rows={3}
                placeholder="Describe the suspicious activity…"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                required
              />
            </div>
            <button
              className="btn-primary"
              type="submit"
              disabled={submitting || !isAuthenticated}
              style={{ width: '100%' }}
            >
              {submitting ? '⏳ Submitting…' : '🚨 Submit Report'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
