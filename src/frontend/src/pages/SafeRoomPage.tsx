import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';
import SafeRoomPanel from '../safeLocation/SafeRoomPanel';
import { useAuth } from '../hooks/useAuth';
import {
  SAFE_ROOM_CONFIG_ERROR,
  SAFE_ROOM_MAX_PARTICIPANTS,
  SAFE_ROOM_MAX_RADIUS_METERS,
  buildRoomUrl,
  createRoom,
  fetchRoomState,
  isSafeRoomBackendConfigured,
  joinRoom,
  loadStoredSession,
  storeSession,
} from '../services/safeRoomService';
import type { SafeRoomSession, SafeRoomState } from '../services/safeRoomService';

const DURATIONS: Array<{ minutes: number; label: string }> = [
  { minutes: 60, label: '1 hora' },
  { minutes: 180, label: '3 horas' },
  { minutes: 480, label: '8 horas' },
  { minutes: 1440, label: '24 horas (máximo)' },
];

/**
 * Safe Rooms — create a room, or enter one through its share link.
 *
 * `/rooms`        → create a room (and rejoin the room of this tab, if any)
 * `/room/:token`  → enter the room carried by the link, after accepting the
 *                   applicable terms.
 *
 * Every participant that enters gets their own seat: the map inside
 * <SafeRoomPanel> shows one marker per participant of that room, never only
 * the creator's position.
 */
export default function SafeRoomPage() {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { principal } = useAuth();

  const [session, setSession] = useState<SafeRoomSession | null>(null);
  const [state, setState] = useState<SafeRoomState | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [displayName, setDisplayName] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [roomName, setRoomName] = useState('Safe Room');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [radiusMeters, setRadiusMeters] = useState(500);
  const [lastShareUrl, setLastShareUrl] = useState('');

  // Restore the seat of this tab (page reload, or navigating back to the room).
  useEffect(() => {
    let cancelled = false;
    const stored = loadStoredSession(token || undefined);
    if (!stored) {
      setRestoring(false);
      return;
    }
    void (async () => {
      try {
        const next = await fetchRoomState(stored);
        if (cancelled) return;
        setSession(stored);
        setState(next);
      } catch {
        // The stored seat is no longer valid (room closed, expired, left).
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const enter = useCallback((result: SafeRoomSession & SafeRoomState) => {
    const next: SafeRoomSession = {
      roomToken: result.roomToken,
      participantId: result.participantId,
      participantSecret: result.participantSecret,
    };
    storeSession(next);
    setSession(next);
    setState(result);
  }, []);

  const handleCreate = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await createRoom({
        name: roomName,
        displayName,
        durationMinutes,
        radiusMeters,
        principal,
      });
      setLastShareUrl(buildRoomUrl(result.roomToken));
      enter(result);
      navigate(`/room/${result.roomToken}`, { replace: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    setBusy(true);
    setError('');
    try {
      enter(await joinRoom({ roomToken: token, displayName, acceptTerms, principal }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleExit = useCallback(() => {
    setSession(null);
    setState(null);
    setAcceptTerms(false);
    navigate('/rooms', { replace: true });
  }, [navigate]);

  if (!isSafeRoomBackendConfigured) {
    return (
      <div className="page">
        <PageHeader icon="🛰" title="Safe Rooms" subtitle="Salas seguras multiutilizador" />
        <div className="alert-error" role="alert">{SAFE_ROOM_CONFIG_ERROR}</div>
      </div>
    );
  }

  if (session && state) {
    return (
      <div className="page">
        <PageHeader
          icon="🛰"
          title="Safe Room"
          subtitle="Localização e chat partilhados com os participantes desta sala"
        />
        <SafeRoomPanel session={session} initialState={state} onExit={handleExit} />
      </div>
    );
  }

  if (restoring) {
    return (
      <div className="page">
        <div className="spinner" role="status" aria-label="A carregar" />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        icon="🛰"
        title={token ? 'Entrar na Safe Room' : 'Safe Rooms'}
        subtitle={
          token
            ? 'Foi convidado para uma sala segura. A sua localização será visível apenas para os participantes desta sala.'
            : `Salas seguras multiutilizador — até ${SAFE_ROOM_MAX_PARTICIPANTS} participantes, máximo 24 horas.`
        }
      />

      {error && <div className="alert-error mt-2" role="alert">{error}</div>}

      <section className="card mt-2">
        <label className="field">
          <span className="field-label">O seu nome na sala</span>
          <input
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="Como quer aparecer aos outros participantes"
            maxLength={60}
          />
        </label>

        {token ? (
          <>
            <label className="safe-room-terms">
              <input
                type="checkbox"
                checked={acceptTerms}
                onChange={e => setAcceptTerms(e.target.checked)}
              />
              <span>
                Aceito os <a href="/legal/terms">Termos</a> e a{' '}
                <a href="/legal/privacy">Política de Privacidade</a>, e autorizo a partilha da minha
                localização com os participantes desta sala enquanto nela permanecer.
              </span>
            </label>
            <button
              type="button"
              className="btn-primary mt-2"
              onClick={() => void handleJoin()}
              disabled={busy || !acceptTerms || displayName.trim().length === 0}
            >
              {busy ? 'A entrar…' : '🚪 Entrar na sala'}
            </button>
          </>
        ) : (
          <>
            <label className="field">
              <span className="field-label">Nome da sala</span>
              <input value={roomName} onChange={e => setRoomName(e.target.value)} maxLength={60} />
            </label>

            <label className="field">
              <span className="field-label">Duração</span>
              <select
                value={durationMinutes}
                onChange={e => setDurationMinutes(Number(e.target.value))}
              >
                {DURATIONS.map(d => (
                  <option key={d.minutes} value={d.minutes}>{d.label}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">
                Raio de segurança: {radiusMeters} m (máx. {SAFE_ROOM_MAX_RADIUS_METERS} m)
              </span>
              <input
                type="range"
                min={50}
                max={SAFE_ROOM_MAX_RADIUS_METERS}
                step={50}
                value={radiusMeters}
                onChange={e => setRadiusMeters(Number(e.target.value))}
              />
            </label>

            <button
              type="button"
              className="btn-primary mt-2"
              onClick={() => void handleCreate()}
              disabled={busy || displayName.trim().length === 0}
            >
              {busy ? 'A criar…' : '🛰 Criar Safe Room'}
            </button>

            {lastShareUrl && (
              <p className="text-muted safe-list-sub mt-2">
                Link da sala: <a href={lastShareUrl}>{lastShareUrl}</a>
              </p>
            )}
          </>
        )}
      </section>

      {!token && (
        <EmptyState
          icon="🔗"
          title="Entrar através de um link"
          body="Abra o link que recebeu para entrar numa sala existente. Cada participante tem o seu próprio marcador no mapa da sala."
        />
      )}
    </div>
  );
}
