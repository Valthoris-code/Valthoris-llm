import React, { useEffect, useState, useCallback } from 'react';
import { useActors } from '../hooks/useActors';
import { useAuth } from '../hooks/useAuth';

// Local view model mapped from the canister Report type
interface Report {
  id: string;
  target: string;
  category: string;      // derived from the canister category variant
  description: string;
  evidence: string | null;
  riskScore: bigint;
  status: string;
  confirmVotes: bigint;
  rejectVotes: bigint;
  createdAt: bigint;
}

const TARGET_TYPES = [
  { value: 'phishing',      label: 'Phishing'      },
  { value: 'smishing',      label: 'Smishing'       },
  { value: 'scam',          label: 'Burla'          },
  { value: 'malware',       label: 'Malware'        },
  { value: 'spam',          label: 'Spam'           },
  { value: 'fraud',         label: 'Fraude'         },
  { value: 'impersonation', label: 'Personificação' },
  { value: 'cryptoFraud',   label: 'Cripto-Fraude'  },
  { value: 'other',         label: 'Outro'          },
];

function statusBadge(s: string): string {
  if (s === 'confirmed')     return 'badge-red';
  if (s === 'rejected')      return 'badge-green';
  if (s === 'investigating') return 'badge-amber';
  return 'badge-cyan';
}

export default function Reports() {
  const actors = useActors();
  const { isAuthenticated } = useAuth();

  const [reports, setReports]   = useState<Report[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [successMsg, setSuccess] = useState('');

  // Submit form state
  const [showForm, setShowForm] = useState(false);
  const [target, setTarget]     = useState('');
  const [category, setCategory] = useState('phishing');
  const [desc, setDesc]         = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await actors.community.listRecentReports(BigInt(50));
      const mapped: Report[] = raw.map((r: any) => ({
        id:           r.id,
        target:       r.target,
        category:     Object.keys(r.category)[0] ?? 'other',
        description:  r.description,
        evidence:     r.evidence.length > 0 ? r.evidence[0] : null,
        riskScore:    r.riskScore,
        status:       Object.keys(r.status)[0] ?? 'pending',
        confirmVotes: r.confirmVotes,
        rejectVotes:  r.rejectVotes,
        createdAt:    r.createdAt,
      }));
      setReports(mapped);
    } catch (e) {
      setError('Erro ao carregar denúncias: ' + String(e));
    } finally {
      setLoading(false);
    }
  }, [actors]);

  useEffect(() => { loadReports(); }, [loadReports]);

  const handleSubmit = async () => {
    if (!target || !desc) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await actors.community.submitReport(
        { [category]: null } as any,  // ReportCategory variant
        target,                        // target identifier
        desc,                          // description
        [],                            // evidence (optional)
      );
      if ('ok' in res) {
        setSuccess('Denúncia submetida com ID: ' + res.ok);
        setTarget(''); setDesc('');
        setShowForm(false);
        await loadReports();
      } else {
        setError('Erro: ' + (res as any).err);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleVote = async (id: string, confirm: boolean) => {
    try {
      const fn = confirm
        ? actors.community.voteConfirm(id)
        : actors.community.voteReject(id);
      const res = await fn;
      if ('err' in res) setError((res as any).err);
      else await loadReports();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="page">
      <div className="flex items-center gap-2 mb-2" style={{ justifyContent: 'space-between' }}>
        <h1>🚨 Denúncias</h1>
        {isAuthenticated && (
          <button className="btn-primary" onClick={() => setShowForm(v => !v)}>
            {showForm ? '✕ Cancelar' : '＋ Nova Denúncia'}
          </button>
        )}
      </div>

      {error   && <div className="alert-error   mb-2">{error}</div>}
      {successMsg && <div className="alert-success mb-2">{successMsg}</div>}

      {showForm && (
        <div className="card mb-2" style={{ maxWidth: 620 }}>
          <h3 className="mt-1">Submeter Denúncia</h3>
          <div className="mt-2">
            <label className="text-muted" style={{ fontSize: '0.88rem' }}>Categoria</label>
            <select value={category} onChange={e => setCategory(e.target.value)} style={{ marginTop: '0.3rem' }}>
              {TARGET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="mt-2">
            <label className="text-muted" style={{ fontSize: '0.88rem' }}>Alvo (ex: número, e-mail, URL)</label>
            <input style={{ marginTop: '0.3rem' }} value={target} onChange={e => setTarget(e.target.value)} placeholder="Alvo da denúncia" />
          </div>
          <div className="mt-2">
            <label className="text-muted" style={{ fontSize: '0.88rem' }}>Descrição</label>
            <textarea style={{ marginTop: '0.3rem' }} rows={4} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Descreva o incidente (mínimo 10 caracteres)" />
          </div>
          <button className="btn-primary mt-2" onClick={handleSubmit} disabled={submitting || !target || !desc}>
            {submitting ? '⏳ A submeter...' : '📤 Submeter'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="spinner" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {reports.length === 0 && <p className="text-muted">Sem denúncias ainda.</p>}
          {reports.map(r => (
            <div key={r.id} className="card">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-muted" style={{ fontSize: '0.8rem' }}>{r.id}</span>
                <span className={`badge ${statusBadge(r.status)}`}>{r.status}</span>
                <span className="badge badge-cyan">{r.category}</span>
                <span style={{ marginLeft: 'auto', color: 'var(--accent-amber)', fontWeight: 700 }}>
                  Risco {String(r.riskScore)}%
                </span>
              </div>
              <p className="text-muted" style={{ fontSize: '0.82rem', margin: '0.2rem 0' }}>
                Alvo: <code style={{ color: 'var(--accent-cyan)' }}>{r.target}</code>
              </p>
              <p className="text-muted" style={{ margin: 0, fontSize: '0.9rem' }}>{r.description}</p>
              {isAuthenticated && (
                <div className="flex gap-1 mt-2">
                  <button className="btn-secondary" style={{ fontSize: '0.82rem', padding: '0.3rem 0.8rem' }}
                    onClick={() => handleVote(r.id, true)}>
                    ✅ Confirmar ({String(r.confirmVotes)})
                  </button>
                  <button className="btn-danger" style={{ fontSize: '0.82rem', padding: '0.3rem 0.8rem' }}
                    onClick={() => handleVote(r.id, false)}>
                    ✗ Rejeitar ({String(r.rejectVotes)})
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
