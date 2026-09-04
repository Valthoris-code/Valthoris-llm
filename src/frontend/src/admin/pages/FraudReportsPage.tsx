/**
 * /admin/fraud-reports — Denúncias.
 *
 * Two halves of the same section: the form that files a report and the list
 * that reads them back. Both talk to `public.fraud_reports` in this project's
 * Supabase through `admin-api`; nothing here is fed by an external system, and
 * an empty register is shown as empty.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  CATEGORY_LABELS,
  REPORT_CATEGORIES,
  REPORT_SEVERITIES,
  REPORT_STATUSES,
  SEVERITY_LABELS,
  STATUS_LABELS,
  TARGET_LABELS,
  TARGET_TYPES,
  createFraudReport,
  fetchFraudReports,
} from '../adminApi';
import type { FraudReportRow } from '../adminApi';
import { AdminInvalidInput } from '../adminApi';
import { ADMIN_GENERIC_ERROR } from '../adminClient';
import { useAdminAuth } from '../AdminAuthContext';
import { EmptyState, Pager, SeverityBadge, formatDate } from './commandCenterUi';

const PAGE_SIZE = 25;

const STATUS_BADGE: Record<string, string> = {
  NEW: '',
  TRIAGE: 'warn',
  CONFIRMED: 'danger',
  REJECTED: 'ok',
};

interface FormState {
  category: string;
  targetType: string;
  targetValue: string;
  description: string;
  severity: string;
  country: string;
  city: string;
  latitude: string;
  longitude: string;
}

const EMPTY_FORM: FormState = {
  category: 'PHISHING',
  targetType: 'URL',
  targetValue: '',
  description: '',
  severity: 'MEDIUM',
  country: '',
  city: '',
  latitude: '',
  longitude: '',
};

/**
 * Turns the two coordinate fields into a pair or into nothing.
 *
 * A half-filled location cannot be plotted, so it is refused here as well as in
 * the database, instead of silently becoming a point at latitude zero.
 */
function readCoordinates(form: FormState):
  | { ok: true; latitude: number | null; longitude: number | null }
  | { ok: false; message: string } {
  const lat = form.latitude.trim();
  const lon = form.longitude.trim();
  if (!lat && !lon) return { ok: true, latitude: null, longitude: null };
  if (!lat || !lon) {
    return { ok: false, message: 'Indique latitude e longitude, ou deixe ambas em branco.' };
  }
  const latitude = Number(lat.replace(',', '.'));
  const longitude = Number(lon.replace(',', '.'));
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return { ok: false, message: 'A latitude tem de estar entre -90 e 90.' };
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return { ok: false, message: 'A longitude tem de estar entre -180 e 180.' };
  }
  return { ok: true, latitude, longitude };
}

export default function FraudReportsPage() {
  const { can } = useAdminAuth();
  const mayWrite = can('reports.write');

  const [rows, setRows] = useState<FraudReportRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [pendingSearch, setPendingSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    fetchFraudReports({
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      search: search || undefined,
      category: category || undefined,
      status: status || undefined,
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
  }, [page, search, category, status]);

  useEffect(() => load(), [load]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setSubmitted(null);

    if (!form.targetValue.trim()) {
      setFormError('Indique o alvo da denúncia.');
      return;
    }
    const coordinates = readCoordinates(form);
    if (!coordinates.ok) {
      setFormError(coordinates.message);
      return;
    }

    setSubmitting(true);
    try {
      await createFraudReport({
        category: form.category,
        targetType: form.targetType,
        targetValue: form.targetValue.trim(),
        description: form.description.trim() || undefined,
        severity: form.severity,
        country: form.country.trim() || undefined,
        city: form.city.trim() || undefined,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
      });
      setForm(EMPTY_FORM);
      setSubmitted('Denúncia registada.');
      setPage(0);
      load();
    } catch (failure) {
      setFormError(
        failure instanceof AdminInvalidInput ? failure.message : ADMIN_GENERIC_ERROR,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const field = (key: keyof FormState) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => setForm(current => ({ ...current, [key]: event.target.value }));

  return (
    <>
      <h1 className="vadmin-page-title">Denúncias</h1>
      <p className="vadmin-page-sub">
        Registo de denúncias de fraude desta plataforma, guardado em{' '}
        <span className="vadmin-secret">public.fraud_reports</span>.
      </p>

      {mayWrite && (
        <div className="vadmin-card" style={{ marginBottom: '1rem' }}>
          <button
            className="vadmin-btn"
            type="button"
            onClick={() => setShowForm(open => !open)}
            aria-expanded={showForm}
          >
            {showForm ? 'Fechar formulário' : 'Submeter denúncia'}
          </button>

          {showForm && (
            <form onSubmit={submit} style={{ marginTop: '1rem' }}>
              <div className="vadmin-form-grid">
                <div className="vadmin-field">
                  <label className="vadmin-label" htmlFor="report-category">Categoria</label>
                  <select
                    id="report-category"
                    className="vadmin-select"
                    value={form.category}
                    onChange={field('category')}
                  >
                    {REPORT_CATEGORIES.map(value => (
                      <option key={value} value={value}>{CATEGORY_LABELS[value] ?? value}</option>
                    ))}
                  </select>
                </div>
                <div className="vadmin-field">
                  <label className="vadmin-label" htmlFor="report-target-type">Tipo de alvo</label>
                  <select
                    id="report-target-type"
                    className="vadmin-select"
                    value={form.targetType}
                    onChange={field('targetType')}
                  >
                    {TARGET_TYPES.map(value => (
                      <option key={value} value={value}>{TARGET_LABELS[value] ?? value}</option>
                    ))}
                  </select>
                </div>
                <div className="vadmin-field">
                  <label className="vadmin-label" htmlFor="report-target">Alvo</label>
                  <input
                    id="report-target"
                    className="vadmin-input"
                    value={form.targetValue}
                    maxLength={500}
                    required
                    onChange={field('targetValue')}
                    placeholder="Número, endereço, URL, carteira…"
                  />
                </div>
                <div className="vadmin-field">
                  <label className="vadmin-label" htmlFor="report-severity">Gravidade</label>
                  <select
                    id="report-severity"
                    className="vadmin-select"
                    value={form.severity}
                    onChange={field('severity')}
                  >
                    {REPORT_SEVERITIES.map(value => (
                      <option key={value} value={value}>{SEVERITY_LABELS[value] ?? value}</option>
                    ))}
                  </select>
                </div>
                <div className="vadmin-field">
                  <label className="vadmin-label" htmlFor="report-country">País (opcional)</label>
                  <input
                    id="report-country"
                    className="vadmin-input"
                    value={form.country}
                    maxLength={80}
                    onChange={field('country')}
                  />
                </div>
                <div className="vadmin-field">
                  <label className="vadmin-label" htmlFor="report-city">Localidade (opcional)</label>
                  <input
                    id="report-city"
                    className="vadmin-input"
                    value={form.city}
                    maxLength={120}
                    onChange={field('city')}
                  />
                </div>
                <div className="vadmin-field">
                  <label className="vadmin-label" htmlFor="report-lat">Latitude (opcional)</label>
                  <input
                    id="report-lat"
                    className="vadmin-input"
                    value={form.latitude}
                    maxLength={24}
                    inputMode="decimal"
                    onChange={field('latitude')}
                    placeholder="38.7223"
                  />
                </div>
                <div className="vadmin-field">
                  <label className="vadmin-label" htmlFor="report-lon">Longitude (opcional)</label>
                  <input
                    id="report-lon"
                    className="vadmin-input"
                    value={form.longitude}
                    maxLength={24}
                    inputMode="decimal"
                    onChange={field('longitude')}
                    placeholder="-9.1393"
                  />
                </div>
              </div>

              <div className="vadmin-field">
                <label className="vadmin-label" htmlFor="report-description">Descrição (opcional)</label>
                <textarea
                  id="report-description"
                  className="vadmin-input"
                  rows={3}
                  maxLength={4000}
                  value={form.description}
                  onChange={field('description')}
                />
              </div>

              {formError && <div className="vadmin-alert" role="alert">{formError}</div>}
              {submitted && <div className="vadmin-note" role="status">{submitted}</div>}

              <button className="vadmin-btn" type="submit" disabled={submitting}>
                {submitting ? 'A registar…' : 'Registar denúncia'}
              </button>
              <p className="vadmin-stat-hint" style={{ marginTop: '0.6rem' }}>
                A localização é opcional. Sem coordenadas, a denúncia é registada na
                mesma e simplesmente não aparece no mapa.
              </p>
            </form>
          )}
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
          placeholder="Pesquisar por alvo, localidade ou descrição"
          value={pendingSearch}
          maxLength={120}
          onChange={e => setPendingSearch(e.target.value)}
          aria-label="Pesquisar denúncias"
        />
        <select
          className="vadmin-select"
          style={{ flex: '0 0 190px' }}
          value={category}
          aria-label="Filtrar por categoria"
          onChange={e => {
            setPage(0);
            setCategory(e.target.value);
          }}
        >
          <option value="">Todas as categorias</option>
          {REPORT_CATEGORIES.map(value => (
            <option key={value} value={value}>{CATEGORY_LABELS[value] ?? value}</option>
          ))}
        </select>
        <select
          className="vadmin-select"
          style={{ flex: '0 0 160px' }}
          value={status}
          aria-label="Filtrar por estado"
          onChange={e => {
            setPage(0);
            setStatus(e.target.value);
          }}
        >
          <option value="">Todos os estados</option>
          {REPORT_STATUSES.map(value => (
            <option key={value} value={value}>{STATUS_LABELS[value] ?? value}</option>
          ))}
        </select>
        <button className="vadmin-btn" type="submit">Filtrar</button>
      </form>

      {error && <div className="vadmin-alert" role="alert">{error}</div>}

      {rows.length === 0 && !loading ? (
        <EmptyState>
          {search || category || status
            ? 'Sem denúncias para os filtros aplicados.'
            : 'Ainda não existe nenhuma denúncia registada.'}
        </EmptyState>
      ) : (
        <div className="vadmin-card vadmin-table-wrap">
          <table className="vadmin-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Categoria</th>
                <th>Alvo</th>
                <th>Gravidade</th>
                <th>Estado</th>
                <th>Local</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id}>
                  <td>{formatDate(row.created_at)}</td>
                  <td>{CATEGORY_LABELS[row.category] ?? row.category}</td>
                  <td>
                    <div className="vadmin-secret">{row.target_value}</div>
                    <div className="vadmin-stat-hint">
                      {TARGET_LABELS[row.target_type] ?? row.target_type}
                    </div>
                    {row.description && <div className="vadmin-stat-hint">{row.description}</div>}
                  </td>
                  <td>
                    <SeverityBadge
                      severity={row.severity}
                      label={SEVERITY_LABELS[row.severity] ?? row.severity}
                    />
                  </td>
                  <td>
                    <span className={'vadmin-badge ' + (STATUS_BADGE[row.status] ?? '')}>
                      {STATUS_LABELS[row.status] ?? row.status}
                    </span>
                  </td>
                  <td>
                    {[row.city, row.country].filter(Boolean).join(', ') || '—'}
                    {row.latitude !== null && row.longitude !== null && (
                      <div className="vadmin-stat-hint">
                        {row.latitude.toFixed(4)}, {row.longitude.toFixed(4)}
                      </div>
                    )}
                  </td>
                </tr>
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
          noun="denúncias"
        />
      )}
    </>
  );
}
