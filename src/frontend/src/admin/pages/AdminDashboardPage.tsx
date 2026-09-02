/**
 * /admin — administrative dashboard.
 *
 * Phase 1 shows only what genuinely exists in the database today: accounts,
 * the administration itself, the audit trail and the error log. Sections whose
 * backend belongs to a later phase are listed as planned rather than filled
 * with invented numbers.
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchDashboard } from '../adminApi';
import type { AdminDashboard } from '../adminApi';
import { ADMIN_GENERIC_ERROR } from '../adminClient';
import { useAdminAuth } from '../AdminAuthContext';

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="vadmin-card">
      <div className="vadmin-stat-label">{label}</div>
      <div className="vadmin-stat-value">{value}</div>
      {hint && <div className="vadmin-stat-hint">{hint}</div>}
    </div>
  );
}

/**
 * Binds this browser's Internet Identity to the administrator who is signed in.
 *
 * It exists so that an administrator whose principal is not on file yet can
 * enable Internet Identity sign-in themselves, from a session that is already
 * verified, instead of somebody editing the database by hand. The binding is
 * one-way: an account that already has a principal is refused, and both
 * outcomes are audited.
 */
function InternetIdentityBinding() {
  const { linkIcp } = useAdminAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onLink = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const claimed = await linkIcp();
      setMessage(
        claimed
          ? 'Internet Identity associada. Pode agora entrar na administração com Internet Identity.'
          : 'Já existe uma Internet Identity associada a esta conta. Nada foi alterado.',
      );
    } catch {
      setMessage(ADMIN_GENERIC_ERROR);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="vadmin-card" style={{ marginBottom: '1.5rem' }}>
      <div className="vadmin-stat-label">Internet Identity</div>
      <p className="vadmin-stat-hint" style={{ marginTop: '0.6rem' }}>
        Associe a Internet Identity que usa na aplicação a esta conta administrativa. A
        delegação é verificada no servidor contra a chave raiz da Internet Computer; a
        verificação em dois passos continua obrigatória em cada sessão.
      </p>
      <p style={{ marginTop: '0.6rem' }}>
        <button className="vadmin-btn-ghost" type="button" disabled={busy} onClick={() => { void onLink(); }}>
          {busy ? 'A verificar…' : 'Associar Internet Identity'}
        </button>
      </p>
      {message && <div className="vadmin-note" role="status">{message}</div>}
    </div>
  );
}

export default function AdminDashboardPage() {
  const { admin } = useAdminAuth();
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchDashboard()
      .then(result => {
        if (!cancelled) setData(result);
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
  }, []);

  return (
    <>
      <h1 className="vadmin-page-title">Centro de Comando</h1>
      <p className="vadmin-page-sub">
        Bem-vindo, {admin?.displayName}. Visibilidade → controlo → evidência → auditabilidade.
      </p>

      {error && <div className="vadmin-alert" role="alert">{error}</div>}
      {loading && <p className="vadmin-page-sub">A carregar…</p>}

      {data && (
        <>
          <div className="vadmin-grid" style={{ marginBottom: '1.5rem' }}>
            <Stat
              label="Utilizadores"
              value={data.users.total ?? '—'}
              hint={`${data.users.new7d ?? 0} novos nos últimos 7 dias`}
            />
            <Stat
              label="Administradores"
              value={data.administration.admins}
              hint={`${data.administration.root} ROOT · ${data.administration.mfaRequired} com MFA obrigatório`}
            />
            <Stat
              label="Funções (RBAC)"
              value={data.administration.roles}
              hint="Roles definidos em governance.roles"
            />
            <Stat
              label="Auditoria (24 h)"
              value={data.audit.last24h}
              hint={`${data.audit.total} eventos no total`}
            />
            <Stat
              label="Acessos negados (7 d)"
              value={data.audit.denied7d}
              hint="Tentativas bloqueadas pelo backend"
            />
            <Stat
              label="Erros técnicos (24 h)"
              value={data.errors.last24h}
              hint={`${data.errors.total} registados em governance.error_logs`}
            />
          </div>

          <div className="vadmin-card" style={{ marginBottom: '1.5rem' }}>
            <div className="vadmin-stat-label">Atalhos</div>
            <p style={{ marginTop: '0.6rem', display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              <Link className="vadmin-btn-ghost" to="/admin/administrators">Administradores</Link>
              <Link className="vadmin-btn-ghost" to="/admin/roles">Funções &amp; Permissões</Link>
              <Link className="vadmin-btn-ghost" to="/admin/audit">Registo de auditoria</Link>
            </p>
          </div>

          <InternetIdentityBinding />

          <div className="vadmin-note">
            Estado da plataforma (Supabase, ICP, Edge Functions, IA, AutoShield, Threat
            Intelligence, Billing e Ingestão) passa a ser apresentado em System Health nas fases
            seguintes. A Fase 1 mostra apenas métricas que existem realmente hoje —
            nenhum indicador é inventado. Dados gerados em{' '}
            {new Date(data.generatedAt).toLocaleString('pt-PT')}.
          </div>
        </>
      )}
    </>
  );
}
