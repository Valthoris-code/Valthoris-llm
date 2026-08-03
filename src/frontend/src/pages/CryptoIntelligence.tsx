import React, { useState } from 'react';

const CHAINS = ['All', 'Bitcoin', 'Ethereum', 'BNB Chain', 'Solana', 'Polygon'];

export default function CryptoIntelligence() {
  const [query, setQuery] = useState('');
  const [chain, setChain] = useState('All');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleScan = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResult(null);
    // TODO: Connect to threat_intelligence canister or Supabase crypto service
    await new Promise(r => setTimeout(r, 900));
    setResult(`Wallet analysis for "${query}" on ${chain} chain.\n\nBackend integration pending. This page is prepared for:\n- On-chain transaction analysis\n- Blacklist / sanctions check\n- DeFi exposure score\n- Exchange exposure\n- Risk classification`);
    setLoading(false);
  };

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <h1 style={{ margin: 0 }}>₿ Crypto Intelligence</h1>
        <span className="badge-beta">BETA</span>
      </div>
      <p className="text-muted">Analyze crypto wallets, detect suspicious activity, and check sanctions lists.</p>

      <div className="card mt-2" style={{ maxWidth: 620 }}>
        <div className="mb-2">
          <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Blockchain</label>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {CHAINS.map(c => (
              <button
                key={c}
                onClick={() => setChain(c)}
                style={{
                  background: chain === c ? 'rgba(0,212,255,0.15)' : 'none',
                  border: `1px solid ${chain === c ? 'var(--accent-cyan)' : 'var(--border)'}`,
                  color: chain === c ? 'var(--accent-cyan)' : 'var(--text-muted)',
                  borderRadius: 6, padding: '0.25rem 0.65rem', cursor: 'pointer', fontSize: '0.8rem',
                }}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-2">
          <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Wallet Address or Transaction Hash</label>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="0x... or 1A1zP1..."
            onKeyDown={e => e.key === 'Enter' && handleScan()}
          />
        </div>

        <button
          className="btn-primary"
          style={{ width: '100%' }}
          onClick={handleScan}
          disabled={loading || !query.trim()}
        >
          {loading ? '⏳ Analyzing…' : '₿ Analyze Wallet'}
        </button>
      </div>

      {result && (
        <div className="card mt-2" style={{ maxWidth: 620 }}>
          <h3 style={{ marginTop: 0 }}>Analysis Result</h3>
          <p style={{ whiteSpace: 'pre-wrap', fontSize: '0.88rem', color: 'var(--text-muted)' }}>{result}</p>
        </div>
      )}

      <div className="card mt-2" style={{ maxWidth: 620 }}>
        <h3 style={{ marginTop: 0, fontSize: '1rem' }}>Intelligence Features</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          {[
            { icon: '🔗', label: 'On-Chain Analysis',       todo: true },
            { icon: '⛔', label: 'Sanctions Check (OFAC)',  todo: true },
            { icon: '📊', label: 'Risk Score',              todo: true },
            { icon: '🔄', label: 'Transaction Graph',       todo: true },
            { icon: '🏦', label: 'Exchange Exposure',       todo: true },
            { icon: '🧩', label: 'DeFi Protocol Check',     todo: true },
          ].map(f => (
            <div
              key={f.label}
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '0.6rem 0.8rem',
                display: 'flex',
                gap: '0.5rem',
                alignItems: 'center',
                fontSize: '0.85rem',
                color: 'var(--text-muted)',
              }}
            >
              <span>{f.icon}</span>
              <span style={{ flex: 1 }}>{f.label}</span>
              {f.todo && <span className="badge-coming-soon">TODO</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
