import React, { useState } from 'react';
import { useActors } from '../hooks/useActors';
import type { ThreatResult } from '../../../declarations/threat_intelligence/index.d.ts';

type ScanType = 'url' | 'ip' | 'domain' | 'hash' | 'email' | 'phone' | 'domain_lookup';

const SCAN_OPTIONS: { value: ScanType; label: string; placeholder: string }[] = [
  { value: 'url',           label: 'URL',           placeholder: 'https://exemplo.com' },
  { value: 'ip',            label: 'Endereço IP',   placeholder: '1.2.3.4' },
  { value: 'domain',        label: 'Domínio',       placeholder: 'exemplo.com' },
  { value: 'hash',          label: 'Hash de Ficheiro', placeholder: 'sha256:...' },
  { value: 'email',         label: 'E-mail',        placeholder: 'user@dominio.com' },
  { value: 'phone',         label: 'Telefone',      placeholder: '+351 912 345 678' },
  { value: 'domain_lookup', label: 'Domínio (Lookup)', placeholder: 'banco.exemplo.pt' },
];

function severityColor(s: string): string {
  if (s === 'critical') return 'badge-red';
  if (s === 'high')     return 'badge-red';
  if (s === 'medium')   return 'badge-amber';
  return 'badge-cyan';
}

function severityLabel(s: ThreatResult['severity']): string {
  if (!s || s.length === 0) return 'n/a';
  const v = s[0];
  if (!v) return 'n/a';
  return Object.keys(v)[0] ?? 'n/a';
}

export default function Scanner() {
  const actors = useActors();

  const [scanType, setScanType] = useState<ScanType>('url');
  const [query, setQuery]       = useState('');
  const [result, setResult]     = useState<ThreatResult | null>(null);
  const [phoneResult, setPhoneResult] = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const handleScan = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResult(null);
    setPhoneResult(null);
    setError('');
    try {
      if (scanType === 'phone') {
        const res = await actors.identity.lookupPhone(query.trim());
        setPhoneResult(
          res.found
            ? `Risco: ${String(res.riskScore)}/100 | Confiança: ${String(res.trustScore)}/100 | Denúncias: ${String(res.reportCount)}` +
              (res.isKnownScammer ? ' ⚠ SCAMMER CONHECIDO' : '')
            : 'Sem registos para este número.'
        );
      } else if (scanType === 'domain_lookup') {
        const res = await actors.identity.lookupDomain(query.trim());
        setPhoneResult(
          res.found
            ? `Risco: ${String(res.riskScore)}/100 | Confiança: ${String(res.trustScore)}/100 | Denúncias: ${String(res.reportCount)}` +
              (res.isKnownScammer ? ' ⚠ SCAMMER CONHECIDO' : '')
            : 'Sem registos para este domínio.'
        );
      } else {
        let res: ThreatResult;
        switch (scanType) {
          case 'url':    res = await actors.threatIntelligence.checkUrl(query.trim()); break;
          case 'ip':     res = await actors.threatIntelligence.checkIp(query.trim()); break;
          case 'domain': res = await actors.threatIntelligence.checkDomain(query.trim()); break;
          case 'hash':   res = await actors.threatIntelligence.checkHash(query.trim()); break;
          case 'email':  res = await actors.threatIntelligence.checkEmail(query.trim()); break;
          default: throw new Error('Tipo de scan desconhecido');
        }
        setResult(res);
      }
    } catch (e) {
      setError('Erro ao realizar verificação: ' + String(e));
    } finally {
      setLoading(false);
    }
  };

  const opt = SCAN_OPTIONS.find(o => o.value === scanType)!;

  return (
    <div className="page">
      <h1>🔍 Scanner de Ameaças</h1>
      <p className="text-muted">Verifique URLs, IPs, domínios, hashes, e-mails e telefones em tempo real.</p>

      <div className="card mt-2" style={{ maxWidth: 620 }}>
        <div className="mb-2">
          <label className="text-muted" style={{ fontSize: '0.88rem' }}>Tipo de Verificação</label>
          <select
            value={scanType}
            onChange={e => setScanType(e.target.value as ScanType)}
            style={{ marginTop: '0.4rem' }}
          >
            {SCAN_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="mb-2">
          <label className="text-muted" style={{ fontSize: '0.88rem' }}>{opt.label}</label>
          <input
            style={{ marginTop: '0.4rem' }}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={opt.placeholder}
            onKeyDown={e => e.key === 'Enter' && handleScan()}
          />
        </div>

        <button
          className="btn-primary"
          onClick={handleScan}
          disabled={loading || !query.trim()}
          style={{ width: '100%' }}
        >
          {loading ? '⏳ A verificar...' : '🔍 Verificar'}
        </button>
      </div>

      {error && <div className="alert-error mt-2">{error}</div>}

      {phoneResult && (
        <div className="card mt-2" style={{ maxWidth: 620 }}>
          <h3>Resultado</h3>
          <p>{phoneResult}</p>
        </div>
      )}

      {result && (
        <div className="card mt-2" style={{ maxWidth: 620 }}>
          <h3>Resultado da Verificação</h3>
          <div className="flex items-center gap-2 mb-2">
            <span className={`badge ${result.isThreat ? 'badge-red' : 'badge-green'}`}>
              {result.isThreat ? '⚠ AMEAÇA DETECTADA' : '✓ SEM AMEAÇAS CONHECIDAS'}
            </span>
            {result.isThreat && (
              <span className={`badge ${severityColor(severityLabel(result.severity))}`}>
                {severityLabel(result.severity).toUpperCase()}
              </span>
            )}
          </div>
          <p className="text-muted" style={{ fontSize: '0.88rem' }}>
            Confiança: {String(result.confidence)}% &nbsp;|&nbsp;
            Indicadores correspondentes: {String(result.matchedIndicators)}
          </p>
          {result.details.length > 0 && (
            <ul style={{ paddingLeft: '1.2rem', margin: '0.5rem 0 0' }}>
              {result.details.map((d, i) => <li key={i} className="text-muted">{d}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
