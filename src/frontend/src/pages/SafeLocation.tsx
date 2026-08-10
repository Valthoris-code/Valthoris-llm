import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';
import MapPlaceholder from '../components/ui/MapPlaceholder';
import Toggle from '../components/ui/Toggle';
import { useToast } from '../components/ui/Toast';
import { useActorsReady } from '../hooks/useActors';
import { useAuth } from '../hooks/useAuth';
import { useI18n } from '../i18n/useI18n';
import TrustedContacts from '../safeLocation/TrustedContacts';
import Geofences from '../safeLocation/Geofences';
import { useDeviceLocation } from '../safeLocation/useDeviceLocation';
import {
  SHARE_DURATIONS,
  UNTIL_DISABLED_TTL_SECONDS,
  loadSettings,
  saveSettings,
} from '../safeLocation/model';
import type { Geofence, GeofenceDraft, SafeLocationSettings, ShareDurationId } from '../safeLocation/model';
import { buildShareUrl, copyToClipboard } from '../safeLocation/shareLink';
import type { MapMarker } from '../components/ui/MapPlaceholder';
import type { GeofenceZone, ShareInfo } from '../../../declarations/safe_location/index.d.ts';

/** Canister zone → UI model. A zone alerting on entry is an "alert" zone. */
function toGeofence(zone: GeofenceZone): Geofence {
  return {
    id: zone.id,
    name: zone.name,
    lat: zone.centerLat,
    lng: zone.centerLng,
    radiusMeters: zone.radiusMeters,
    kind: zone.alertOnEnter ? 'alert' : 'safe',
    notifyOnEnter: zone.alertOnEnter,
    notifyOnExit: zone.alertOnExit,
  };
}

type TabId = 'map' | 'contacts' | 'geofences' | 'history';

const TABS: Array<{ id: TabId; icon: string; label: string }> = [
  { id: 'map', icon: '🗺', label: 'Live map' },
  { id: 'contacts', icon: '👥', label: 'Trusted contacts' },
  { id: 'geofences', icon: '🧭', label: 'Geofences' },
  { id: 'history', icon: '🕘', label: 'History' },
];

export default function SafeLocation() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { actors, ready } = useActorsReady();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { toast } = useToast();

  const [settings, setSettings] = useState<SafeLocationSettings>(() => loadSettings());
  const [tab, setTab] = useState<TabId>('map');
  const [shares, setShares] = useState<ShareInfo[]>([]);
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [geofencesLoading, setGeofencesLoading] = useState(true);
  const [geofenceBusy, setGeofenceBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [duration, setDuration] = useState<ShareDurationId>(settings.defaultDuration);
  const [label, setLabel] = useState('');
  const [recipient, setRecipient] = useState('');
  const [lastShareUrl, setLastShareUrl] = useState('');

  const device = useDeviceLocation(settings.highAccuracy);

  const persist = useCallback((next: SafeLocationSettings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  const loadShares = useCallback(async () => {
    setLoading(true);
    try {
      setShares(await actors.safeLocation.listMyShares());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [actors]);

  const loadGeofences = useCallback(async () => {
    setGeofencesLoading(true);
    try {
      const zones = await actors.safeLocation.listMyGeofences();
      setGeofences(zones.map(toGeofence));
    } catch (e) {
      setError(String(e));
    } finally {
      setGeofencesLoading(false);
    }
  }, [actors]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      navigate('/auth');
      return;
    }
    // The canister rejects anonymous callers, so wait for the identity-bound
    // actors before issuing the first call.
    if (!ready) return;
    void loadShares();
    void loadGeofences();
  }, [authLoading, isAuthenticated, navigate, ready, loadShares, loadGeofences]);

  const handleAddGeofence = useCallback(async (draft: GeofenceDraft) => {
    setGeofenceBusy(true);
    try {
      const result = await actors.safeLocation.setGeofence(
        draft.name,
        draft.lat,
        draft.lng,
        draft.radiusMeters,
        draft.notifyOnEnter,
        draft.notifyOnExit
      );
      if ('err' in result) throw new Error(String((result as { err: string }).err));
      await loadGeofences();
    } finally {
      setGeofenceBusy(false);
    }
  }, [actors, loadGeofences]);

  const handleDeleteGeofence = useCallback(async (id: string) => {
    setGeofenceBusy(true);
    try {
      const result = await actors.safeLocation.deleteGeofence(id);
      if ('err' in result) throw new Error(String((result as { err: string }).err));
      await loadGeofences();
    } finally {
      setGeofenceBusy(false);
    }
  }, [actors, loadGeofences]);

  const activeShares = useMemo(() => shares.filter(s => s.isActive), [shares]);

  const markers = useMemo<MapMarker[]>(() => {
    const list: MapMarker[] = [];
    if (device.position) {
      list.push({
        id: 'me',
        lat: device.position.lat,
        lng: device.position.lng,
        label: t('safe.device'),
        severity: settings.emergencyMode ? 'critical' : 'low',
      });
    }
    settings.contacts.forEach(contact => {
      if (typeof contact.lat === 'number' && typeof contact.lng === 'number') {
        list.push({ id: contact.id, lat: contact.lat, lng: contact.lng, label: contact.name, severity: 'medium' });
      }
    });
    geofences.forEach(fence => {
      list.push({
        id: fence.id,
        lat: fence.lat,
        lng: fence.lng,
        label: fence.name,
        severity: fence.kind === 'safe' ? 'low' : 'high',
      });
    });
    return list;
  }, [device.position, settings.contacts, geofences, settings.emergencyMode, t]);

  const handleShare = async () => {
    if (!device.position) {
      setError('Acquire your location before sharing.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const chosen = SHARE_DURATIONS.find(d => d.id === duration);
      const ttlSeconds = chosen?.seconds ?? UNTIL_DISABLED_TTL_SECONDS;
      const result = await actors.safeLocation.shareLocation(
        device.position.lat,
        device.position.lng,
        device.position.accuracy !== undefined ? [device.position.accuracy] : [],
        BigInt(ttlSeconds),
        recipient ? [recipient] : [],
        label ? [label] : []
      );
      if ('ok' in result) {
        const url = buildShareUrl(result.ok);
        setLastShareUrl(url);
        const copied = await copyToClipboard(url);
        toast(
          copied
            ? `${t('safe.liveSharing')} — link copiado`
            : `${t('safe.liveSharing')} — ${url}`,
          'success'
        );
        setLabel('');
        setRecipient('');
        await loadShares();
      } else {
        setError(String((result as { err: string }).err));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (token: string) => {
    try {
      const result = await actors.safeLocation.revokeShare(token);
      if ('err' in result) {
        setError(String((result as { err: string }).err));
      } else {
        toast('Share revoked.', 'success');
        await loadShares();
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const triggerSos = () => {
    persist({ ...settings, emergencyMode: true });
    device.startWatching();
    // TODO(backend): notify every trusted contact with `receive-sos` permission
    // and open an emergency incident in the safe_location canister.
    toast(t('safe.sosActive'), 'error');
  };

  const handleCopyLink = async (token: string) => {
    const url = buildShareUrl(token);
    const copied = await copyToClipboard(url);
    toast(copied ? 'Link copiado.' : url, copied ? 'success' : 'info');
  };

  const formatExpiry = (ns: bigint) => new Date(Number(ns / BigInt(1_000_000))).toLocaleString();

  return (
    <div className="page safe-page">
      <PageHeader
        icon="📍"
        title={t('safe.title')}
        subtitle={t('safe.subtitle')}
        badge={<span className="badge-beta">{t('common.beta')}</span>}
        actions={
          <div className="safe-header-actions">
            <button
              type="button"
              className={`safe-sos${settings.emergencyMode ? ' safe-sos-active' : ''}`}
              onClick={triggerSos}
              aria-label={t('safe.sos')}
            >
              🆘 {t('safe.sos')}
            </button>
            {settings.emergencyMode && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  persist({ ...settings, emergencyMode: false });
                  device.stopWatching();
                }}
              >
                {t('common.disable')} · {t('safe.emergencyMode')}
              </button>
            )}
          </div>
        }
      />

      {settings.emergencyMode && (
        <div className="alert-error mt-2" role="alert">
          🆘 {t('safe.sosActive')} — trusted contacts with SOS permission will be notified.
        </div>
      )}
      {error && <div className="alert-error mt-2">{error}</div>}
      {device.error && <div className="alert-error mt-2">{device.error}</div>}

      <div className="safe-tabs" role="tablist" aria-label={t('safe.title')}>
        {TABS.map(item => (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={tab === item.id}
            className={`safe-tab${tab === item.id ? ' safe-tab-active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            <span aria-hidden="true">{item.icon}</span> {item.label}
          </button>
        ))}
      </div>

      {tab === 'map' && (
        <div className="safe-grid">
          <div className="safe-map-col">
            <MapPlaceholder
              center={device.position ?? undefined}
              markers={markers}
              height={380}
              clusters={markers.length > 3}
              caption={`${t('safe.familyMap')} — OpenStreetMap preview`}
            />
            <p className="text-muted safe-map-note">
              {t('safe.familyMap')} · {settings.contacts.length} contact(s), {geofences.length} zone(s).
              {/* TODO(backend): stream contact positions from the safe_location canister. */}
            </p>
          </div>

          <div className="safe-side-col">
            <section className="card safe-panel">
              <h2 className="section-title">📱 {t('safe.device')}</h2>
              {device.position ? (
                <dl className="safe-device">
                  <div>
                    <dt>Latitude</dt>
                    <dd>{device.position.lat.toFixed(6)}</dd>
                  </div>
                  <div>
                    <dt>Longitude</dt>
                    <dd>{device.position.lng.toFixed(6)}</dd>
                  </div>
                  <div>
                    <dt>Accuracy</dt>
                    <dd>{device.position.accuracy ? `${Math.round(device.position.accuracy)} m` : '—'}</dd>
                  </div>
                  <div>
                    <dt>Updated</dt>
                    <dd>{new Date(device.position.at).toLocaleTimeString()}</dd>
                  </div>
                </dl>
              ) : (
                <EmptyState icon="📡" title="Location not acquired" body="Allow location access to enable sharing and geofences." />
              )}

              <div className="safe-device-actions">
                <button type="button" className="btn-secondary safe-mini-btn" onClick={device.locate} disabled={device.loading}>
                  📡 {device.loading ? t('common.loading') : t('safe.locate')}
                </button>
                <button
                  type="button"
                  className="btn-secondary safe-mini-btn"
                  onClick={device.watching ? device.stopWatching : device.startWatching}
                >
                  {device.watching ? '⏹ Stop live tracking' : '▶ Start live tracking'}
                </button>
              </div>

              <Toggle
                label="High accuracy"
                description="Uses GNSS when available. Higher battery consumption."
                checked={settings.highAccuracy}
                onChange={value => persist({ ...settings, highAccuracy: value })}
              />
              <Toggle
                label="Share battery level"
                description="Include the device battery level with each update."
                checked={settings.shareBattery}
                onChange={value => persist({ ...settings, shareBattery: value })}
              />
            </section>

            <section className="card safe-panel">
              <h2 className="section-title">📤 {t('safe.liveSharing')}</h2>

              <fieldset className="safe-duration">
                <legend className="field-label">{t('safe.duration')}</legend>
                {SHARE_DURATIONS.map(option => (
                  <label key={option.id} className={`safe-chip${duration === option.id ? ' safe-chip-active' : ''}`}>
                    <input
                      type="radio"
                      name="share-duration"
                      value={option.id}
                      checked={duration === option.id}
                      onChange={() => {
                        setDuration(option.id);
                        persist({ ...settings, defaultDuration: option.id });
                      }}
                    />
                    {t(option.labelKey)}
                  </label>
                ))}
              </fieldset>

              <label className="field">
                <span className="field-label">Label ({t('common.optional')})</span>
                <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Home, work…" />
              </label>

              <label className="field">
                <span className="field-label">Recipient principal ({t('common.optional')})</span>
                <input value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="xxxxx-…-cai" />
              </label>

              <button
                type="button"
                className="btn-primary safe-share-btn"
                onClick={handleShare}
                disabled={submitting || !device.position}
              >
                {submitting ? t('common.loading') : `📤 ${t('safe.liveSharing')}`}
              </button>
            </section>

            <section className="card safe-panel">
              <h2 className="section-title">🔗 Active shares</h2>
              {lastShareUrl && (
                <p className="text-muted safe-list-sub">
                  Último link: <a href={lastShareUrl}>{lastShareUrl}</a>
                </p>
              )}
              {loading ? (
                <div className="spinner" role="status" aria-label={t('common.loading')} />
              ) : activeShares.length === 0 ? (
                <EmptyState icon="🔗" title="No active shares" body="Start a share to let your trusted contacts follow you." />
              ) : (
                <ul className="safe-list">
                  {activeShares.map(share => (
                    <li key={share.token} className="safe-list-item">
                      <div className="safe-list-head">
                        <code className="safe-token">{share.token}</code>
                        <span className="badge badge-green">active</span>
                        <button
                          type="button"
                          className="btn-secondary safe-mini-btn"
                          onClick={() => void handleCopyLink(share.token)}
                        >
                          🔗 Copy link
                        </button>
                        <button
                          type="button"
                          className="btn-danger safe-mini-btn"
                          onClick={() => handleRevoke(share.token)}
                        >
                          🗑 Revoke
                        </button>
                      </div>
                      <span className="text-muted safe-list-sub">Expires: {formatExpiry(share.expiresAt)}</span>
                      {share.recipient.length > 0 && (
                        <span className="text-muted safe-list-sub">
                          Recipient: <code>{share.recipient[0]}</code>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}

      {tab === 'contacts' && (
        <TrustedContacts
          contacts={settings.contacts}
          onChange={contacts => persist({ ...settings, contacts })}
        />
      )}

      {tab === 'geofences' && (
        <Geofences
          geofences={geofences}
          onAdd={handleAddGeofence}
          onDelete={handleDeleteGeofence}
          position={device.position}
          loading={geofencesLoading}
          busy={geofenceBusy}
        />
      )}

      {tab === 'history' && (
        <section className="card safe-panel">
          <h2 className="section-title">🕘 {t('safe.history')}</h2>
          <EmptyState
            icon="🕘"
            title="Location history is not recorded yet"
            body="History will be available once the safe_location canister exposes a history endpoint. Nothing is stored on this device today."
          />
          {/* TODO(backend): read location history from the safe_location canister. */}
        </section>
      )}
    </div>
  );
}
