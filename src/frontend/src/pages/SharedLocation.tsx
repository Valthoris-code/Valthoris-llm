import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';
import MapPlaceholder from '../components/ui/MapPlaceholder';
import { useActors } from '../hooks/useActors';
import type { LocationData } from '../../../declarations/safe_location/index.d.ts';

/**
 * Public resolver for a safe-location share link (`/share/:token`).
 *
 * Anonymous visitors can resolve tokens that were created without a named
 * recipient; tokens bound to a recipient principal require that principal to
 * be signed in, and the canister enforces that.
 */
export default function SharedLocation() {
  const { token = '' } = useParams<{ token: string }>();
  const actors = useActors();

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
    void load();
  }, [load]);

  const label = location?.locationLabel?.[0];
  const accuracy = location?.accuracy?.[0];

  return (
    <div className="page">
      <PageHeader
        icon="🔗"
        title="Localização partilhada"
        subtitle={`Token: ${token || '—'}`}
      />

      {loading ? (
        <div className="spinner" role="status" aria-label="A carregar" />
      ) : error ? (
        <EmptyState
          icon="🚫"
          title="Ligação indisponível"
          body={error}
          action={
            <button type="button" className="btn-secondary" onClick={() => void load()}>
              🔄 Tentar novamente
            </button>
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
