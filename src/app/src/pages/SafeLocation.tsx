import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActors } from '../hooks/useActors';
import { useAuth } from '../hooks/useAuth';
import type { ShareInfo } from '../../../declarations/safe_location/index.d.ts';

export default function SafeLocation() {
  const { isAuthenticated } = useAuth();
  const actors = useActors();
  const navigate = useNavigate();

  const [shares, setShares]       = useState<ShareInfo[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');

  // Share form
  const [lat, setLat]             = useState('');
  const [lng, setLng]             = useState('');
  const [ttl, setTtl]             = useState('3600');
  const [label, setLabel]         = useState('');
  const [recipient, setRecipient] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) { navigate('/'); return; }
    loadShares();
  }, [isAuthenticated]);

  const loadShares = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await actors.safeLocation.listMyShares();
      setShares(raw);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [actors]);

  const useCurrentLocation = () => {
    navigator.geolocation.getCurrentPosition(pos => {
      setLat(String(pos.coords.latitude));
      setLng(String(pos.coords.longitude));
    }, () => setError('Não foi possível obter a localização.'));
  };

  const handleShare = async () => {
    const latitude  = parseFloat(lat);
    const longitude = parseFloat(lng);
    if (isNaN(latitude) || isNaN(longitude)) { setError('Coordenadas inválidas.'); return; }

    setSubmitting(true);
    setError('');
    try {
      const ttlSec = BigInt(parseInt(ttl, 10));
      const res = await actors.safeLocation.shareLocation(
        latitude, longitude,
        [],           // accuracy — optional
        ttlSec,
        recipient ? [recipient] : [],
        label ? [label] : []
      );
      if ('ok' in res) {
        setSuccess('Partilha criada! Token: ' + res.ok);
        setLat(''); setLng(''); setLabel(''); setRecipient('');
        await loadShares();
      } else {
        setError((res as any).err);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (token: string) => {
    try {
      const res = await actors.safeLocation.revokeShare(token);
      if ('err' in res) setError((res as any).err);
      else await loadShares();
    } catch (e) {
      setError(String(e));
    }
  };

  const formatExpiry = (ns: bigint) => {
    const ms = Number(ns / BigInt(1_000_000));
    return new Date(ms).toLocaleString('pt-PT');
  };

  return (
    <div className="page">
      <h1>📍 Local Seguro</h1>
      <p className="text-muted">Partilhe a sua localização de forma temporária e segura com quem escolher.</p>

      {error   && <div className="alert-error   mt-2">{error}</div>}
      {success && <div className="alert-success mt-2">{success}</div>}

      {/* Share form */}
      <div className="card mt-2" style={{ maxWidth: 620 }}>
        <h3>Nova Partilha de Localização</h3>
        <div className="flex gap-1 mt-2">
          <div style={{ flex: 1 }}>
            <label className="text-muted" style={{ fontSize: '0.88rem' }}>Latitude</label>
            <input value={lat} onChange={e => setLat(e.target.value)} placeholder="38.7169" style={{ marginTop: '0.3rem' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="text-muted" style={{ fontSize: '0.88rem' }}>Longitude</label>
            <input value={lng} onChange={e => setLng(e.target.value)} placeholder="-9.1395" style={{ marginTop: '0.3rem' }} />
          </div>
        </div>
        <button className="btn-secondary mt-1" style={{ fontSize: '0.85rem' }} onClick={useCurrentLocation}>
          📡 Usar Localização Actual
        </button>

        <div className="mt-2">
          <label className="text-muted" style={{ fontSize: '0.88rem' }}>TTL (segundos)</label>
          <input value={ttl} onChange={e => setTtl(e.target.value)} type="number" min="60" style={{ marginTop: '0.3rem' }} />
          <span className="text-muted" style={{ fontSize: '0.78rem', marginTop: '0.2rem', display: 'block' }}>
            3600 = 1 hora | 86400 = 1 dia
          </span>
        </div>

        <div className="mt-2">
          <label className="text-muted" style={{ fontSize: '0.88rem' }}>Etiqueta (opcional)</label>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="ex: Casa, Trabalho" style={{ marginTop: '0.3rem' }} />
        </div>

        <div className="mt-2">
          <label className="text-muted" style={{ fontSize: '0.88rem' }}>Principal do destinatário (opcional)</label>
          <input value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="xxxx-xxxx-...-cai" style={{ marginTop: '0.3rem' }} />
        </div>

        <button className="btn-primary mt-2" onClick={handleShare}
          disabled={submitting || !lat || !lng}
          style={{ width: '100%' }}>
          {submitting ? '⏳ A criar...' : '📤 Partilhar Localização'}
        </button>
      </div>

      {/* Active shares */}
      <h2 className="mt-3">As Minhas Partilhas Activas</h2>
      {loading ? (
        <div className="spinner" />
      ) : shares.length === 0 ? (
        <p className="text-muted">Sem partilhas activas.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {shares.filter(s => s.isActive).map(s => (
            <div key={s.token} className="card">
              <div className="flex items-center gap-2 mb-1">
                <code style={{ color: 'var(--accent-cyan)', fontSize: '0.85rem' }}>{s.token}</code>
                <span className={`badge ${s.isActive ? 'badge-green' : 'badge-red'}`}>
                  {s.isActive ? 'activa' : 'expirada'}
                </span>
              </div>
              {s.recipient.length > 0 && (
                <p className="text-muted" style={{ fontSize: '0.85rem', margin: '0.2rem 0' }}>
                  Destinatário: <code>{s.recipient[0]}</code>
                </p>
              )}
              <p className="text-muted" style={{ fontSize: '0.82rem', margin: '0.2rem 0' }}>
                Expira: {formatExpiry(s.expiresAt)}
              </p>
              <button className="btn-danger mt-1" style={{ fontSize: '0.82rem', padding: '0.3rem 0.8rem' }}
                onClick={() => handleRevoke(s.token)}>
                🗑 Revogar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
