import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActors } from '../hooks/useActors';
import { useAuth } from '../hooks/useAuth';

interface UserProfile {
  principal: string;
  username: string;
  email: string[];
  reputation: bigint;
  totalScans: bigint;
  totalReports: bigint;
  registeredAt: bigint;
}

export default function Profile() {
  const { isAuthenticated, principal } = useAuth();
  const actors = useActors();
  const navigate = useNavigate();

  const [profile, setProfile]   = useState<UserProfile | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');

  // Register form
  const [username, setUsername] = useState('');
  const [email, setEmail]       = useState('');
  const [registering, setReg]   = useState(false);

  useEffect(() => {
    if (!isAuthenticated) { navigate('/'); return; }
    loadProfile();
  }, [isAuthenticated]);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const res = await actors.backend.getUserProfile();
      if (res.length > 0 && res[0]) {
        setProfile(res[0] as unknown as UserProfile);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!username.trim()) return;
    setReg(true);
    setError('');
    try {
      const res = await actors.backend.registerUser(
        username.trim(),
        email.trim() ? [email.trim()] : []
      );
      if ('ok' in res) {
        setSuccess('Perfil criado com sucesso!');
        await loadProfile();
      } else {
        setError((res as any).err);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setReg(false);
    }
  };

  const reputationColor = (rep: bigint) => {
    const v = Number(rep);
    if (v >= 80) return 'badge-green';
    if (v >= 50) return 'badge-cyan';
    if (v >= 30) return 'badge-amber';
    return 'badge-red';
  };

  if (loading) return <div className="page"><div className="spinner" /></div>;

  return (
    <div className="page">
      <h1>👤 Perfil</h1>
      <p className="text-muted">Principal: <code>{principal}</code></p>

      {error   && <div className="alert-error   mt-2">{error}</div>}
      {success && <div className="alert-success mt-2">{success}</div>}

      {!profile ? (
        <div className="card mt-2" style={{ maxWidth: 480 }}>
          <h3>Criar Perfil</h3>
          <p className="text-muted">Este é o seu primeiro acesso. Crie o seu perfil para aceder a todas as funcionalidades.</p>
          <div className="mt-2">
            <label className="text-muted" style={{ fontSize: '0.88rem' }}>Nome de utilizador *</label>
            <input value={username} onChange={e => setUsername(e.target.value)} placeholder="valthoris_user" style={{ marginTop: '0.3rem' }} />
          </div>
          <div className="mt-2">
            <label className="text-muted" style={{ fontSize: '0.88rem' }}>E-mail (opcional)</label>
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="user@exemplo.com" style={{ marginTop: '0.3rem' }} />
          </div>
          <button className="btn-primary mt-2" onClick={handleRegister}
            disabled={registering || !username.trim()}>
            {registering ? '⏳ A criar...' : '✅ Criar Perfil'}
          </button>
        </div>
      ) : (
        <div className="card mt-2" style={{ maxWidth: 480 }}>
          <div className="flex items-center gap-2 mb-2">
            <div style={{ fontSize: '3rem' }}>👤</div>
            <div>
              <h2 style={{ margin: 0 }}>{profile.username}</h2>
              <span className={`badge mt-1 ${reputationColor(profile.reputation)}`}>
                Reputação {String(profile.reputation)}/100
              </span>
            </div>
          </div>

          {profile.email.length > 0 && (
            <p className="text-muted" style={{ fontSize: '0.9rem' }}>📧 {profile.email[0]}</p>
          )}

          <div className="stat-grid mt-2">
            <div className="card">
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent-cyan)' }}>
                {String(profile.totalScans)}
              </div>
              <div className="text-muted" style={{ fontSize: '0.82rem' }}>Verificações</div>
            </div>
            <div className="card">
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent-cyan)' }}>
                {String(profile.totalReports)}
              </div>
              <div className="text-muted" style={{ fontSize: '0.82rem' }}>Denúncias</div>
            </div>
          </div>

          <p className="text-muted mt-2" style={{ fontSize: '0.8rem' }}>
            Membro desde {new Date(Number(profile.registeredAt / BigInt(1_000_000))).toLocaleDateString('pt-PT')}
          </p>
        </div>
      )}
    </div>
  );
}
