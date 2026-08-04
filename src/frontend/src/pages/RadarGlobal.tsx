import React, { useMemo, useState } from 'react';
import MapPlaceholder from '../components/ui/MapPlaceholder';
import EmptyState from '../components/ui/EmptyState';
import { useI18n } from '../i18n/useI18n';

const REGIONS = ['All', 'Europe', 'Americas', 'Asia', 'Africa', 'Oceania'];
const SEVERITIES = ['All', 'Low', 'Medium', 'High', 'Critical'] as const;
const CATEGORIES = ['All', 'Phishing', 'Malware', 'Fraud', 'Scam Call', 'Crypto', 'Identity Theft'];

type LayerId = 'heatmap' | 'clusters' | 'markers' | 'timeline';

const LAYERS: Array<{ id: LayerId; labelKey: string }> = [
  { id: 'heatmap', labelKey: 'radar.heatmap' },
  { id: 'clusters', labelKey: 'radar.clusters' },
  { id: 'markers', labelKey: 'radar.markers' },
  { id: 'timeline', labelKey: 'radar.timeline' },
];

/**
 * Radar Global — global threat map.
 *
 * The filters, layers and timeline are fully wired in the UI. The map surface
 * is the shared OpenStreetMap placeholder; swapping it for Leaflet will not
 * require changes here.
 *
 * TODO(backend): load geo-tagged threat events from the threat_intelligence
 * canister and feed them into the layers below.
 */
export default function RadarGlobal() {
  const { t } = useI18n();

  const [region, setRegion] = useState('All');
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number]>('All');
  const [category, setCategory] = useState('All');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [date, setDate] = useState('');
  const [layers, setLayers] = useState<LayerId[]>(['heatmap', 'markers']);
  const [timelineHour, setTimelineHour] = useState(23);

  const toggleLayer = (id: LayerId) =>
    setLayers(prev => (prev.includes(id) ? prev.filter(l => l !== id) : [...prev, id]));

  const activeFilters = useMemo(
    () =>
      [
        region !== 'All' ? region : null,
        severity !== 'All' ? severity : null,
        category !== 'All' ? category : null,
        country || null,
        city || null,
        date || null,
      ].filter(Boolean) as string[],
    [region, severity, category, country, city, date]
  );

  return (
    <div className="page radar-page">
      <div className="radar-toolbar">
        <div className="radar-brand">
          <span aria-hidden="true">🗺</span>
          <strong>{t('radar.title')}</strong>
          <span className="badge-beta">{t('common.beta')}</span>
        </div>

        <div className="radar-layers" role="group" aria-label={t('radar.filters')}>
          {LAYERS.map(layer => (
            <button
              key={layer.id}
              type="button"
              aria-pressed={layers.includes(layer.id)}
              className={`radar-chip${layers.includes(layer.id) ? ' radar-chip-active' : ''}`}
              onClick={() => toggleLayer(layer.id)}
            >
              {t(layer.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="radar-filters">
        <label className="field">
          <span className="field-label">Region</span>
          <select value={region} onChange={e => setRegion(e.target.value)}>
            {REGIONS.map(r => (
              <option key={r} value={r}>
                {r === 'All' ? t('common.all') : r}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">{t('radar.country')}</span>
          <input value={country} onChange={e => setCountry(e.target.value)} placeholder="Portugal" />
        </label>

        <label className="field">
          <span className="field-label">{t('radar.city')}</span>
          <input value={city} onChange={e => setCity(e.target.value)} placeholder="Lisboa" />
        </label>

        <label className="field">
          <span className="field-label">{t('radar.severity')}</span>
          <select value={severity} onChange={e => setSeverity(e.target.value as typeof severity)}>
            {SEVERITIES.map(s => (
              <option key={s} value={s}>
                {s === 'All' ? t('common.all') : s}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">{t('radar.category')}</span>
          <select value={category} onChange={e => setCategory(e.target.value)}>
            {CATEGORIES.map(c => (
              <option key={c} value={c}>
                {c === 'All' ? t('common.all') : c}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">{t('radar.date')}</span>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </label>
      </div>

      {activeFilters.length > 0 && (
        <div className="radar-active-filters">
          <span className="text-muted">{t('radar.filters')}:</span>
          {activeFilters.map(filter => (
            <span key={filter} className="badge badge-cyan">
              {filter}
            </span>
          ))}
          <button
            type="button"
            className="btn-secondary radar-clear"
            onClick={() => {
              setRegion('All');
              setSeverity('All');
              setCategory('All');
              setCountry('');
              setCity('');
              setDate('');
            }}
          >
            {t('common.cancel')}
          </button>
        </div>
      )}

      <MapPlaceholder
        height={420}
        heatmap={layers.includes('heatmap')}
        clusters={layers.includes('clusters')}
        markers={[]}
        caption={`${t('radar.title')} — OpenStreetMap preview`}
      >
        <div className="radar-overlay">
          <EmptyState
            icon="🛰"
            title="No threat events loaded"
            body="Leaflet + OpenStreetMap layers are prepared. Events will appear once the threat intelligence feed is connected."
          />
        </div>
      </MapPlaceholder>

      {layers.includes('timeline') && (
        <div className="radar-timeline">
          <label className="field">
            <span className="field-label">
              {t('radar.timeline')} — {String(timelineHour).padStart(2, '0')}:00
            </span>
            <input
              type="range"
              min={0}
              max={23}
              value={timelineHour}
              onChange={e => setTimelineHour(Number(e.target.value))}
              aria-label={t('radar.timeline')}
            />
          </label>
        </div>
      )}

      <div className="radar-stats">
        {[
          { label: 'Active threats', value: '—' },
          { label: 'Reports today', value: '—' },
          { label: 'Countries', value: '—' },
          { label: 'Last update', value: 'Pending' },
        ].map(stat => (
          <div key={stat.label} className="radar-stat">
            <strong>{stat.value}</strong>
            <span className="text-muted">{stat.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
