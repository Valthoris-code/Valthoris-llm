import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useActorsReady } from '../hooks/useActors';
import RoleGuard from '../components/RoleGuard';
import { getAllUsers } from '../services/roleService';
import type { ManagedUser } from '../services/roleService';
import { findPlatformAdministrator } from '../services/administrators';
import {
  PLATFORM_CANISTERS,
  fetchCanisterRuntimeStatus,
  fetchServiceStatuses,
  formatBytes,
  formatCycles,
  probeAiBackend,
} from '../services/platformStatus';
import type { CanisterRuntimeStatus, ServiceStatus } from '../services/platformStatus';

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="card">
      <div style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>{icon}</div>
      <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent-cyan)' }}>{value}</div>
      <div className="text-muted" style={{ fontSize: '0.88rem' }}>{label}</div>
    </div>
  );
}

function StateBadge({ status }: { status: ServiceStatus }) {
  const operational = status.state === 'operational';
  return (
    <span
      style={{
        fontSize: '0.75rem',
        fontWeight: 700,
        padding: '0.15rem 0.5rem',
        borderRadius: 999,
        whiteSpace: 'nowrap',
        color: operational ? '#0b3d2c' : '#4a1d1d',
        background: operational ? '#4ade80' : '#fca5a5',
      }}
    >
      {operational ? 'Operational' : 'Status unavailable'}
    </span>
  );
}

function ServiceRow({ status }: { status: ServiceStatus }) {
  return (
    <div className="card" style={{ marginBottom: '0.75rem' }}>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <strong style={{ flex: '1 1 220px' }}>{status.name}</strong>
        <StateBadge status={status} />
      </div>
      {status.canisterId && (
        <p className="text-muted" style={{ margin: '0.35rem 0 0', fontSize: '0.8rem' }}>
          Canister: <code>{status.canisterId}</code>
        </p>
      )}
      <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>{status.detail}</p>
      {status.facts && status.facts.length > 0 && (
        <ul className="text-muted" style={{ margin: '0.4rem 0 0 1rem', fontSize: '0.8rem' }}>
          {status.facts.map(([key, value]) => (
            <li key={key}>
              {key}: <strong>{value}</strong>
            </li>
          ))}
        </ul>
      )}
      {status.error && (
        <p style={{ margin: '0.4rem 0 0', fontSize: '0.8rem', color: '#f87171' }}>{status.error}</p>
      )}
    </div>
  );
}

function RuntimeRow({ status }: { status: CanisterRuntimeStatus }) {
  return (
    <div className="card" style={{ marginBottom: '0.75rem' }}>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <strong style={{ flex: '1 1 200px' }}>{status.name}</strong>
        <code style={{ fontSize: '0.78rem' }}>{status.canisterId}</code>
      </div>
      {status.error ? (
        <>
          <p className="text-muted" style={{ margin: '0.4rem 0 0', fontSize: '0.82rem' }}>
            Status unavailable — <code>canister_status</code> is only answered for a controller of
            this canister.
          </p>
          <p style={{ margin: '0.3rem 0 0', fontSize: '0.78rem', color: '#f87171' }}>
            {status.error}
          </p>
        </>
      ) : (
        <ul className="text-muted" style={{ margin: '0.4rem 0 0 1rem', fontSize: '0.8rem' }}>
          <li>Run state: <strong>{status.runState}</strong></li>
          <li>
            Cycles: <strong>{status.cycles !== undefined ? formatCycles(status.cycles) : '—'}</strong>
          </li>
          <li>
            Idle burn / day:{' '}
            <strong>
              {status.idleCyclesBurnedPerDay !== undefined
                ? formatCycles(status.idleCyclesBurnedPerDay)
                : '—'}
            </strong>
          </li>
          <li>
            Memory:{' '}
            <strong>{status.memorySize !== undefined ? formatBytes(status.memorySize) : '—'}</strong>
          </li>
          <li>Controllers: <strong>{status.controllers?.length ?? 0}</strong></li>
          {status.moduleHash && (
            <li style={{ wordBreak: 'break-all' }}>
              Module hash: <code>{status.moduleHash}</code>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function AdminDashboardContent() {
  const { principal, identity, user } = useAuth();
  const { actors, ready } = useActorsReady();

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [usersError, setUsersError] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(true);

  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [runtime, setRuntime] = useState<CanisterRuntimeStatus[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(true);

  const [aiStatus, setAiStatus] = useState<ServiceStatus | null>(null);
  const [aiChecking, setAiChecking] = useState(false);

  const operator = findPlatformAdministrator(principal);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      setUsers(await getAllUsers());
      setUsersError('');
    } catch (err) {
      setUsers([]);
      setUsersError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    const [serviceResults, runtimeResults] = await Promise.all([
      fetchServiceStatuses(actors),
      fetchCanisterRuntimeStatus(identity, PLATFORM_CANISTERS),
    ]);
    setServices(serviceResults);
    setRuntime(runtimeResults);
    setLoadingStatus(false);
  }, [actors, identity]);

  useEffect(() => {
    if (!ready) return;
    void loadUsers();
    void loadStatus();
  }, [ready, loadUsers, loadStatus]);

  const runAiCheck = useCallback(async () => {
    setAiChecking(true);
    try {
      setAiStatus(await probeAiBackend());
    } finally {
      setAiChecking(false);
    }
  }, []);

  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.isActive).length;
  const admins = users.filter(u => u.role === 'administrator').length;
  const moderators = users.filter(u => u.role === 'moderator').length;
  const members = users.filter(u => u.role === 'member').length;

  return (
    <div className="page">
      <h1>🛡 Administration</h1>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h3 style={{ margin: '0 0 0.5rem' }}>Signed-in operator</h3>
        <p className="text-muted" style={{ margin: 0, fontSize: '0.85rem', wordBreak: 'break-all' }}>
          Principal: <code>{principal ?? '—'}</code>
        </p>
        <p className="text-muted" style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
          Role resolved by the backend canister: <strong>{user?.role ?? '—'}</strong>
        </p>
        {operator && (
          <p className="text-muted" style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
            {operator.label}
            {operator.email && <> — contact <code>{operator.email}</code></>}
          </p>
        )}
        <p className="text-muted" style={{ margin: '0.5rem 0 0', fontSize: '0.78rem' }}>
          Administrator authorization is decided by the <code>backend</code> canister from the
          authenticated principal. Showing or hiding this page in the browser is not the security
          boundary — every privileged call is re-checked by the canister.
        </p>
      </div>

      <h2 className="mt-3">Users</h2>
      {usersError && <div className="alert-error mt-2">{usersError}</div>}
      {loadingUsers && <div className="spinner mt-2" />}
      <div className="stat-grid">
        <StatCard label="Total users" value={String(totalUsers)} icon="👥" />
        <StatCard label="Active users" value={String(activeUsers)} icon="✅" />
        <StatCard label="Administrators" value={String(admins)} icon="🛡" />
        <StatCard label="Moderators" value={String(moderators)} icon="🔑" />
        <StatCard label="Members" value={String(members)} icon="👤" />
      </div>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '1rem' }}>
        <Link
          to="/admin/users"
          className="card"
          style={{ textDecoration: 'none', flex: '1 1 280px', cursor: 'pointer', display: 'block' }}
        >
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>👥</div>
          <h3 style={{ margin: '0 0 0.5rem' }}>User management</h3>
          <p className="text-muted" style={{ margin: 0, fontSize: '0.9rem' }}>
            Promote, demote, activate and deactivate registered accounts.
          </p>
        </Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <h2 className="mt-3">Service status</h2>
        <button className="btn-secondary" onClick={() => void loadStatus()} disabled={loadingStatus}>
          {loadingStatus ? 'Checking…' : '↻ Re-check'}
        </button>
      </div>
      {loadingStatus && <div className="spinner mt-2" />}
      {services.map(status => (
        <ServiceRow key={status.name} status={status} />
      ))}

      <h2 className="mt-3">AI Assistant backend</h2>
      <p className="text-muted" style={{ fontSize: '0.82rem' }}>
        This check sends one real message to the <code>ai-chat</code> Edge Function, which calls the
        configured provider. It runs only when you ask for it, because it consumes provider quota.
      </p>
      <button className="btn-secondary" onClick={() => void runAiCheck()} disabled={aiChecking}>
        {aiChecking ? 'Calling provider…' : '▶ Run AI backend check'}
      </button>
      {aiStatus && (
        <div style={{ marginTop: '0.75rem' }}>
          <ServiceRow status={aiStatus} />
        </div>
      )}

      <h2 className="mt-3">Canister runtime (cycles &amp; state)</h2>
      <p className="text-muted" style={{ fontSize: '0.82rem' }}>
        Read live from the IC management canister. Values appear only when the signed-in principal
        is a controller of the canister; otherwise the real rejection is shown.
      </p>
      {runtime.map(status => (
        <RuntimeRow key={status.canisterId} status={status} />
      ))}

      <h2 className="mt-3">Build</h2>
      <div className="card">
        <ul className="text-muted" style={{ margin: 0, paddingLeft: '1rem', fontSize: '0.82rem' }}>
          <li>Network: <strong>{import.meta.env.VITE_DFX_NETWORK ?? 'ic'}</strong></li>
          <li>Mode: <strong>{import.meta.env.MODE}</strong></li>
        </ul>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  return (
    <RoleGuard
      requiredRole="administrator"
      fallback={
        <div className="page">
          <div className="alert-error mt-2">
            ⛔ Access denied. This page requires administrator privileges.
          </div>
        </div>
      }
    >
      <AdminDashboardContent />
    </RoleGuard>
  );
}
