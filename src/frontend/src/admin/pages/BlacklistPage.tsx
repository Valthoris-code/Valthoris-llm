/**
 * /admin/blacklist — Blacklist.
 *
 * Three things in one section: the form that adds a single entry, the listing
 * filtered by category, and the bulk import that loads the operator's own
 * CSV / JSON file.
 *
 * The file is parsed *here* only so the operator sees what is about to be sent
 * and so an unusable line is reported instead of silently dropped. The backend
 * validates every row again — the browser is never the thing that decides what
 * enters the database.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BLACKLIST_CATEGORIES,
  BLACKLIST_SEVERITIES,
  SEVERITY_LABELS,
  TARGET_LABELS,
  addBlacklistEntry,
  fetchBlacklist,
  importBlacklist,
} from '../adminApi';
import type { BlacklistImportResult, BlacklistRow } from '../adminApi';
import { AdminInvalidInput } from '../adminApi';
import { ADMIN_GENERIC_ERROR } from '../adminClient';
import { useAdminAuth } from '../AdminAuthContext';
import { EmptyState, Pager, SeverityBadge, formatDate } from './commandCenterUi';

const PAGE_SIZE = 25;

/** Largest batch accepted by `admin-api` in one call. */
const MAX_IMPORT_ROWS = 2000;

/** Category labels: the same vocabulary the report targets use. */
const CATEGORY_LABEL: Record<string, string> = {
  ...TARGET_LABELS,
  DOMAIN: 'Domínio',
};

interface ParsedEntry {
  category: string;
  value: string;
  reason?: string;
  severity?: string;
}

interface ParseResult {
  entries: ParsedEntry[];
  /** Lines that carried no usable category/value pair. */
  rejected: number;
}

const VALID_CATEGORIES = new Set<string>(BLACKLIST_CATEGORIES);
const VALID_SEVERITIES = new Set<string>(BLACKLIST_SEVERITIES);

function normaliseEntry(raw: Record<string, unknown>): ParsedEntry | null {
  const read = (...names: string[]): string => {
    for (const name of names) {
      const value = raw[name];
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number') return String(value);
    }
    return '';
  };

  const value = read('value', 'valor', 'entry', 'indicator');
  if (!value) return null;

  const category = read('category', 'categoria', 'type', 'tipo').toUpperCase();
  if (!VALID_CATEGORIES.has(category)) return null;

  const severity = read('severity', 'gravidade').toUpperCase();
  const reason = read('reason', 'motivo', 'description', 'descricao', 'descrição');

  return {
    category,
    value,
    ...(reason ? { reason } : {}),
    ...(VALID_SEVERITIES.has(severity) ? { severity } : {}),
  };
}

/** Splits one CSV line, honouring double quotes and escaped quotes. */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted) {
      if (character === '"') {
        if (line[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',' || character === ';') {
      cells.push(cell);
      cell = '';
    } else {
      cell += character;
    }
  }
  cells.push(cell);
  return cells.map(text => text.trim());
}

/**
 * Reads a CSV or JSON file into entries.
 *
 * CSV needs a header row naming at least a category and a value column; JSON
 * accepts an array of objects, or an object with an `entries` array.
 */
export function parseImportFile(name: string, text: string): ParseResult {
  const trimmed = text.trim();
  if (!trimmed) return { entries: [], rejected: 0 };

  const looksJson =
    name.toLowerCase().endsWith('.json') || trimmed.startsWith('[') || trimmed.startsWith('{');

  if (looksJson) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return { entries: [], rejected: 0 };
    }
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { entries?: unknown })?.entries)
        ? ((parsed as { entries: unknown[] }).entries)
        : [];
    const entries: ParsedEntry[] = [];
    let rejected = 0;
    for (const item of list) {
      const entry =
        item && typeof item === 'object'
          ? normaliseEntry(item as Record<string, unknown>)
          : null;
      if (entry) entries.push(entry);
      else rejected += 1;
    }
    return { entries, rejected };
  }

  const lines = trimmed.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return { entries: [], rejected: Math.max(0, lines.length) };

  const header = splitCsvLine(lines[0]).map(cell => cell.toLowerCase());
  const entries: ParsedEntry[] = [];
  let rejected = 0;
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const row: Record<string, unknown> = {};
    header.forEach((key, index) => {
      row[key] = cells[index] ?? '';
    });
    const entry = normaliseEntry(row);
    if (entry) entries.push(entry);
    else rejected += 1;
  }
  return { entries, rejected };
}

export default function BlacklistPage() {
  const { can } = useAdminAuth();
  const mayWrite = can('blacklist.write');

  const [rows, setRows] = useState<BlacklistRow[]>([]);
  const [total, setTotal] = useState(0);
  const [byCategory, setByCategory] = useState<Record<string, number>>({});
  const [page, setPage] = useState(0);
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [pendingSearch, setPendingSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({ category: 'DOMAIN', value: '', reason: '', severity: 'MEDIUM' });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNote, setFormNote] = useState<string | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<BlacklistImportResult | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    fetchBlacklist({
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      search: search || undefined,
      category: category || undefined,
    })
      .then(data => {
        if (cancelled) return;
        setRows(data.items);
        setTotal(data.total);
        setByCategory(data.byCategory ?? {});
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
  }, [page, search, category]);

  useEffect(() => load(), [load]);

  /**
   * The per-category counts are the whole table, not the filtered page, so the
   * "todas" chip has to add them up rather than reuse the filtered total.
   */
  const allCount = Object.values(byCategory).reduce((sum, count) => sum + count, 0);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setFormNote(null);
    if (!form.value.trim()) {
      setFormError('Indique o valor a colocar na blacklist.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await addBlacklistEntry({
        category: form.category,
        value: form.value.trim(),
        reason: form.reason.trim() || undefined,
        severity: form.severity,
      });
      setForm(current => ({ ...current, value: '', reason: '' }));
      setFormNote(result.updated ? 'Entrada já existia e foi atualizada.' : 'Entrada adicionada.');
      setPage(0);
      load();
    } catch (failure) {
      setFormError(failure instanceof AdminInvalidInput ? failure.message : ADMIN_GENERIC_ERROR);
    } finally {
      setSubmitting(false);
    }
  };

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setImportResult(null);
    setImporting(true);
    try {
      const parsed = parseImportFile(file.name, await file.text());
      if (parsed.entries.length === 0) {
        setImportError(
          'Não foi possível ler nenhuma entrada válida. O ficheiro precisa das colunas ' +
            '"category" e "value" (CSV com cabeçalho) ou de um array JSON com esses campos.',
        );
        return;
      }
      if (parsed.entries.length > MAX_IMPORT_ROWS) {
        setImportError(
          `O ficheiro tem ${parsed.entries.length} entradas; o máximo por importação é ${MAX_IMPORT_ROWS}. ` +
            'Divida o ficheiro e repita.',
        );
        return;
      }
      const result = await importBlacklist(parsed.entries);
      setImportResult({ ...result, rejected: parsed.rejected });
      setPage(0);
      load();
    } catch (failure) {
      setImportError(
        failure instanceof AdminInvalidInput ? failure.message : ADMIN_GENERIC_ERROR,
      );
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <>
      <h1 className="vadmin-page-title">Blacklist</h1>
      <p className="vadmin-page-sub">
        IP, telefone, email, cripto, IBAN, domínio e outros, guardados em{' '}
        <span className="vadmin-secret">public.blacklist_entries</span>.
      </p>

      {mayWrite && (
        <>
          <div className="vadmin-card" style={{ marginBottom: '1rem' }}>
            <div className="vadmin-stat-label">Adicionar à Blacklist</div>
            <form onSubmit={submit} style={{ marginTop: '0.8rem' }}>
              <div className="vadmin-form-grid">
                <div className="vadmin-field">
                  <label className="vadmin-label" htmlFor="bl-category">Categoria</label>
                  <select
                    id="bl-category"
                    className="vadmin-select"
                    value={form.category}
                    onChange={e => setForm(c => ({ ...c, category: e.target.value }))}
                  >
                    {BLACKLIST_CATEGORIES.map(value => (
                      <option key={value} value={value}>{CATEGORY_LABEL[value] ?? value}</option>
                    ))}
                  </select>
                </div>
                <div className="vadmin-field">
                  <label className="vadmin-label" htmlFor="bl-value">Valor</label>
                  <input
                    id="bl-value"
                    className="vadmin-input"
                    value={form.value}
                    maxLength={500}
                    required
                    onChange={e => setForm(c => ({ ...c, value: e.target.value }))}
                  />
                </div>
                <div className="vadmin-field">
                  <label className="vadmin-label" htmlFor="bl-severity">Gravidade</label>
                  <select
                    id="bl-severity"
                    className="vadmin-select"
                    value={form.severity}
                    onChange={e => setForm(c => ({ ...c, severity: e.target.value }))}
                  >
                    {BLACKLIST_SEVERITIES.map(value => (
                      <option key={value} value={value}>{SEVERITY_LABELS[value] ?? value}</option>
                    ))}
                  </select>
                </div>
                <div className="vadmin-field">
                  <label className="vadmin-label" htmlFor="bl-reason">Motivo (opcional)</label>
                  <input
                    id="bl-reason"
                    className="vadmin-input"
                    value={form.reason}
                    maxLength={500}
                    onChange={e => setForm(c => ({ ...c, reason: e.target.value }))}
                  />
                </div>
              </div>

              {formError && <div className="vadmin-alert" role="alert">{formError}</div>}
              {formNote && <div className="vadmin-note" role="status">{formNote}</div>}

              <button className="vadmin-btn" type="submit" disabled={submitting}>
                {submitting ? 'A adicionar…' : 'Adicionar à Blacklist'}
              </button>
            </form>
          </div>

          <div className="vadmin-card" style={{ marginBottom: '1rem' }}>
            <div className="vadmin-stat-label">Importação em lote (CSV / JSON)</div>
            <p className="vadmin-stat-hint" style={{ marginTop: '0.6rem' }}>
              CSV com cabeçalho <span className="vadmin-secret">category,value,reason,severity</span>{' '}
              ou JSON com um array de objetos com esses campos. Uma entrada que já exista é
              atualizada, não duplicada. Máximo de {MAX_IMPORT_ROWS} entradas por ficheiro.
            </p>
            <input
              ref={fileInput}
              className="vadmin-input"
              style={{ marginTop: '0.6rem' }}
              type="file"
              accept=".csv,.json,text/csv,application/json"
              disabled={importing}
              onChange={e => { void onFile(e); }}
              aria-label="Ficheiro CSV ou JSON para importar"
            />
            {importing && <div className="vadmin-note">A importar…</div>}
            {importError && <div className="vadmin-alert" role="alert">{importError}</div>}
            {importResult && (
              <div className="vadmin-note" role="status">
                {importResult.processed} entradas processadas · {importResult.inserted} novas ·{' '}
                {importResult.updated} atualizadas · {importResult.skipped} ignoradas
                {importResult.rejected > 0 && ` · ${importResult.rejected} linhas ilegíveis`}
              </div>
            )}
          </div>
        </>
      )}

      <div className="vadmin-card" style={{ marginBottom: '1rem' }}>
        <div className="vadmin-stat-label">Por categoria</div>
        <div className="vadmin-chips">
          <button
            type="button"
            className={'vadmin-chip' + (category === '' ? ' active' : '')}
            onClick={() => { setPage(0); setCategory(''); }}
          >
            Todas · {allCount.toLocaleString('pt-PT')}
          </button>
          {BLACKLIST_CATEGORIES.map(value => (
            <button
              key={value}
              type="button"
              className={'vadmin-chip' + (category === value ? ' active' : '')}
              onClick={() => { setPage(0); setCategory(value); }}
            >
              {CATEGORY_LABEL[value] ?? value} · {(byCategory[value] ?? 0).toLocaleString('pt-PT')}
            </button>
          ))}
        </div>
      </div>

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
          placeholder="Pesquisar por valor ou motivo"
          value={pendingSearch}
          maxLength={120}
          onChange={e => setPendingSearch(e.target.value)}
          aria-label="Pesquisar na blacklist"
        />
        <button className="vadmin-btn" type="submit">Filtrar</button>
      </form>

      {error && <div className="vadmin-alert" role="alert">{error}</div>}

      {rows.length === 0 && !loading ? (
        <EmptyState>
          {search || category
            ? 'Sem entradas para os filtros aplicados.'
            : 'A blacklist ainda não tem entradas. Adicione uma, ou importe o seu ficheiro.'}
        </EmptyState>
      ) : (
        <div className="vadmin-card vadmin-table-wrap">
          <table className="vadmin-table">
            <thead>
              <tr>
                <th>Categoria</th>
                <th>Valor</th>
                <th>Gravidade</th>
                <th>Motivo</th>
                <th>Estado</th>
                <th>Adicionada</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id}>
                  <td>{CATEGORY_LABEL[row.category] ?? row.category}</td>
                  <td className="vadmin-secret">{row.value}</td>
                  <td>
                    <SeverityBadge
                      severity={row.severity}
                      label={SEVERITY_LABELS[row.severity] ?? row.severity}
                    />
                  </td>
                  <td>
                    {row.reason ?? '—'}
                    {row.source && <div className="vadmin-stat-hint">Origem: {row.source}</div>}
                  </td>
                  <td>
                    <span className={'vadmin-badge ' + (row.active ? 'danger' : '')}>
                      {row.active ? 'Ativa' : 'Inativa'}
                    </span>
                    {row.expires_at && (
                      <div className="vadmin-stat-hint">Expira em {formatDate(row.expires_at)}</div>
                    )}
                  </td>
                  <td>{formatDate(row.created_at)}</td>
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
          noun="entradas"
        />
      )}
    </>
  );
}
