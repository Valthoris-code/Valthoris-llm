import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';
import MapPlaceholder from '../components/ui/MapPlaceholder';
import { useActorsReady } from '../hooks/useActors';
import { useAuth } from '../hooks/useAuth';
import type { LocationData } from '../../../declarations/safe_location/index.d.ts';

/**
 * Public resolver for a safe-location share link (`/share/:token`).
 *
 * The token is extracted from the URL and resolved by the `safe_location`
 * canister, which is the sole authority on validity: it checks revocation,
 * expiry and — for shares bound to a named recipient — that the caller's
 * principal matches. Anonymous visitors can therefore only resolve tokens
 * created without a recipient.
 *
 * The call is deliberately deferred until `useActorsReady` reports that the
 * session has been restored; issuing it earlier would use the anonymous agent
 * and a legitimate recipient would be told "Access denied" after a reload.
 */
export default function SharedLocation() {
  const { token = '' } = useParams<{ token: string }>();
  const { actors, ready } = useActorsReady();
  const { isAuthenticated, login } = useAuth();

  const [location, setLocation] = useState<LocationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!token) {
      setError('Missing share token.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await actors.safeLocation.getSharedLocation(token);
      if ('ok' in res) {
        setLocation(res.ok);
      } else {
        setLocation(null);
        setError(String((res as { err: string }).err));
      }
    } catch (e) {
      setLocation(null);
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [actors, token]);

  useEffect(() => {
    if (!ready) return;
    void load();
  }, [ready, load]);

  const label = location?.locationLabel?.[0];
  const accuracy = location?.accuracy?.[0];

  return (
    <div className="page">
      <PageHeader
        icon="🔗"
        title="Localização partilhada"
        subtitle={`Token: ${token || '—'}`}
      />

      {!isAuthenticated && (
        <p className="text-muted" style={{ fontSize: '0.85rem' }}>
          Se esta partilha estiver associada a um destinatário específico, tem de iniciar
          sessão com esse Internet Identity para a consultar.
        </p>
      )}

      {loading ? (
        <div className="spinner" role="status" aria-label="A carregar" />
      ) : error ? (
        <EmptyState
          icon="🚫"
          title="Ligação indisponível"
          body={error}
          action={
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button type="button" className="btn-secondary" onClick={() => void load()}>
                🔄 Tentar novamente
              </button>
              {!isAuthenticated && (
                <button type="button" className="btn-primary" onClick={() => void login()}>
                  🔐 Iniciar sessão com Internet Identity
                </button>
              )}
            </div>
          }
        />
      ) : location ? (
        <>
          <MapPlaceholder
            center={{ lat: location.latitude, lng: location.longitude }}
            markers={[
              {
                id: token,
                lat: location.latitude,
                lng: location.longitude,
                label: label ?? 'Localização partilhada',
                severity: 'medium',
              },
            ]}
            height={380}
            caption="OpenStreetMap"
          />
          <section className="card mt-2">
            <dl className="safe-device">
              <div>
                <dt>Latitude</dt>
                <dd>{location.latitude.toFixed(6)}</dd>
              </div>
              <div>
                <dt>Longitude</dt>
                <dd>{location.longitude.toFixed(6)}</dd>
              </div>
              <div>
                <dt>Precisão</dt>
                <dd>{typeof accuracy === 'number' ? `${Math.round(accuracy)} m` : '—'}</dd>
              </div>
              <div>
                <dt>Actualizado</dt>
                <dd>{new Date(Number(location.timestamp / BigInt(1_000_000))).toLocaleString()}</dd>
              </div>
              {label && (
                <div>
                  <dt>Etiqueta</dt>
                  <dd>{label}</dd>
                </div>
              )}
            </dl>
            <button type="button" className="btn-secondary mt-2" onClick={() => void load()}>
              🔄 Actualizar
            </button>
          </section>
        </>
      ) : (
        <EmptyState icon="📡" title="Sem dados de localização" body="Esta partilha ainda não tem coordenadas." />
      )}
    </div>
  );
}
