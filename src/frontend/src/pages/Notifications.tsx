import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useActorsReady } from '../hooks/useActors';
import { useAuth } from '../hooks/useAuth';
import type { Report } from '../../../declarations/community/index.d.ts';
import type { ThreatEntry } from '../../../declarations/threat_intelligence/index.d.ts';

/**
 * Notifications.
 *
 * Valthoris has no notification canister, so nothing is invented here: the feed
 * is derived from records that really exist on chain —
 *   • the status of the reports the signed-in principal submitted
 *     (`community.getMyReports`)
 *   • the active high/critical indicators published by the threat feed
 *     (`threat_intelligence.listActiveThreats`)
 *
 * When both sources are empty the page says so. Failures from one source never
 * hide the entries produced by the other.
 *
 * The read/unread marker is per-device presentation state (localStorage): it is
 * not application data and losing it only re-highlights an entry.
 */

type NotificationType = 'threat' | 'info' | 'success' | 'warning';

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  /** Nanosecond IC timestamp used for ordering and relative display. */
  timestampNs: bigint;
  source: string;
}

const READ_KEY = 'valthoris.notifications.read.v1';
const THREAT_FEED_LIMIT = 10;

const TYPE_ICON: Record<NotificationType, string> = {
  threat: '🚨', info: 'ℹ️', success: '✅', warning: '⚠',
};
const TYPE_COLOR: Record<NotificationType, string> = {
  threat: 'var(--accent-red)',
  info: 'var(--accent-cyan)',
  success: 'var(--accent-green)',
  warning: 'var(--accent-amber)',
};

function readIds(): Set<string> {
  try {
    const raw = window.localStorage.getItem(READ_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function persistReadIds(ids: Set<string>): void {
  try {
    window.localStorage.setItem(READ_KEY, JSON.stringify([...ids]));
  } catch {
    // Storage unavailable — read markers apply to this session only.
  }
}

function variantKey(value: object): string {
  return Object.keys(value)[0] ?? 'unknown';
}

function relativeTime(timestampNs: bigint): string {
  const ms = Number(timestampNs / BigInt(1_000_000));
  if (!Number.isFinite(ms) || ms <= 0) return 'unknown time';
  const diff = Date.now() - ms;
  const minute = 60_000;
  if (diff < minute) return 'just now';
  if (diff < 60 * minute) return `${Math.floor(diff / minute)} min ago`;
  if (diff < 24 * 60 * minute) return `${Math.floor(diff / (60 * minute))} hr ago`;
  return new Date(ms).toLocaleDateString();
}

function reportNotification(report: Report): Notification {
  const status = variantKey(report.status);
  const category = variantKey(report.category);
  const type: NotificationType =
    status === 'confirmed' ? 'threat'
    : status === 'rejected' ? 'warning'
    : status === 'investigating' ? 'info'
    : 'info';
  return {
    id: `report-${report.id}`,
    type,
    title: `Your ${category} report is ${status}`,
    body: `${report.target} — ${report.confirmVotes} confirm / ${report.rejectVotes} reject votes, risk score ${report.riskScore}.`,
    timestampNs: report.updatedAt,
    source: 'community canister',
  };
}

function threatNotification(entry: ThreatEntry): Notification {
  const severity = variantKey(entry.severity);
  return {
    id: `threat-${entry.id}`,
    type: severity === 'critical' || severity === 'high' ? 'threat' : 'info',
    title: `${severity} ${variantKey(entry.category)} indicator published`,
    body: `${entry.indicator} — ${entry.description}`,
    timestampNs: entry.lastSeen,
    source: 'threat_intelligence canister',
  };
}

export default function Notifications() {
  const { actors, ready } = useActorsReady();
  const { isAuthenticated } = useAuth();

  const [items, setItems] = useState<Notification[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [read, setRead] = useState<Set<string>>(() => readIds());
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    const collected: Notification[] = [];
    const failures: string[] = [];

    if (isAuthenticated) {
      try {
        const reports = await actors.community.getMyReports();
        collected.push(...reports.map(reportNotification));
      } catch (err) {
        failures.push(`community: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    try {
      const threats = await actors.threatIntelligence.listActiveThreats(BigInt(THREAT_FEED_LIMIT));
      collected.push(...threats.map(threatNotification));
    } catch (err) {
      failures.push(`threat_intelligence: ${err instanceof Error ? err.message : String(err)}`);
    }

    collected.sort((a, b) => (a.timestampNs < b.timestampNs ? 1 : a.timestampNs > b.timestampNs ? -1 : 0));
    setItems(collected);
    setErrors(failures);
    setLoading(false);
  }, [actors, isAuthenticated]);

  useEffect(() => {
    if (!ready) return;
    void load();
  }, [ready, load]);

  const markRead = (id: string) => {
    setRead(prev => {
      const next = new Set(prev);
      next.add(id);
      persistReadIds(next);
      return next;
    });
  };

  const markAllRead = () => {
    setRead(prev => {
      const next = new Set(prev);
      items.forEach(item => next.add(item.id));
      persistReadIds(next);
      return next;
    });
  };

  const unreadCount = useMemo(
    () => items.filter(item => !read.has(item.id)).length,
    [items, read],
  );
  const filtered = filter === 'unread' ? items.filter(item => !read.has(item.id)) : items;

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>🔔 Notifications</h1>
        {unreadCount > 0 && <span className="badge badge-red">{unreadCount} new</span>}
        <span className="badge-beta" style={{ marginLeft: 'auto' }}>BETA</span>
      </div>

      <p className="text-muted" style={{ fontSize: '0.82rem' }}>
        Built from your community reports and the active threat feed. Sign in to see updates about
        the reports you submitted.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1.25rem' }}>
        {(['all', 'unread'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              background: filter === f ? 'rgba(0,212,255,0.12)' : 'none',
              border: `1px solid ${filter === f ? 'var(--accent-cyan)' : 'var(--border)'}`,
              color: filter === f ? 'var(--accent-cyan)' : 'var(--text-muted)',
              borderRadius: 6,
              padding: '0.3rem 0.8rem',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            {f === 'all' ? 'All' : `Unread (${unreadCount})`}
          </button>
        ))}
        <button
          onClick={() => void load()}
          className="btn-secondary"
          style={{ marginLeft: 'auto', fontSize: '0.82rem', padding: '0.3rem 0.8rem' }}
          disabled={loading}
        >
          {loading ? 'Loading…' : '↻ Refresh'}
        </button>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="btn-secondary"
            style={{ fontSize: '0.82rem', padding: '0.3rem 0.8rem' }}
          >
            Mark all read
          </button>
        )}
      </div>

      {errors.map(err => (
        <div className="alert-error" key={err} style={{ marginBottom: '0.5rem', maxWidth: 700 }}>
          {err}
        </div>
      ))}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: 700 }}>
        {loading ? (
          <div className="spinner" />
        ) : filtered.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            No notifications
          </div>
        ) : (
          filtered.map(n => {
            const isRead = read.has(n.id);
            return (
              <div
                key={n.id}
                className="card animate-fade-in"
                onClick={() => markRead(n.id)}
                style={{
                  display: 'flex',
                  gap: '0.75rem',
                  cursor: 'pointer',
                  opacity: isRead ? 0.65 : 1,
                  borderLeft: isRead ? '3px solid var(--border)' : `3px solid ${TYPE_COLOR[n.type]}`,
                }}
              >
                <span style={{ fontSize: '1.3rem', flexShrink: 0 }}>{TYPE_ICON[n.type]}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: isRead ? 400 : 700, fontSize: '0.92rem', marginBottom: 2 }}>
                    {n.title}
                  </div>
                  <div style={{ fontSize: '0.83rem', color: 'var(--text-muted)' }}>{n.body}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    Source: {n.source}
                  </div>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                  {relativeTime(n.timestampNs)}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
