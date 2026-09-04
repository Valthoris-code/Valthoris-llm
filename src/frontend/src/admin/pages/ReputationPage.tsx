/**
 * /admin/reputation — Reputação de Entidades.
 *
 * A score between 0 and 100 per entity, with the full history of every change:
 * who changed it, from what to what and why. The history is written by the
 * database itself, so a score can never move without leaving a trace.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  LEVEL_LABELS,
  REPUTATION_LEVELS,
  TARGET_LABELS,
  TARGET_TYPES,
  fetchReputation,
  setReputation,
} from '../adminApi';
import type { ReputationRow } from '../adminApi';
import { AdminInvalidInput } from '../adminApi';
import { ADMIN_GENERIC_ERROR } from '../adminClient';
import { useAdminAuth } from '../AdminAuthContext';
import { EmptyState, Pager, formatDate } from './commandCenterUi';

const PAGE_SIZE = 20;

const LEVEL_BADGE: Record<string, string> = {
  TRUSTED: 'ok',
  NEUTRAL: '',
  SUSPICIOUS: 'warn',
  DANGEROUS: 'danger',
  UNKNOWN: '',
};

export default function ReputationPage() {
  const { can } = useAdminAuth();
  const mayWrite = can('reputation.write');

  const [rows, setRows] = useState<ReputationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [entityType, setEntityType] = useState('');
  const [search, setSearch] = useState('');
  const [pendingSearch, setPendingSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    entityType: 'DOMAIN',
    entityValue: '',
    score: '50',
    level: 'NEUTRAL',
    reason: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNote, setFormNote] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    fetchReputation({
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      search: search || undefined,
      entityType: entityType || undefined,
    })
      .then(data => {
        if (cancelled) return;
        setRows(data.items);
        setTotal(data.total);
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
  }, [page, search, entityType]);

  useEffect(() => load(), [load]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setFormNote(null);

    const score = Number(form.score);
    if (!form.entityValue.trim()) {
      setFormError('Indique a entidade.');
      return;
    }
    if (!Number.isInteger(score) || score < 0 || score > 100) {
      setFormError('O score tem de ser um inteiro entre 0 e 100.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await setReputation({
        entityType: form.entityType,
        entityValue: form.entityValue.trim(),
        score,
        level: form.level,
        reason: form.reason.trim() || undefined,
      });
      setForm(current => ({ ...current, entityValue: '', reason: '' }));
      setFormNote(
        result.created
          ? 'Entidade avaliada pela primeira vez.'
          : 'Score atualizado; a alteração ficou no histórico.',
      );
      setPage(0);
      load();
    } catch (failure) {
      setFormError(failure instanceof AdminInvalidInput ? failure.message : ADMIN_GENERIC_ERROR);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <h1 className="vadmin-page-title">Reputação de Entidades</h1>
      <p className="vadmin-page-sub">
        Score 0–100 por entidade e histórico de cada alteração, em{' '}
        <span className="vadmin-secret">public.entity_reputation</span>.
      </p>

      {mayWrite && (
        <div className="vadmin-card" style={{ marginBottom: '1rem' }}>
          <div className="vadmin-stat-label">Avaliar entidade</div>
          <form onSubmit={submit} style={{ marginTop: '0.8rem' }}>
            <div className="vadmin-form-grid">
              <div className="vadmin-field">
                <label className="vadmin-label" htmlFor="rep-type">Tipo</label>
                <select
                  id="rep-type"
                  className="vadmin-select"
                  value={form.entityType}
                  onChange={e => setForm(c => ({ ...c, entityType: e.target.value }))}
                >
                  {TARGET_TYPES.map(value => (
                    <option key={value} value={value}>{TARGET_LABELS[value] ?? value}</option>
                  ))}
                </select>
              </div>
              <div className="vadmin-field">
                <label className="vadmin-label" htmlFor="rep-value">Entidade</label>
                <input
                  id="rep-value"
                  className="vadmin-input"
                  value={form.entityValue}
                  maxLength={500}
                  required
                  onChange={e => setForm(c => ({ ...c, entityValue: e.target.value }))}
                />
              </div>
              <div className="vadmin-field">
                <label className="vadmin-label" htmlFor="rep-score">Score (0–100)</label>
                <input
                  id="rep-score"
                  className="vadmin-input"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={form.score}
                  onChange={e => setForm(c => ({ ...c, score: e.target.value }))}
                />
              </div>
              <div className="vadmin-field">
                <label className="vadmin-label" htmlFor="rep-level">Nível</label>
                <select
                  id="rep-level"
                  className="vadmin-select"
                  value={form.level}
                  onChange={e => setForm(c => ({ ...c, level: e.target.value }))}
                >
                  {REPUTATION_LEVELS.map(value => (
                    <option key={value} value={value}>{LEVEL_LABELS[value] ?? value}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="vadmin-field">
              <label className="vadmin-label" htmlFor="rep-reason">Motivo (opcional)</label>
              <input
                id="rep-reason"
                className="vadmin-input"
                value={form.reason}
                maxLength={500}
                onChange={e => setForm(c => ({ ...c, reason: e.target.value }))}
              />
            </div>

            {formError && <div className="vadmin-alert" role="alert">{formError}</div>}
            {formNote && <div className="vadmin-note" role="status">{formNote}</div>}

            <button className="vadmin-btn" type="submit" disabled={submitting}>
              {submitting ? 'A guardar…' : 'Guardar score'}
            </button>
          </form>
        </div>
      )}

      <form
        className="vadmin-card"
        style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1rem' }}
        onSubmit={event => {
          event.preventDefault();
          setPage(0);
          setSearch(pendingSearch.trim());
        }}
      >
        <input
          className="vadmin-input"
          style={{ flex: '1 1 220px' }}
          placeholder="Pesquisar entidade"
          value={pendingSearch}
          maxLength={120}
          onChange={e => setPendingSearch(e.target.value)}
          aria-label="Pesquisar entidades"
        />
        <select
          className="vadmin-select"
          style={{ flex: '0 0 160px' }}
          value={entityType}
          aria-label="Filtrar por tipo de entidade"
          onChange={e => {
            setPage(0);
            setEntityType(e.target.value);
          }}
        >
          <option value="">Todos os tipos</option>
          {TARGET_TYPES.map(value => (
            <option key={value} value={value}>{TARGET_LABELS[value] ?? value}</option>
          ))}
        </select>
        <button className="vadmin-btn" type="submit">Filtrar</button>
      </form>

      {error && <div className="vadmin-alert" role="alert">{error}</div>}

      {rows.length === 0 && !loading ? (
        <EmptyState>
          {search || entityType
            ? 'Sem entidades para os filtros aplicados.'
            : 'Ainda não foi avaliada nenhuma entidade.'}
        </EmptyState>
      ) : (
        <div className="vadmin-card vadmin-table-wrap">
          <table className="vadmin-table">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Entidade</th>
                <th>Score</th>
                <th>Nível</th>
                <th>Atualizada</th>
                <th>Histórico</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <React.Fragment key={row.id}>
                  <tr>
                    <td>{TARGET_LABELS[row.entity_type] ?? row.entity_type}</td>
                    <td className="vadmin-secret">{row.entity_value}</td>
                    <td>{row.score}</td>
                    <td>
                      <span className={'vadmin-badge ' + (LEVEL_BADGE[row.level] ?? '')}>
                        {LEVEL_LABELS[row.level] ?? row.level}
                      </span>
                    </td>
                    <td>{formatDate(row.updated_at)}</td>
                    <td>
                      <button
                        className="vadmin-btn-ghost"
                        type="button"
                        aria-expanded={expanded === row.id}
                        onClick={() => setExpanded(current => (current === row.id ? null : row.id))}
                      >
                        {row.history.length} alteraç{row.history.length === 1 ? 'ão' : 'ões'}
                      </button>
                    </td>
                  </tr>
                  {expanded === row.id && (
                    <tr>
                      <td colSpan={6}>
                        {row.history.length === 0 ? (
                          <span style={{ color: 'var(--vadmin-muted)' }}>
                            Sem alterações registadas.
                          </span>
                        ) : (
                          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                            {row.history.map((entry, index) => (
                              <li key={`${row.id}-${entry.occurred_at}-${index}`}>
                                {formatDate(entry.occurred_at)} ·{' '}
                                {entry.previous_score === null
                                  ? `score inicial ${entry.new_score}`
                                  : `${entry.previous_score} → ${entry.new_score}`}{' '}
                                ({LEVEL_LABELS[entry.new_level] ?? entry.new_level})
                                {entry.actor_admin_email ? ` · ${entry.actor_admin_email}` : ''}
                                {entry.reason ? ` · ${entry.reason}` : ''}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > 0 && (
        <Pager
          page={page}
          total={total}
          pageSize={PAGE_SIZE}
          loading={loading}
          onChange={setPage}
          noun="entidades"
        />
      )}
    </>
  );
}
