import React from 'react';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

interface Props {
  /** Centre of the viewport. */
  center?: { lat: number; lng: number };
  markers?: MapMarker[];
  height?: number | string;
  /** Visual layers requested by the parent module. */
  heatmap?: boolean;
  clusters?: boolean;
  caption?: string;
  children?: React.ReactNode;
}

const SEVERITY_COLOR: Record<NonNullable<MapMarker['severity']>, string> = {
  low: 'var(--accent-cyan)',
  medium: 'var(--accent-amber)',
  high: '#ff7a45',
  critical: 'var(--accent-red)',
};

/**
 * OpenStreetMap surface placeholder.
 *
 * The production implementation will mount Leaflet (OpenStreetMap tiles,
 * `leaflet.markercluster` and `leaflet.heat`) on this container. Keeping the
 * public props identical to the future Leaflet wrapper means the modules that
 * consume it — Radar Global, Safe Location, Family Map — will not change.
 *
 * TODO(backend): replace the placeholder surface with a real Leaflet map and
 * feed markers from the threat intelligence / safe location canisters.
 */
export default function MapPlaceholder({
  center,
  markers = [],
  height = 420,
  heatmap = false,
  clusters = false,
  caption,
  children,
}: Props) {
  return (
    <div
      className="map-surface"
      style={{ height }}
      role="img"
      aria-label={
        caption ??
        `OpenStreetMap preview${markers.length ? ` with ${markers.length} markers` : ''}`
      }
    >
      <div className={`map-grid${heatmap ? ' map-grid-heat' : ''}`} aria-hidden="true" />

      <div className="map-badges">
        <span className="badge badge-cyan">OpenStreetMap</span>
        {heatmap && <span className="badge badge-amber">Heatmap</span>}
        {clusters && <span className="badge badge-green">Clusters</span>}
      </div>

      {/* Markers are positioned with a simple equirectangular projection so the
          preview is deterministic without a tile engine. */}
      {markers.map(marker => {
        const left = ((marker.lng + 180) / 360) * 100;
        const top = ((90 - marker.lat) / 180) * 100;
        return (
          <span
            key={marker.id}
            className="map-marker"
            title={marker.label}
            style={{
              left: `${left}%`,
              top: `${top}%`,
              background: SEVERITY_COLOR[marker.severity ?? 'low'],
            }}
          />
        );
      })}

      {children}

      <div className="map-footer">
        <span>
          {center
            ? `${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`
            : 'Location not set'}
        </span>
        <span className="map-attribution">© OpenStreetMap contributors</span>
      </div>
    </div>
  );
}
