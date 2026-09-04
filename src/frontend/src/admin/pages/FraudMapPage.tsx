/**
 * /admin/fraud-map — Mapa de Denúncias.
 *
 * Only the reports that genuinely carry a position are plotted. A report
 * without coordinates is not guessed, geocoded or placed at an arbitrary
 * centre: it is counted apart, so the map never suggests a coverage the data
 * does not have.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  CATEGORY_LABELS,
  SEVERITY_LABELS,
  STATUS_LABELS,
  TARGET_LABELS,
  fetchFraudMap,
} from '../adminApi';
import type { FraudMapResult } from '../adminApi';
import { ADMIN_GENERIC_ERROR } from '../adminClient';
import { EmptyState, Stat, formatDate } from './commandCenterUi';

/** Marker colour by severity, drawn inline so the page makes no extra request. */
const MARKER_COLOUR: Record<string, string> = {
  CRITICAL: '#ff4757',
  HIGH: '#ff7f50',
  MEDIUM: '#ffc048',
  LOW: '#00d4ff',
  UNKNOWN: '#8f9bb3',
};

function markerIcon(severity: string): L.Icon {
  const colour = MARKER_COLOUR[severity] ?? MARKER_COLOUR.UNKNOWN;
  return L.icon({
    iconUrl:
      'data:image/svg+xml,' +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36">' +
          `<path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 24 12 24s12-15 12-24C24 5.37 18.63 0 12 0z" fill="${colour}"/>` +
          '<circle cx="12" cy="12" r="5" fill="#041426"/>' +
          '</svg>',
      ),
    iconSize: [24, 36],
    iconAnchor: [12, 36],
    popupAnchor: [0, -36],
  });
}

export default function FraudMapPage() {
  const [data, setData] = useState<FraudMapResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchFraudMap()
      .then(result => {
        if (cancelled) return;
        setData(result);
        setError(null);
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

  const points = data?.located ?? [];

  /** The view is derived from the points themselves — never a hardcoded city. */
  const bounds = useMemo(() => {
    if (points.length === 0) return null;
    return L.latLngBounds(points.map(point => [point.latitude, point.longitude] as [number, number]));
  }, [points]);

  return (
    <>
      <h1 className="vadmin-page-title">Mapa de Denúncias</h1>
      <p className="vadmin-page-sub">
        Apenas as denúncias que têm coordenadas conhecidas. Nenhuma posição é inferida.
      </p>

      {error && <div className="vadmin-alert" role="alert">{error}</div>}
      {loading && !data && <EmptyState>A carregar o mapa…</EmptyState>}

      {data && (
        <>
          <div className="vadmin-grid" style={{ marginBottom: '1.2rem' }}>
            <Stat
              label="Denúncias no mapa"
              value={points.length}
              hint="Com latitude e longitude registadas"
            />
            <Stat
              label="Sem localização"
              value={data.withoutLocation}
              hint="Registadas, mas sem coordenadas"
            />
            <Stat
              label="Total de denúncias"
              value={data.totalReports}
              hint="Em public.fraud_reports"
            />
          </div>

          {points.length === 0 ? (
            <EmptyState>
              {data.totalReports === 0
                ? 'Ainda não existe nenhuma denúncia registada.'
                : 'Nenhuma das denúncias registadas tem coordenadas, por isso o mapa está vazio.'}
            </EmptyState>
          ) : (
            <div className="vadmin-card" style={{ padding: 0, overflow: 'hidden' }}>
              <MapContainer
                bounds={bounds ?? undefined}
                boundsOptions={{ padding: [40, 40], maxZoom: 12 }}
                scrollWheelZoom
                style={{ height: 460, width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {points.map(point => (
                  <Marker
                    key={point.id}
                    position={[point.latitude, point.longitude]}
                    icon={markerIcon(point.severity)}
                  >
                    <Popup>
                      <strong>{CATEGORY_LABELS[point.category] ?? point.category}</strong>
                      <br />
                      {TARGET_LABELS[point.target_type] ?? point.target_type}: {point.target_value}
                      <br />
                      {SEVERITY_LABELS[point.severity] ?? point.severity} ·{' '}
                      {STATUS_LABELS[point.status] ?? point.status}
                      <br />
                      {[point.city, point.country].filter(Boolean).join(', ')}
                      <br />
                      {formatDate(point.created_at)}
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          )}
        </>
      )}
    </>
  );
}
