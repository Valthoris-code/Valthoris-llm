import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActorsReady } from '../hooks/useActors';
import { useAuth } from '../hooks/useAuth';
import {
  EMPTY_PROFILE_DETAILS,
  fetchProfileDetails,
  getCachedProfileDetails,
  saveProfileDetails,
} from '../services/profileService';
import type { ProfileDetailsData } from '../services/profileService';
import PageHeader from '../components/ui/PageHeader';
import ProfilePreferences from './ProfilePreferences';

// Matches the backend UserProfile type exactly
interface UserProfile {
  principal: string;
  displayName: string;
  createdAt: bigint;
  updatedAt: bigint;
  reputationScore: bigint;
  totalScans: bigint;
  totalReports: bigint;
  isActive: boolean;
}

/** Exact backend error meaning "this principal has no profile yet". */
const NOT_REGISTERED = 'User not registered';

/** Allow only http/https avatar URLs — prevents javascript: and data: injection. */
function sanitizeAvatarUrl(raw: string): string {
  try {
    const { protocol, host, pathname, search, hash } = new URL(raw);
    if (protocol === 'https:' || protocol === 'http:') {
      return `${protocol}//${host}${pathname}${search}${hash}`;
    }
  } catch {
    // invalid URL
  }
  return '';
}

export default function Profile() {
  const { isAuthenticated, principal, loading: authLoading } = useAuth();
  const { actors, ready } = useActorsReady();
  const navigate = useNavigate();

  const [profile, setProfile]   = useState<UserProfile | null>(null);
  /** True only when the backend explicitly reported "User not registered". */
  const [notRegistered, setNotRegistered] = useState(false);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');

  // Register form
  const [displayName, setDisplayName] = useState('');
  const [registering, setReg]         = useState(false);

  // ── Extended profile ────────────────────────────────────────────────────────
  // Form-field states — bound to inputs, never used in img src
  const [extDisplayName, setExtDisplayName] = useState('');
  const [avatarUrlInput, setAvatarUrlInput] = useState('');
  const [bio, setBio]                       = useState('');
  const [saving, setSaving]                 = useState(false);
  /** Preferences persisted together with the extended profile. */
  const [prefs, setPrefs] = useState<ProfileDetailsData>(EMPTY_PROFILE_DETAILS);

  // Separate display state for avatar — only populated from persisted (saved) data
  // so no taint flows from the input field to this value.
  const [savedAvatarUrl, setSavedAvatarUrl] = useState('');

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await actors.backend.getUserProfile();
      if ('ok' in res) {
        setProfile(res.ok as unknown as UserProfile);
        setNotRegistered(false);
        setError('');
      } else {
        const message = String((res as { err: string }).err);
        if (message === NOT_REGISTERED) {
          // First access — show the create-profile form.
          setProfile(null);
          setNotRegistered(true);
          setError('');
        } else {
          // Authentication / account errors must never be mistaken for
          // "not registered", otherwise an existing profile looks empty.
          setProfile(null);
          setNotRegistered(false);
          setError(message);
        }
      }
    } catch (e) {
      setProfile(null);
      setNotRegistered(false);
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [actors]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) { navigate('/'); return; }
    // Wait until the identity-bound actors exist, otherwise the call is made
    // with the anonymous agent and the backend rejects it.
    if (!ready) return;
    void loadProfile();
  }, [authLoading, isAuthenticated, navigate, ready, loadProfile]);

  /**
   * Apply persisted extended-profile values to the form.
   * avatarUrlInput fills the input text field; savedAvatarUrl is the validated
   * URL used exclusively for the <img> element.
   */
  const applyDetails = useCallback((details: ProfileDetailsData) => {
    setPrefs(details);
    setExtDisplayName(details.displayName ?? '');
    setAvatarUrlInput(details.avatarUrl ?? '');
    setBio(details.bio ?? '');
    setSavedAvatarUrl(sanitizeAvatarUrl(details.avatarUrl ?? ''));
  }, []);

  // Paint the cached copy immediately, then replace it with the authoritative
  // canister record. The cache is never treated as the persisted truth.
  useEffect(() => {
    if (!principal) return;
    applyDetails(getCachedProfileDetails(principal));
  }, [principal, applyDetails]);

  useEffect(() => {
    if (authLoading || !isAuthenticated || !ready || !principal || !profile) return;
    let cancelled = false;
    void (async () => {
      try {
        const details = await fetchProfileDetails(actors.backend, principal);
        if (!cancelled) applyDetails(details);
      } catch (e) {
        if (!cancelled) setError(`Não foi possível carregar o perfil alargado: ${String(e)}`);
      }
    })();
    return () => { cancelled = true; };
  }, [authLoading, isAuthenticated, ready, principal, profile, actors, applyDetails]);

  const handleRegister = async () => {
    if (!displayName.trim()) return;
    setReg(true);
    setError('');
    try {
      const res = await actors.backend.registerUser(displayName.trim());
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

  const handleSaveExtended = async () => {
    if (!principal) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      // The canister answer — not the form field — is what gets rendered back,
      // so a rejected write can never look like a successful one.
      const saved = await saveProfileDetails(actors.backend, principal, {
        ...prefs,
        displayName: extDisplayName.trim() || undefined,
        avatarUrl:   avatarUrlInput.trim() || undefined,
        bio:         bio.trim()            || undefined,
      });
      applyDetails(saved);
      setSuccess('Perfil actualizado com sucesso!');
    } catch (e) {
      setError(`Não foi possível guardar o perfil: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  /** Persist a preference change (country, public profile, 2FA) immediately. */
  const handlePrefsChange = useCallback(async (next: ProfileDetailsData) => {
    if (!principal) throw new Error('Not authenticated');
    const saved = await saveProfileDetails(actors.backend, principal, next);
    applyDetails(saved);
  }, [actors, principal, applyDetails]);

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
      <PageHeader
        icon="👤"
        title="Perfil"
        subtitle={`Principal: ${principal ?? '—'}`}
        badge={<span className="badge-beta">BETA</span>}
      />

      {error   && <div className="alert-error   mt-2">{error}</div>}
      {success && <div className="alert-success mt-2">{success}</div>}

      {!profile && !notRegistered ? (
        <div className="card mt-2" style={{ maxWidth: 480 }}>
          <h3>Perfil indisponível</h3>
          <p className="text-muted">
            Não foi possível carregar o seu perfil. Verifique a sessão e tente novamente.
          </p>
          <button className="btn-secondary mt-2" onClick={() => void loadProfile()}>
            🔄 Tentar novamente
          </button>
        </div>
      ) : !profile ? (
        <div className="card mt-2" style={{ maxWidth: 480 }}>
          <h3>Criar Perfil</h3>
          <p className="text-muted">Este é o seu primeiro acesso. Crie o seu perfil para aceder a todas as funcionalidades.</p>
          <div className="mt-2">
            <label className="text-muted" style={{ fontSize: '0.88rem' }}>Nome de utilizador *</label>
            <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="valthoris_user" style={{ marginTop: '0.3rem' }} />
          </div>
          <button className="btn-primary mt-2" onClick={handleRegister}
            disabled={registering || !displayName.trim()}>
            {registering ? '⏳ A criar...' : '✅ Criar Perfil'}
          </button>
        </div>
      ) : (
        <>
          {/* ── Canister profile card ── */}
          <div className="card mt-2" style={{ maxWidth: 480 }}>
            <div className="flex items-center gap-2 mb-2">
              {/* savedAvatarUrl comes from getLocalProfile() after save — not
                  from direct user input — so no user-controlled value reaches
                  this img src attribute. */}
              {savedAvatarUrl ? (
                <img
                  src={savedAvatarUrl}
                  alt="Avatar"
                  style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)' }}
                />
              ) : (
                <div style={{ fontSize: '3rem' }}>👤</div>
              )}
              <div>
                <h2 style={{ margin: 0 }}>{extDisplayName || profile.displayName}</h2>
                {bio && <p className="text-muted" style={{ margin: '0.25rem 0 0', fontSize: '0.88rem' }}>{bio}</p>}
                <span className={`badge mt-1 ${reputationColor(profile.reputationScore)}`}>
                  Reputação {String(profile.reputationScore)}/100
                </span>
              </div>
            </div>

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
              Membro desde {new Date(Number(profile.createdAt / BigInt(1_000_000))).toLocaleDateString('pt-PT')}
            </p>
          </div>

          {/* ── Extended profile editing ── */}
          <div className="card mt-2" style={{ maxWidth: 480 }}>
            <h3 style={{ marginTop: 0 }}>✏️ Editar Perfil Alargado</h3>
            <p className="text-muted" style={{ fontSize: '0.88rem' }}>
              Guardados no canister ICP sob a sua Internet Identity, pelo que persistem em qualquer dispositivo.
            </p>

            <div className="mt-2">
              <label className="text-muted" style={{ fontSize: '0.88rem' }}>Nome de apresentação</label>
              <input
                value={extDisplayName}
                onChange={e => setExtDisplayName(e.target.value)}
                placeholder={profile.displayName}
                style={{ marginTop: '0.3rem' }}
              />
            </div>

            <div className="mt-2">
              <label className="text-muted" style={{ fontSize: '0.88rem' }}>URL do Avatar</label>
              <input
                value={avatarUrlInput}
                onChange={e => setAvatarUrlInput(e.target.value)}
                placeholder="https://exemplo.com/avatar.png"
                style={{ marginTop: '0.3rem' }}
              />
            </div>

            <div className="mt-2">
              <label className="text-muted" style={{ fontSize: '0.88rem' }}>Biografia</label>
              <textarea
                value={bio}
                onChange={e => setBio(e.target.value)}
                placeholder="Breve descrição sobre si..."
                rows={3}
                style={{ marginTop: '0.3rem', resize: 'vertical' }}
              />
            </div>

            <button
              className="btn-primary mt-2"
              onClick={handleSaveExtended}
              disabled={saving}
            >
              {saving ? '⏳ A guardar...' : '💾 Guardar Alterações'}
            </button>
          </div>

          <ProfilePreferences
            principal={principal}
            prefs={prefs}
            onChange={handlePrefsChange}
          />
        </>
      )}
    </div>
  );
}
