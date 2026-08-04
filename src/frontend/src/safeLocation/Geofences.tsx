import React, { useState } from 'react';
import EmptyState from '../components/ui/EmptyState';
import { createId, distanceMeters } from './model';
import type { Geofence } from './model';
import type { DevicePosition } from './useDeviceLocation';

interface Props {
  geofences: Geofence[];
  onChange: (geofences: Geofence[]) => void;
  position: DevicePosition | null;
}

const EMPTY = { name: '', lat: '', lng: '', radius: '250', kind: 'safe' as Geofence['kind'] };

/** Geofence editor with a live "inside / outside" indicator. */
export default function Geofences({ geofences, onChange, position }: Props) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');

  const addGeofence = (event: React.FormEvent) => {
    event.preventDefault();
    const lat = Number.parseFloat(form.lat);
    const lng = Number.parseFloat(form.lng);
    const radius = Number.parseInt(form.radius, 10);
    if (!form.name.trim() || Number.isNaN(lat) || Number.isNaN(lng) || Number.isNaN(radius)) {
      setError('Provide a name and valid coordinates.');
      return;
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180 || radius <= 0) {
      setError('Coordinates or radius out of range.');
      return;
    }
    setError('');
    onChange([
      ...geofences,
      {
        id: createId('fence'),
        name: form.name.trim(),
        lat,
        lng,
        radiusMeters: radius,
        kind: form.kind,
        notifyOnEnter: true,
        notifyOnExit: true,
      },
    ]);
    setForm(EMPTY);
  };

  const useCurrent = () => {
    if (!position) return;
    setForm(f => ({ ...f, lat: position.lat.toFixed(6), lng: position.lng.toFixed(6) }));
  };

  return (
    <section className="card safe-panel">
      <h2 className="section-title">🧭 Geofences</h2>
      <p className="text-muted safe-panel-desc">
        Define safe zones and alert zones. Entering or leaving a zone will trigger a notification.
      </p>

      <form className="safe-inline-form" onSubmit={addGeofence}>
        <label className="field">
          <span className="field-label">Zone name</span>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
        </label>
        <label className="field">
          <span className="field-label">Latitude</span>
          <input value={form.lat} onChange={e => setForm(f => ({ ...f, lat: e.target.value }))} placeholder="38.7169" required />
        </label>
        <label className="field">
          <span className="field-label">Longitude</span>
          <input value={form.lng} onChange={e => setForm(f => ({ ...f, lng: e.target.value }))} placeholder="-9.1395" required />
        </label>
        <label className="field">
          <span className="field-label">Radius (m)</span>
          <input type="number" min={10} value={form.radius} onChange={e => setForm(f => ({ ...f, radius: e.target.value }))} />
        </label>
        <label className="field">
          <span className="field-label">Type</span>
          <select value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value as Geofence['kind'] }))}>
            <option value="safe">Safe zone</option>
            <option value="alert">Alert zone</option>
          </select>
        </label>
        <div className="safe-inline-actions">
          <button type="button" className="btn-secondary safe-mini-btn" onClick={useCurrent} disabled={!position}>
            📡 Use current
          </button>
          <button type="submit" className="btn-primary safe-mini-btn">
            ➕ Add zone
          </button>
        </div>
      </form>

      {error && <div className="alert-error mt-2">{error}</div>}

      {geofences.length === 0 ? (
        <EmptyState icon="🧭" title="No geofences configured" body="Create a safe zone to be notified on entry and exit." />
      ) : (
        <ul className="safe-list">
          {geofences.map(fence => {
            const inside =
              position && distanceMeters(position, fence) <= fence.radiusMeters;
            return (
              <li key={fence.id} className="safe-list-item">
                <div className="safe-list-head">
                  <span aria-hidden="true" className="safe-avatar">
                    {fence.kind === 'safe' ? '🟢' : '🔴'}
                  </span>
                  <div className="safe-list-text">
                    <strong>{fence.name}</strong>
                    <span className="text-muted safe-list-sub">
                      {fence.lat.toFixed(4)}, {fence.lng.toFixed(4)} · {fence.radiusMeters} m
                    </span>
                  </div>
                  {position && (
                    <span className={`badge ${inside ? 'badge-green' : 'badge-amber'}`}>
                      {inside ? 'Inside' : 'Outside'}
                    </span>
                  )}
                  <button
                    type="button"
                    className="btn-danger safe-mini-btn"
                    onClick={() => onChange(geofences.filter(f => f.id !== fence.id))}
                    aria-label={`Remove ${fence.name}`}
                  >
                    🗑
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
