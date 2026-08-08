import React, { useState, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import RoleGuard from '../components/RoleGuard';
import {
  getAllUsers,
  promoteUser,
  demoteUser,
  deactivateUser,
  reactivateUser,
  type ManagedUser,
} from '../services/roleService';
import type { UserRole } from '../models/User';

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<UserRole, string> = {
  administrator: '🛡 Administrador',
  moderator:     '🔑 Moderador',
  member:        '👤 Membro',
};

const ROLE_BADGE: Record<UserRole, string> = {
  administrator: 'badge-red',
  moderator:     'badge-amber',
  member:        'badge-cyan',
};

// ─── UserRow ──────────────────────────────────────────────────────────────────

interface UserRowProps {
  user: ManagedUser;
  currentPrincipal: string | null;
  onAction: () => Promise<void>;
}

function UserRow({ user, currentPrincipal, onAction }: UserRowProps) {
  const isSelf = user.principal === currentPrincipal;
  const [busy, setBusy] = useState(false);

  const runAction = useCallback(async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      await onAction();
    } finally {
      setBusy(false);
    }
  }, [onAction]);

  const handlePromote = () => void runAction(() => promoteUser(user.principal, user.role));
  const handleDemote = () => void runAction(() => demoteUser(user.principal, user.role));
  const handleDeactivate = () => void runAction(() => deactivateUser(user.principal));
  const handleReactivate = () => void runAction(() => reactivateUser(user.principal));

  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      {/* Utilizador */}
      <td style={{ padding: '0.75rem 1rem' }}>
        <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          {user.principal.slice(0, 18)}…
        </div>
        <div style={{ fontWeight: 600 }}>
          {user.displayName}
          {isSelf && (
            <span className="badge badge-green" style={{ marginLeft: '0.5rem', fontSize: '0.7rem' }}>
              Você
            </span>
          )}
        </div>
      </td>

      {/* Função */}
      <td style={{ padding: '0.75rem 1rem' }}>
        <span className={`badge ${ROLE_BADGE[user.role]}`}>
          {ROLE_LABELS[user.role]}
        </span>
      </td>

      {/* Estado */}
      <td style={{ padding: '0.75rem 1rem' }}>
        <span className={`badge ${user.isActive ? 'badge-green' : 'badge-red'}`}>
          {user.isActive ? '✅ Activo' : '🚫 Inactivo'}
        </span>
      </td>

      {/* Registado */}
      <td style={{ padding: '0.75rem 1rem', fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
        {new Date(user.registeredAt).toLocaleDateString('pt-PT')}
      </td>

      {/* Acções */}
      <td style={{ padding: '0.75rem 1rem' }}>
        {isSelf ? (
          <span className="text-muted" style={{ fontSize: '0.82rem' }}>—</span>
        ) : (
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {user.role !== 'administrator' && (
              <button
                className="btn-primary"
                style={{ padding: '0.3rem 0.65rem', fontSize: '0.8rem' }}
                onClick={handlePromote}
                disabled={busy}
                title="Promover ao próximo nível"
              >
                ⬆ Promover
              </button>
            )}
            {user.role !== 'member' && (
              <button
                className="btn-secondary"
                style={{ padding: '0.3rem 0.65rem', fontSize: '0.8rem' }}
                onClick={handleDemote}
                disabled={busy}
                title="Demover ao nível anterior"
              >
                ⬇ Demover
              </button>
            )}
            {user.isActive ? (
              <button
                className="btn-danger"
                style={{ padding: '0.3rem 0.65rem', fontSize: '0.8rem' }}
                onClick={handleDeactivate}
                disabled={busy}
                title="Desactivar conta"
              >
                🚫 Desactivar
              </button>
            ) : (
              <button
                className="btn-primary"
                style={{ padding: '0.3rem 0.65rem', fontSize: '0.8rem' }}
                onClick={handleReactivate}
                disabled={busy}
                title="Reactivar conta"
              >
                ✅ Reactivar
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type FilterValue = UserRole | 'all';

const FILTER_OPTIONS: { value: FilterValue; label: string }[] = [
  { value: 'all',           label: '🔍 Todos'           },
  { value: 'administrator', label: '🛡 Administradores' },
  { value: 'moderator',     label: '🔑 Moderadores'     },
  { value: 'member',        label: '👤 Membros'         },
];

function UserManagementContent() {
  const { principal } = useAuth();
  const [users, setUsers]   = useState<ManagedUser[]>([]);
  const [filter, setFilter] = useState<FilterValue>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const nextUsers = await getAllUsers();
      setUsers(nextUsers);
      setError('');
    } catch (err) {
      setUsers([]);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = filter === 'all' ? users : users.filter(u => u.role === filter);

  return (
    <div className="page">
      <h1>👥 Gestão de Utilizadores</h1>
      <p className="text-muted">
        Gerir funções e estado de conta de todos os utilizadores registados.
      </p>
      {error && <div className="alert-error mt-2">{error}</div>}
      {loading && <div className="spinner mt-2" />}

      {/* Role filter */}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
        {FILTER_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            className={filter === value ? 'btn-primary' : 'btn-secondary'}
            style={{ padding: '0.35rem 0.9rem', fontSize: '0.88rem' }}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* User table */}
      <div className="card mt-2" style={{ padding: 0, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
          <thead>
            <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
              {['Utilizador', 'Função', 'Estado', 'Registado', 'Acções'].map(h => (
                <th
                  key={h}
                  style={{
                    padding: '0.75rem 1rem',
                    textAlign: 'left',
                    fontSize: '0.82rem',
                    color: 'var(--text-muted)',
                    fontWeight: 600,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}
                >
                  Nenhum utilizador encontrado.
                </td>
              </tr>
            ) : (
              filtered.map(u => (
                <UserRow
                  key={u.principal}
                  user={u}
                  currentPrincipal={principal}
                  onAction={refresh}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-muted mt-2" style={{ fontSize: '0.82rem' }}>
        ℹ️ As alterações de função e activação são aplicadas no canister backend e exigem
        autorização administrativa do lado do servidor.
      </p>
    </div>
  );
}

export default function UserManagement() {
  return (
    <RoleGuard
      requiredRole="administrator"
      fallback={
        <div className="page">
          <div className="alert-error mt-2">
            ⛔ Acesso negado. Esta página requer privilégios de administrador.
          </div>
        </div>
      }
    >
      <UserManagementContent />
    </RoleGuard>
  );
}
