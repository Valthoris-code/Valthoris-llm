import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MapPlaceholder from '../components/ui/MapPlaceholder';
import type { MapMarker } from '../components/ui/MapPlaceholder';
import { useDeviceLocation } from './useDeviceLocation';
import {
  buildRoomUrl,
  clearStoredSession,
  fetchRoomState,
  leaveRoom,
  publishLocation,
  sendRoomMessage,
  storeSession,
} from '../services/safeRoomService';
import type {
  SafeRoomParticipant,
  SafeRoomSession,
  SafeRoomState,
} from '../services/safeRoomService';
import { copyToClipboard } from './shareLink';
import { useI18n } from '../i18n/useI18n';

/** How often the room state is refreshed while the room is open. */
const REFRESH_MS = 5_000;
/** How often this participant re-publishes their own position. */
const PUBLISH_MS = 10_000;

interface Props {
  session: SafeRoomSession;
  initialState: SafeRoomState;
  /** Called after the participant leaves (or the room ends). */
  onExit: () => void;
}

function countdown(expiresAt: string, now: number): string {
  const remaining = new Date(expiresAt).getTime() - now;
  if (remaining <= 0) return '00:00:00';
  const total = Math.floor(remaining / 1000);
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function participantMarker(p: SafeRoomParticipant, selfSuffix: string): MapMarker | null {
  if (typeof p.latitude !== 'number' || typeof p.longitude !== 'number') return null;
  return {
    id: p.id,
    lat: p.latitude,
    lng: p.longitude,
    label: p.isSelf ? `${p.displayName} (${selfSuffix})` : p.displayName,
    severity: p.isSelf ? 'low' : 'medium',
  };
}

/**
 * Live view of one Safe Room.
 *
 * Every participant runs this component: it publishes only its OWN position and
 * renders the positions the backend returns for the other participants of the
 * same room. Nothing is drawn for a participant that left or went offline —
 * the backend simply stops returning their coordinates.
 */
export default function SafeRoomPanel({ session, initialState, onExit }: Props) {
  const [state, setState] = useState<SafeRoomState>(initialState);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  const { t } = useI18n();

  const device = useDeviceLocation(true);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const startWatching = device.startWatching;
  const stopWatching = device.stopWatching;

  useEffect(() => {
    storeSession(session);
  }, [session]);

  // Continuous positioning while the participant is inside the room.
  useEffect(() => {
    startWatching();
    return () => stopWatching();
  }, [startWatching, stopWatching]);

  // Countdown tick.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const apply = useCallback((next: SafeRoomState) => {
    setState(next);
    setError('');
  }, []);

  const handleFailure = useCallback((e: unknown) => {
    const text = e instanceof Error ? e.message : String(e);
    setError(text);
    // A closed/expired room, or a revoked seat, ends the session for real.
    if (/expired|closed|not a participant|left this room|not valid/i.test(text)) {
      clearStoredSession();
      onExit();
    }
  }, [onExit]);

  // Refresh the room (participants + chat) on a fixed cadence.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const next = await fetchRoomState(session);
        if (!cancelled) apply(next);
      } catch (e) {
        if (!cancelled) handleFailure(e);
      }
    };
    const id = setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [session, apply, handleFailure]);

  // Publish our own position: immediately when it first arrives, then on a
  // cadence so the other participants keep seeing a live marker.
  const position = device.position;
  const lastPublished = useRef(0);
  useEffect(() => {
    if (!position) return;
    let cancelled = false;
    const publish = async () => {
      try {
        const next = await publishLocation(session, position);
        lastPublished.current = Date.now();
        if (!cancelled) apply(next);
      } catch (e) {
        if (!cancelled) handleFailure(e);
      }
    };
    if (Date.now() - lastPublished.current > PUBLISH_MS) void publish();
    const id = setInterval(publish, PUBLISH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [position, session, apply, handleFailure]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: 'nearest' });
  }, [state.messages.length]);

  const selfSuffix = t('room.you');
  const markers = useMemo(
    () =>
      state.participants
        .map(p => participantMarker(p, selfSuffix))
        .filter((m): m is MapMarker => m !== null),
    [state.participants, selfSuffix],
  );

  const self = state.participants.find(p => p.isSelf) ?? null;
  const center = self && typeof self.latitude === 'number' && typeof self.longitude === 'number'
    ? { lat: self.latitude, lng: self.longitude }
    : markers.length > 0
      ? { lat: markers[0].lat, lng: markers[0].lng }
      : undefined;

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      apply(await sendRoomMessage(session, body));
      setDraft('');
    } catch (e) {
      handleFailure(e);
    } finally {
      setSending(false);
    }
  };

  const handleLeave = async () => {
    setLeaving(true);
    try {
      await leaveRoom(session);
    } catch (e) {
      // Leaving must always end the local session, even if the call failed.
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      stopWatching();
      clearStoredSession();
      setLeaving(false);
      onExit();
    }
  };

  const shareUrl = buildRoomUrl(state.room.token);

  return (
    <div className="safe-room">
      <section className="card safe-room-header">
        <div className="safe-room-title">
          <h2 className="section-title" style={{ margin: 0 }}>🛰 {state.room.name}</h2>
          <span className="badge badge-cyan">
            {t('room.participants', {
              count: state.room.participantCount,
              max: state.room.maxParticipants,
            })}
          </span>
          <span
            className="badge badge-amber"
            aria-label={t('room.expiresIn', { time: countdown(state.room.expiresAt, now) })}
          >
            ⏳ {countdown(state.room.expiresAt, now)}
          </span>
        </div>
        <div className="safe-room-header-actions">
          <button
            type="button"
            className="btn-secondary safe-mini-btn"
            onClick={async () => {
              const ok = await copyToClipboard(shareUrl);
              setCopied(ok);
              if (!ok) setError(`${t('room.shareLink')}: ${shareUrl}`);
            }}
          >
            {copied ? t('room.copied') : t('room.copyLink')}
          </button>
          <button
            type="button"
            className="btn-danger safe-mini-btn safe-room-exit"
            onClick={() => void handleLeave()}
            disabled={leaving}
          >
            {leaving ? t('room.leaving') : t('room.exit')}
          </button>
        </div>
      </section>

      {error && <div className="alert-error mt-2" role="alert">{error}</div>}
      {device.error && <div className="alert-error mt-2" role="alert">{device.error}</div>}
      {!device.position && !device.error && (
        <p className="text-muted safe-list-sub">{t('room.locationDenied')}</p>
      )}

      <div className="safe-room-grid">
        <div className="safe-room-map">
          <MapPlaceholder
            center={center}
            zoom={center ? 15 : 4}
            circle={center ? { ...center, radiusMeters: state.room.radiusMeters } : undefined}
            markers={markers}
            height={340}
            caption={t('room.participants', {
              count: markers.length,
              max: state.room.maxParticipants,
            })}
          />
          <ul className="safe-room-participants">
            {state.participants.map(p => (
              <li key={p.id} className={`safe-room-participant${p.isSelf ? ' is-self' : ''}`}>
                <span className="safe-room-dot" aria-hidden="true">{p.isSelf ? '🟢' : '🔵'}</span>
                <span className="safe-room-name">
                  {p.displayName}
                  {p.isSelf ? ` (${t('room.you')})` : ''}
                  {p.isCreator ? ` · ${t('room.creator')}` : ''}
                </span>
                <span className="text-muted safe-list-sub">
                  {p.latitude !== null
                    ? `📍 ${p.latitude.toFixed(5)}, ${p.longitude?.toFixed(5)}`
                    : p.present ? t('room.noLocation') : 'offline'}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <section className="card safe-room-chat" aria-label={t('room.chat')}>
          <h3 className="section-title">💬 {t('room.chat')}</h3>
          <div className="safe-room-messages">
            {state.messages.length === 0 ? (
              <p className="text-muted safe-list-sub">{t('room.noMessages')}</p>
            ) : (
              state.messages.map(m => (
                <div key={m.id} className={`safe-room-message${m.isSelf ? ' is-self' : ''}`}>
                  <div className="safe-room-message-meta">
                    <strong>{m.isSelf ? t('room.you') : m.authorName}</strong>
                    <time dateTime={m.createdAt}>
                      {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </time>
                  </div>
                  <span className="safe-room-message-body">{m.body}</span>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="safe-room-composer">
            <input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder={t('room.messagePlaceholder')}
              aria-label={t('room.messagePlaceholder')}
              maxLength={2000}
            />
            <button
              type="button"
              className="btn-primary safe-mini-btn"
              onClick={() => void handleSend()}
              disabled={sending || draft.trim().length === 0}
              aria-label={t('room.send')}
            >
              {sending ? '⏳' : '➤'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
