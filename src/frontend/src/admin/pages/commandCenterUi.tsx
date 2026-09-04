/**
 * Small pieces shared by the Command Center sections.
 *
 * They exist so that every section states the same things in the same way: an
 * empty section says it is empty, a number that does not exist is shown as
 * "sem dados" rather than as a zero, and a failure shows the one generic
 * message the administration is allowed to show.
 */

import React from 'react';

/** A count. `null` means the table is not present on this database. */
export function Count({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) {
    return <span style={{ color: 'var(--vadmin-muted)', fontSize: '1rem' }}>sem dados</span>;
  }
  return <>{value.toLocaleString('pt-PT')}</>;
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="vadmin-card">
      <div className="vadmin-stat-label">{label}</div>
      <div className="vadmin-stat-value">{value}</div>
      {hint && <div className="vadmin-stat-hint">{hint}</div>}
    </div>
  );
}

/**
 * What a section shows before it holds anything. Deliberately explicit: no
 * placeholder rows, no sample data, no invented totals.
 */
export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="vadmin-card" style={{ color: 'var(--vadmin-muted)', textAlign: 'center' }}>
      {children}
    </div>
  );
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-PT');
}

/** Pagination shared by the listing sections. */
export function Pager({
  page,
  total,
  pageSize,
  loading,
  onChange,
  noun,
}: {
  page: number;
  total: number;
  pageSize: number;
  loading: boolean;
  onChange: (page: number) => void;
  noun: string;
}) {
  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        marginTop: '0.9rem',
        color: 'var(--vadmin-muted)',
        fontSize: '0.8rem',
      }}
    >
      <button
        className="vadmin-btn-ghost"
        type="button"
        disabled={page === 0 || loading}
        onClick={() => onChange(Math.max(0, page - 1))}
      >
        Anterior
      </button>
      <span>
        Página {page + 1} de {lastPage + 1} · {total.toLocaleString('pt-PT')} {noun}
      </span>
      <button
        className="vadmin-btn-ghost"
        type="button"
        disabled={page >= lastPage || loading}
        onClick={() => onChange(page + 1)}
      >
        Seguinte
      </button>
    </div>
  );
}

const SEVERITY_BADGE: Record<string, string> = {
  CRITICAL: 'danger',
  HIGH: 'danger',
  MEDIUM: 'warn',
  LOW: '',
  UNKNOWN: '',
};

export function SeverityBadge({ severity, label }: { severity: string; label?: string }) {
  return (
    <span className={'vadmin-badge ' + (SEVERITY_BADGE[severity] ?? '')}>
      {label ?? severity}
    </span>
  );
}
