import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import RoleGuard from '../components/RoleGuard';
import { getAllUsers } from '../services/roleService';
import type { ManagedUser } from '../services/roleService';

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="card">
      <div style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>{icon}</div>
      <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent-cyan)' }}>{value}</div>
      <div className="text-muted" style={{ fontSize: '0.88rem' }}>{label}</div>
    </div>
  );
}

function AdminDashboardContent() {
  const { principal } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const nextUsers = await getAllUsers();
        if (mounted) {
          setUsers(nextUsers);
          setError('');
        }
      } catch (err) {
        if (mounted) {
          setUsers([]);
          setError(String(err));
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const totalUsers    = users.length;
  const activeUsers   = users.filter(u => u.isActive).length;
  const admins        = users.filter(u => u.role === 'administrator').length;
  const moderators    = users.filter(u => u.role === 'moderator').length;
  const members       = users.filter(u => u.role === 'member').length;

  return (
    <div className="page">
      <h1>🛡 Painel de Administração</h1>
      <p className="text-muted">
        Principal: <code>{principal}</code>
      </p>

      {error && <div className="alert-error mt-2">{error}</div>}
      {loading && <div className="spinner mt-2" />}

      <h2 className="mt-3">Visão Geral de Utilizadores</h2>
      <div className="stat-grid">
        <StatCard label="Total Utilizadores"   value={String(totalUsers)}  icon="👥" />
        <StatCard label="Utilizadores Activos" value={String(activeUsers)} icon="✅" />
        <StatCard label="Administradores"      value={String(admins)}      icon="🛡" />
        <StatCard label="Moderadores"          value={String(moderators)}  icon="🔑" />
        <StatCard label="Membros"              value={String(members)}     icon="👤" />
      </div>

      <h2 className="mt-3">Gestão</h2>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '1rem' }}>
        <Link
          to="/admin/users"
          className="card"
          style={{ textDecoration: 'none', flex: '1 1 280px', cursor: 'pointer', display: 'block' }}
        >
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>👥</div>
          <h3 style={{ margin: '0 0 0.5rem' }}>Gestão de Utilizadores</h3>
          <p className="text-muted" style={{ margin: 0, fontSize: '0.9rem' }}>
            Promover, demover, activar e desactivar contas de utilizadores registados.
          </p>
        </Link>
      </div>

      <p className="text-muted mt-3" style={{ fontSize: '0.82rem' }}>
        ℹ️ As funções administrativas são autorizadas pelo canister backend. A atribuição
        inicial de administrador requer bootstrap explícito no backend.
      </p>
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
            ⛔ Acesso negado. Esta página requer privilégios de administrador.
          </div>
        </div>
      }
    >
      <AdminDashboardContent />
    </RoleGuard>
  );
}
