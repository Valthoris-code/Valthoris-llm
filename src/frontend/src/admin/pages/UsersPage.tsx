/**
 * /admin/users — Gestão de Admins e Utilizadores.
 *
 * The administrators register (`governance.admins` / `governance.admin_roles`)
 * next to the platform accounts (`auth.users`). Only the state needed to
 * administer an account is shown: no bulk personal data, no password material,
 * no session tokens.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchPlatformUsers } from '../adminApi';
import type { AdministratorRow, PlatformUserRow, PlatformUsersResult } from '../adminApi';
import { ADMIN_GENERIC_ERROR } from '../adminClient';
import { EmptyState, Pager, Stat, formatDate } from './commandCenterUi';

const PAGE_SIZE = 25;

function AdministratorsTable({ rows }: { rows: AdministratorRow[] }) {
  if (rows.length === 0) {
    return <EmptyState>Nenhum administrador registado.</EmptyState>;
  }
  return (
    <div className="vadmin-card vadmin-table-wrap">
      <table className="vadmin-table">
        <thead>
          <tr>
            <th>Administrador</th>
            <th>Funções</th>
            <th>Estado</th>
            <th>MFA</th>
            <th>Conta ligada</th>
            <th>Último acesso</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id}>
              <td>
                {row.display_name}
                <div className="vadmin-stat-hint">{row.email}</div>
              </td>
              <td>
                {row.roles.length === 0
                  ? '—'
                  : row.roles.map(role => (
                      <span
                        key={role}
                        className={'vadmin-badge ' + (role === 'ROOT' ? 'root' : '')}
                        style={{ marginRight: '0.3rem' }}
                      >
                        {role}
                      </span>
                    ))}
              </td>
              <td>
                <span className={'vadmin-badge ' + (row.status === 'ACTIVE' ? 'ok' : 'warn')}>
                  {row.status === 'ACTIVE' ? 'Ativo' : 'Suspenso'}
                </span>
              </td>
              <td>{row.mfa_required ? 'Obrigatória' : 'Opcional'}</td>
              <td>{row.account_linked ? 'Sim' : 'Ainda não'}</td>
              <td>{formatDate(row.last_seen_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlatformUsersTable({ rows }: { rows: PlatformUserRow[] }) {
  return (
    <div className="vadmin-card vadmin-table-wrap">
      <table className="vadmin-table">
        <thead>
          <tr>
            <th>Conta</th>
            <th>Criada</th>
            <th>Última entrada</th>
            <th>Email confirmado</th>
            <th>Administrador</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id}>
              <td>{row.email ?? '—'}</td>
              <td>{formatDate(row.created_at)}</td>
              <td>{formatDate(row.last_sign_in_at)}</td>
              <td>
                <span className={'vadmin-badge ' + (row.confirmed ? 'ok' : 'warn')}>
                  {row.confirmed ? 'Sim' : 'Não'}
                </span>
              </td>
              <td>{row.is_admin ? <span className="vadmin-badge root">Sim</span> : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function UsersPage() {
  const [data, setData] = useState<PlatformUsersResult | null>(null);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [pendingSearch, setPendingSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    fetchPlatformUsers({
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      search: search || undefined,
    })
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
  }, [page, search]);

  useEffect(() => load(), [load]);

  const counters = data?.users.counters;

  return (
    <>
      <h1 className="vadmin-page-title">Gestão de Admins e Utilizadores</h1>
      <p className="vadmin-page-sub">
        Administradores em <span className="vadmin-secret">governance.admins</span> e contas
        da plataforma em <span className="vadmin-secret">auth.users</span>.
      </p>

      {error && <div className="vadmin-alert" role="alert">{error}</div>}
      {loading && !data && <EmptyState>A carregar…</EmptyState>}

      {data && (
        <>
          <div className="vadmin-grid" style={{ marginBottom: '1.5rem' }}>
            <Stat
              label="Contas da plataforma"
              value={counters?.total ?? 0}
              hint={`${counters?.new7d ?? 0} nos últimos 7 dias`}
            />
            <Stat
              label="Contas confirmadas"
              value={counters?.confirmed ?? 0}
              hint="Email verificado"
            />
            <Stat
              label="Perfis criados"
              value={counters?.profiles ?? 0}
              hint="public.profiles"
            />
            <Stat
              label="Administradores"
              value={counters?.admins ?? data.administrators.length}
              hint="Com acesso ao Centro de Comando"
            />
          </div>

          <h2 className="vadmin-section-title">Administradores</h2>
          <AdministratorsTable rows={data.administrators} />
          <p className="vadmin-stat-hint" style={{ margin: '0.6rem 0 1.8rem' }}>
            As funções de cada administrador são geridas em{' '}
            <Link to="/admin/roles">Funções &amp; Permissões</Link>. As duas contas ROOT são
            permanentes e não podem ser removidas nem despromovidas.
          </p>

          <h2 className="vadmin-section-title">Contas da plataforma</h2>
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
              placeholder="Pesquisar por email"
              value={pendingSearch}
              maxLength={120}
              onChange={e => setPendingSearch(e.target.value)}
              aria-label="Pesquisar contas da plataforma"
            />
            <button className="vadmin-btn" type="submit">Filtrar</button>
          </form>

          {data.users.items.length === 0 ? (
            <EmptyState>
              {search ? 'Sem contas para a pesquisa efetuada.' : 'Ainda não existem contas.'}
            </EmptyState>
          ) : (
            <>
              <PlatformUsersTable rows={data.users.items} />
              <Pager
                page={page}
                total={data.users.total}
                pageSize={PAGE_SIZE}
                loading={loading}
                onChange={setPage}
                noun="contas"
              />
            </>
          )}
        </>
      )}
    </>
  );
}
