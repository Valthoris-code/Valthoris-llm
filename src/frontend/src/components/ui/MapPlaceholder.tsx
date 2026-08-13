import React, { useEffect } from 'react';
import { Circle, MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet's default icon paths when bundled with Vite/webpack
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)['_getIconUrl'];
L.Icon.Default.mergeOptions({
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  iconUrl:       new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href,
  shadowUrl:     new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href,
});

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
  /** Optional safety radius drawn around a point (Safe Rooms). */
  circle?: { lat: number; lng: number; radiusMeters: number };
  /** Zoom level. Defaults to a world view; room/city views pass a closer one. */
  zoom?: number;
  markers?: MapMarker[];
  height?: number | string;
  /** Visual layers requested by the parent module (reserved for future use). */
  heatmap?: boolean;
  clusters?: boolean;
  caption?: string;
  children?: React.ReactNode;
}

const DEFAULT_CENTER: [number, number] = [38.736, -9.142]; // Lisbon

const SEVERITY_COLOR: Record<NonNullable<MapMarker['severity']>, string> = {
  low:      '#00d4ff',
  medium:   '#ffaa00',
  high:     '#ff7a45',
  critical: '#ff3366',
};

function markerIcon(severity?: MapMarker['severity']) {
  const color = SEVERITY_COLOR[severity ?? 'low'];
  const svg = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36">` +
    `<path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 24 12 24s12-15 12-24C24 5.37 18.63 0 12 0z" fill="${color}"/>` +
    `<circle cx="12" cy="12" r="5" fill="#041426"/>` +
    `</svg>`
  );
  return L.icon({
    iconUrl:    `data:image/svg+xml,${svg}`,
    iconSize:   [24, 36],
    iconAnchor: [12, 36],
    popupAnchor:[0, -36],
  });
}

/** Invalidates the map size after mount so tiles render correctly in flex/grid layouts. */
function MapResizer() {
  const map = useMap();
  useEffect(() => {
    const id = setTimeout(() => map.invalidateSize(), 150);
    return () => clearTimeout(id);
  }, [map]);
  return null;
}

/**
 * OpenStreetMap surface using Leaflet + react-leaflet.
 *
 * Props are intentionally kept identical to the previous MapPlaceholder so
 * all consumers (Radar Global, Safe Location) do not need changes.
 *
 * TODO(backend): wire markers from the threat_intelligence / safe_location
 * canisters once those data feeds are connected.
 */
export default function MapPlaceholder({
  center,
  circle,
  zoom,
  markers = [],
  height = 420,
  heatmap = false,
  clusters = false,
  caption,
  children,
}: Props) {
  const mapCenter: [number, number] = center
    ? [center.lat, center.lng]
    : DEFAULT_CENTER;

  return (
    <div
      className="map-surface"
      style={{ height, position: 'relative' }}
      role="region"
      aria-label={
        caption ??
        `OpenStreetMap${markers.length ? ` with ${markers.length} markers` : ''}`
      }
    >
      <MapContainer
        center={mapCenter}
        zoom={zoom ?? 4}
        style={{ height: '100%', width: '100%', borderRadius: 'inherit' }}
        scrollWheelZoom
        attributionControl
      >
        <MapResizer />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {circle && (
          <Circle
            center={[circle.lat, circle.lng]}
            radius={circle.radiusMeters}
            pathOptions={{ color: '#00d4ff', fillColor: '#00d4ff', fillOpacity: 0.08 }}
          />
        )}
        {markers.map(marker => (
          <Marker
            key={marker.id}
            position={[marker.lat, marker.lng]}
            icon={markerIcon(marker.severity)}
          >
            <Popup>
              <strong>{marker.label}</strong>
              {marker.severity && <div>Severity: {marker.severity}</div>}
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Overlay badges */}
      <div className="map-badges" style={{ zIndex: 1000 }}>
        <span className="badge badge-cyan">OpenStreetMap</span>
        {heatmap && <span className="badge badge-amber">Heatmap</span>}
        {clusters && <span className="badge badge-green">Clusters</span>}
      </div>

      {children}
    </div>
  );
}
