import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';
import SafeRoomPanel from '../safeLocation/SafeRoomPanel';
import { useAuth } from '../hooks/useAuth';
import { useI18n } from '../i18n/useI18n';
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

const DURATIONS = [60, 180, 480, 1440] as const;

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
  const { t } = useI18n();

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
        <PageHeader
          icon="🛰"
          title={t('room.title')}
          subtitle={t('room.subtitle', { max: SAFE_ROOM_MAX_PARTICIPANTS })}
        />
        <div className="alert-error" role="alert">{SAFE_ROOM_CONFIG_ERROR}</div>
      </div>
    );
  }

  if (session && state) {
    return (
      <div className="page">
        <PageHeader
          icon="🛰"
          title={t('room.liveTitle')}
          subtitle={t('room.liveSubtitle')}
        />
        <SafeRoomPanel session={session} initialState={state} onExit={handleExit} />
      </div>
    );
  }

  if (restoring) {
    return (
      <div className="page">
        <div className="spinner" role="status" aria-label={t('room.loading')} />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        icon="🛰"
        title={token ? t('room.joinTitle') : t('room.title')}
        subtitle={
          token
            ? t('room.joinSubtitle')
            : t('room.subtitle', { max: SAFE_ROOM_MAX_PARTICIPANTS })
        }
      />

      {error && <div className="alert-error mt-2" role="alert">{error}</div>}

      <section className="card mt-2">
        <label className="field">
          <span className="field-label">{t('room.yourName')}</span>
          <input
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder={t('room.yourNamePlaceholder')}
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
                {t('room.terms')}{' '}
                <a href="/legal/terms">{t('room.termsLink')}</a>
                {' · '}
                <a href="/legal/privacy">{t('room.privacyLink')}</a>
              </span>
            </label>
            <button
              type="button"
              className="btn-primary mt-2"
              onClick={() => void handleJoin()}
              disabled={busy || !acceptTerms || displayName.trim().length === 0}
            >
              {busy ? t('room.joining') : t('room.join')}
            </button>
          </>
        ) : (
          <>
            <label className="field">
              <span className="field-label">{t('room.name')}</span>
              <input value={roomName} onChange={e => setRoomName(e.target.value)} maxLength={60} />
            </label>

            <label className="field">
              <span className="field-label">{t('room.duration')}</span>
              <select
                value={durationMinutes}
                onChange={e => setDurationMinutes(Number(e.target.value))}
              >
                {DURATIONS.map(minutes => (
                  <option key={minutes} value={minutes}>{t(`room.duration${minutes}`)}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">
                {t('room.radius', { radius: radiusMeters, max: SAFE_ROOM_MAX_RADIUS_METERS })}
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
              {busy ? t('room.creating') : t('room.create')}
            </button>

            {lastShareUrl && (
              <p className="text-muted safe-list-sub mt-2">
                {t('room.shareLink')}: <a href={lastShareUrl}>{lastShareUrl}</a>
              </p>
            )}
          </>
        )}
      </section>

      {!token && (
        <EmptyState
          icon="🔗"
          title={t('room.linkTitle')}
          body={t('room.linkBody')}
        />
      )}
    </div>
  );
}
