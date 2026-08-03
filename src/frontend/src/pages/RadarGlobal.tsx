import React, { useState } from 'react';

const FILTERS = ['All', 'Europe', 'Americas', 'Asia', 'Africa', 'Oceania'];
const LAYERS  = ['Heatmap', 'Clusters', 'Live Feed', 'Timeline'];

export default function RadarGlobal() {
  const [activeFilter, setActiveFilter] = useState('All');
  const [activeLayers, setActiveLayers] = useState<string[]>(['Heatmap']);
  const [search, setSearch] = useState('');

  const toggleLayer = (l: string) =>
    setActiveLayers(prev => prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l]);

  return (
    <div className="page" style={{ padding: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div style={{
        padding: '0.75rem 1.5rem',
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        flexWrap: 'wrap',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.2rem' }}>🗺</span>
          <strong>Radar Global</strong>
          <span className="badge-beta">BETA</span>
        </div>

        <input
          style={{ maxWidth: 220, marginLeft: 'auto' }}
          type="text"
          placeholder="Search location…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        {/* Region filters */}
        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              style={{
                background: activeFilter === f ? 'rgba(0,212,255,0.15)' : 'none',
                border: `1px solid ${activeFilter === f ? 'var(--accent-cyan)' : 'var(--border)'}`,
                color: activeFilter === f ? 'var(--accent-cyan)' : 'var(--text-muted)',
                borderRadius: 6,
                padding: '0.2rem 0.6rem',
                fontSize: '0.78rem',
                cursor: 'pointer',
              }}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Layer toggles */}
        <div style={{ display: 'flex', gap: '0.3rem' }}>
          {LAYERS.map(l => (
            <button
              key={l}
              onClick={() => toggleLayer(l)}
              style={{
                background: activeLayers.includes(l) ? 'rgba(0,255,136,0.12)' : 'none',
                border: `1px solid ${activeLayers.includes(l) ? 'var(--accent-green)' : 'var(--border)'}`,
                color: activeLayers.includes(l) ? 'var(--accent-green)' : 'var(--text-muted)',
                borderRadius: 6,
                padding: '0.2rem 0.6rem',
                fontSize: '0.78rem',
                cursor: 'pointer',
              }}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Map placeholder */}
      <div style={{
        flex: 1,
        background: 'linear-gradient(135deg, #041426 0%, #071e33 50%, #041426 100%)',
        position: 'relative',
        overflow: 'hidden',
        minHeight: 400,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {/* Grid lines to simulate map */}
        <svg
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.08 }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#00d4ff" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* Placeholder dots */}
        {[
          { top: '30%', left: '25%', color: 'var(--accent-red)',   label: 'EU Cluster' },
          { top: '40%', left: '18%', color: 'var(--accent-amber)', label: 'NA Activity' },
          { top: '35%', left: '60%', color: 'var(--accent-cyan)',  label: 'APAC Threats' },
          { top: '55%', left: '30%', color: 'var(--accent-red)',   label: 'Africa' },
          { top: '20%', left: '70%', color: 'var(--accent-amber)', label: 'East Asia' },
        ].map((dot, i) => (
          <div
            key={i}
            title={dot.label}
            style={{
              position: 'absolute',
              top: dot.top,
              left: dot.left,
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: dot.color,
              boxShadow: `0 0 12px ${dot.color}`,
              animation: 'pulse 2s ease-in-out infinite',
              cursor: 'pointer',
            }}
          />
        ))}

        {/* Center message */}
        <div style={{ textAlign: 'center', zIndex: 1 }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.4 }}>🗺</div>
          <h3 style={{ color: 'var(--text-muted)', margin: 0 }}>Interactive Map Coming Soon</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>
            Leaflet + OpenStreetMap integration prepared.
            <br />Clusters, heatmap, and timeline layers ready to connect.
          </p>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            {['Leaflet', 'OpenStreetMap', 'Clusters', 'Heatmap', 'Timeline'].map(t => (
              <span key={t} className="badge badge-cyan" style={{ fontSize: '0.72rem' }}>{t}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div style={{
        padding: '0.6rem 1.5rem',
        background: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        gap: '2rem',
        fontSize: '0.8rem',
        color: 'var(--text-muted)',
        flexShrink: 0,
      }}>
        {[
          { label: 'Active Threats', value: '—', color: 'var(--accent-red)' },
          { label: 'Reports Today',  value: '—', color: 'var(--accent-amber)' },
          { label: 'Countries',      value: '—', color: 'var(--accent-cyan)' },
          { label: 'Last Update',    value: 'Pending', color: 'var(--text-muted)' },
        ].map(s => (
          <div key={s.label}>
            <span style={{ color: s.color, fontWeight: 700 }}>{s.value}</span>
            {' '}<span>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
