/**
 * /admin/login — the administrative sign-in.
 *
 * Three steps, and none of them ever explains itself:
 *   1. identification — Internet Identity (the provider the rest of Valthoris
 *      uses, verified server-side by `admin-icp-bridge`) or e-mail + password;
 *   2. TOTP enrolment, when the account has no factor yet;
 *   3. TOTP verification, which raises the session to AAL2.
 *
 * A wrong password, an unknown address and an address that is simply not an
 * administrator produce exactly the same answer — "Credenciais inválidas." —
 * so the page cannot be used to discover who administers Valthoris.
 */

import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAdminAuth } from '../AdminAuthContext';
import type { AdminEnrollment } from '../AdminAuthContext';

export default function AdminLogin() {
  const { stage, busy, error, configured, signIn, signInWithIcp, verifyCode, startEnrollment, signOut } =
    useAdminAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [enrollment, setEnrollment] = useState<AdminEnrollment | null>(null);
  const [enrollError, setEnrollError] = useState<string | null>(null);

  // The enrolment secret is fetched only when the account genuinely has no
  // factor yet; it is never displayed for an already-protected account.
  useEffect(() => {
    let cancelled = false;
    if (stage === 'mfa-enrollment-required' && !enrollment) {
      startEnrollment()
        .then(result => {
          if (!cancelled) setEnrollment(result);
        })
        .catch(() => {
          if (!cancelled) setEnrollError('Não foi possível preparar a autenticação em dois passos.');
        });
    }
    return () => {
      cancelled = true;
    };
  }, [stage, enrollment, startEnrollment]);

  if (stage === 'authorized') return <Navigate to="/admin" replace />;

  const onSubmitCredentials = async (event: React.FormEvent) => {
    event.preventDefault();
    await signIn(email, password);
    setPassword('');
  };

  const onSubmitCode = async (event: React.FormEvent) => {
    event.preventDefault();
    await verifyCode(code, enrollment?.factorId);
    setCode('');
  };

  const needsCode = stage === 'mfa-challenge-required' || stage === 'mfa-enrollment-required';

  return (
    <div className="vadmin">
      <div className="vadmin-login">
        <div className="vadmin-login-card vadmin-card">
          <div style={{ textAlign: 'center', marginBottom: '1.2rem' }}>
            <div style={{ fontSize: '2rem' }} aria-hidden="true">🛡</div>
            <h1 className="vadmin-page-title" style={{ marginTop: '0.4rem' }}>
              Valthoris — Administração
            </h1>
            <p className="vadmin-page-sub" style={{ marginBottom: 0 }}>
              Área privada. Acesso autenticado e verificado em dois passos.
            </p>
          </div>

          {!configured && (
            <div className="vadmin-alert" role="alert">
              A administração não está configurada neste ambiente.
            </div>
          )}

          {configured && stage === 'loading' && (
            <div role="status" aria-live="polite" style={{ color: 'var(--vadmin-muted)' }}>
              A verificar sessão…
            </div>
          )}

          {configured && stage === 'anonymous' && (
            <>
              <button
                className="vadmin-btn"
                type="button"
                disabled={busy}
                style={{ width: '100%' }}
                onClick={() => { void signInWithIcp(); }}
              >
                {busy ? 'A validar…' : 'Entrar com Internet Identity'}
              </button>
              <p className="vadmin-note" style={{ margin: '0.6rem 0 1.1rem' }}>
                A delegação do Internet Identity é verificada no servidor antes de
                qualquer sessão ser criada. A verificação em dois passos continua a
                ser exigida.
              </p>
            </>
          )}

          {configured && stage === 'anonymous' && (
            <form onSubmit={onSubmitCredentials}>
              <div className="vadmin-field">
                <label className="vadmin-label" htmlFor="admin-email">E-mail</label>
                <input
                  id="admin-email"
                  className="vadmin-input"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
              <div className="vadmin-field">
                <label className="vadmin-label" htmlFor="admin-password">Palavra-passe</label>
                <input
                  id="admin-password"
                  className="vadmin-input"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>
              {error && (
                <div className="vadmin-alert" role="alert" style={{ marginBottom: '0.9rem' }}>
                  {error}
                </div>
              )}
              <button className="vadmin-btn" type="submit" disabled={busy} style={{ width: '100%' }}>
                {busy ? 'A validar…' : 'Entrar'}
              </button>
            </form>
          )}

          {configured && needsCode && (
            <form onSubmit={onSubmitCode}>
              {stage === 'mfa-enrollment-required' && (
                <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                  <p className="vadmin-page-sub">
                    Configure a autenticação em dois passos numa aplicação TOTP.
                  </p>
                  {enrollment ? (
                    <>
                      <img className="vadmin-qr" src={enrollment.qrCode} alt="Código QR TOTP" />
                      <p className="vadmin-secret" style={{ marginTop: '0.6rem' }}>
                        {enrollment.secret}
                      </p>
                    </>
                  ) : (
                    <p className="vadmin-page-sub">A preparar…</p>
                  )}
                  {enrollError && (
                    <div className="vadmin-alert" role="alert">{enrollError}</div>
                  )}
                </div>
              )}

              <div className="vadmin-field">
                <label className="vadmin-label" htmlFor="admin-code">Código de verificação</label>
                <input
                  id="admin-code"
                  className="vadmin-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={code}
                  onChange={e => setCode(e.target.value)}
                />
              </div>

              {error && (
                <div className="vadmin-alert" role="alert" style={{ marginBottom: '0.9rem' }}>
                  {error}
                </div>
              )}

              <button className="vadmin-btn" type="submit" disabled={busy} style={{ width: '100%' }}>
                {busy ? 'A verificar…' : 'Verificar'}
              </button>
              <button
                type="button"
                className="vadmin-btn-ghost"
                style={{ width: '100%', marginTop: '0.6rem' }}
                onClick={signOut}
              >
                Cancelar
              </button>
            </form>
          )}

          <p className="vadmin-note" style={{ marginTop: '1.2rem' }}>
            Todas as tentativas de acesso são registadas no registo de auditoria.
          </p>
        </div>
      </div>
    </div>
  );
}
