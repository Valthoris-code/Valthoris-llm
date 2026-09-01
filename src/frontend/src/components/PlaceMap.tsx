/**
 * PlaceMap — the map an assistant answer shows when a real location was found.
 *
 * When Nominatim locates a place, the answer used to carry a bare
 * `openstreetmap.org` link: the user had to open another tab, find the point
 * and only then work out how to get there. This component renders the very
 * coordinates the provider returned, with a marker on the spot, and two actions
 * that start the trip.
 *
 * Two rules it never breaks:
 *   • It only renders coordinates that came from a source report. It never
 *     geocodes anything itself and never guesses a position.
 *   • Geolocation is asked for only when the user presses a travel button, and
 *     a refusal is not a failure: the route still opens, with the origin left
 *     for the user to choose in OpenStreetMap.
 */

import React, { useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface PlaceLocation {
  name: string;
  address?: string;
  lat: number;
  lon: number;
}

/** OSRM profiles served by the public OpenStreetMap routing engine. */
type TravelMode = 'car' | 'foot';

const ENGINE: Record<TravelMode, string> = {
  car: 'fossgis_osrm_car',
  foot: 'fossgis_osrm_foot',
};

const markerIcon = L.icon({
  iconUrl:
    'data:image/svg+xml,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36">' +
        '<path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 24 12 24s12-15 12-24C24 5.37 18.63 0 12 0z" fill="#00d4ff"/>' +
        '<circle cx="12" cy="12" r="5" fill="#041426"/>' +
        '</svg>',
    ),
  iconSize: [24, 36],
  iconAnchor: [12, 36],
  popupAnchor: [0, -36],
});

/** Six decimals is about 10 cm — more digits would only be noise in a URL. */
function coord(value: number): string {
  return value.toFixed(6);
}

/**
 * Builds the OpenStreetMap directions URL.
 *
 * With an origin the route is complete and opens ready to follow; without one
 * (permission refused, or no geolocation available) only the destination is
 * pre-filled and OpenStreetMap asks the user where they are starting from.
 */
export function directionsUrl(
  destination: { lat: number; lon: number },
  mode: TravelMode,
  origin?: { lat: number; lon: number },
): string {
  const route = origin
    ? `${coord(origin.lat)},${coord(origin.lon)};${coord(destination.lat)},${coord(destination.lon)}`
    : `;${coord(destination.lat)},${coord(destination.lon)}`;
  return (
    `https://www.openstreetmap.org/directions?engine=${ENGINE[mode]}` +
    `&route=${encodeURIComponent(route)}`
  );
}

/** Current position, or undefined when it cannot be obtained for any reason. */
function currentPosition(): Promise<{ lat: number; lon: number } | undefined> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve(undefined);
  }
  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      position =>
        resolve({ lat: position.coords.latitude, lon: position.coords.longitude }),
      // A refusal, a timeout or an unavailable sensor are all the same here:
      // the trip still starts, just without a pre-filled origin.
      () => resolve(undefined),
      { enableHighAccuracy: true, timeout: 8_000, maximumAge: 60_000 },
    );
  });
}

export default function PlaceMap({ place }: { place: PlaceLocation }) {
  const [pending, setPending] = useState<TravelMode | null>(null);
  const [originRefused, setOriginRefused] = useState(false);

  const startTrip = async (mode: TravelMode) => {
    setPending(mode);
    let origin: { lat: number; lon: number } | undefined;
    try {
      origin = await currentPosition();
    } finally {
      setPending(null);
    }
    setOriginRefused(!origin);
    window.open(
      directionsUrl({ lat: place.lat, lon: place.lon }, mode, origin),
      '_blank',
      'noopener,noreferrer',
    );
  };

  return (
    <div className="ai-place-map">
      <div className="ai-place-map-surface">
        <MapContainer
          center={[place.lat, place.lon]}
          zoom={16}
          scrollWheelZoom={false}
          style={{ height: '100%', width: '100%' }}
          attributionControl
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={[place.lat, place.lon]} icon={markerIcon}>
            <Popup>
              <strong>{place.name}</strong>
              {place.address && <div>{place.address}</div>}
            </Popup>
          </Marker>
        </MapContainer>
      </div>

      <div className="ai-place-actions">
        <button
          type="button"
          className="ai-place-btn"
          disabled={pending !== null}
          onClick={() => void startTrip('car')}
        >
          🚗 {pending === 'car' ? 'A localizar…' : 'Iniciar viagem (carro)'}
        </button>
        <button
          type="button"
          className="ai-place-btn"
          disabled={pending !== null}
          onClick={() => void startTrip('foot')}
        >
          🚶 {pending === 'foot' ? 'A localizar…' : 'Iniciar viagem (a pé)'}
        </button>
      </div>
      {originRefused && (
        <div className="ai-place-hint">
          Sem acesso à sua localização: a rota abre com o destino preenchido e a origem
          à sua escolha no OpenStreetMap.
        </div>
      )}
    </div>
  );
}
