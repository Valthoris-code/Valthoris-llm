import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useActors } from '../hooks/useActors';

interface SystemStats {
  totalUsers: bigint;
  totalScans: bigint;
  totalReports: bigint;
  activeThreats: bigint;
}

interface CommunityStats {
  totalReports: bigint;
  confirmedReports: bigint;
  pendingReports: bigint;
}

export default function Dashboard() {
  const { isAuthenticated, principal } = useAuth();
  const actors = useActors();
  const navigate = useNavigate();

  const [sysStats, setSysStats]   = useState<SystemStats | null>(null);
  const [comStats, setComStats]   = useState<CommunityStats | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/');
      return;
    }
    const load = async () => {
      try {
        const [sys, com] = await Promise.all([
          actors.backend.getSystemStats(),
          actors.community.getStats(),
        ]);
        setSysStats({
          totalUsers:   sys.totalUsers,
          totalScans:   sys.totalScans,
          totalReports: sys.totalReports,
          activeThreats: BigInt(0), // fetched from threat_intelligence on next iteration
        });
        setComStats({
          totalReports:    com.totalReports,
          confirmedReports: com.confirmedReports,
          pendingReports:   com.pendingReports,
        });
      } catch (e) {
        setError('Erro ao carregar estatísticas: ' + String(e));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isAuthenticated]);

  if (loading) return <div className="page"><div className="spinner" /></div>;

  return (
    <div className="page">
      <h1>📊 Dashboard</h1>
      <p className="text-muted">Principal: <code>{principal}</code></p>

      {error && <div className="alert-error mt-2">{error}</div>}

      {sysStats && (
        <>
          <h2 className="mt-3">Estatísticas do Sistema</h2>
          <div className="stat-grid">
            <StatCard label="Utilizadores" value={String(sysStats.totalUsers)} icon="👥" />
            <StatCard label="Verificações"  value={String(sysStats.totalScans)}   icon="🔍" />
            <StatCard label="Denúncias"     value={String(sysStats.totalReports)} icon="🚨" />
          </div>
        </>
      )}

      {comStats && (
        <>
          <h2 className="mt-3">Comunidade</h2>
          <div className="stat-grid">
            <StatCard label="Total Denúncias"     value={String(comStats.totalReports)}     icon="📋" />
            <StatCard label="Confirmadas"         value={String(comStats.confirmedReports)} icon="✅" />
            <StatCard label="Em Investigação"     value={String(comStats.pendingReports)}   icon="🔎" />
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="card">
      <div style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>{icon}</div>
      <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent-cyan)' }}>{value}</div>
      <div className="text-muted" style={{ fontSize: '0.88rem' }}>{label}</div>
    </div>
  );
}
