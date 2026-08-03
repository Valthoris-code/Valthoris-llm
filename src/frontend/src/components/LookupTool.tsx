import React from 'react';

interface LookupPageProps {
  type: 'phone' | 'email' | 'iban' | 'crypto' | 'url' | 'qr' | 'domain' | 'username';
}

const CONFIG: Record<LookupPageProps['type'], { label: string; icon: string; placeholder: string; desc: string }> = {
  phone:    { label: 'Phone Number',  icon: '📞', placeholder: '+1 555 123 4567',         desc: 'Check if this phone number is associated with known scams or fraud.' },
  email:    { label: 'Email Address', icon: '✉️', placeholder: 'user@example.com',         desc: 'Verify if this email address appears in breach databases or scam reports.' },
  iban:     { label: 'IBAN',          icon: '🏦', placeholder: 'GB29 NWBK 6016 1331 9268 19', desc: 'Check this IBAN against known fraud accounts.' },
  crypto:   { label: 'Crypto Wallet', icon: '₿',  placeholder: '1A1zP1eP5QGefi2DMPTf...',  desc: 'Analyze a crypto wallet address for suspicious activity or scam association.' },
  url:      { label: 'URL',           icon: '🌐', placeholder: 'https://example.com',       desc: 'Scan this URL for phishing, malware, or suspicious content.' },
  qr:       { label: 'QR Code',       icon: '📷', placeholder: 'Paste decoded QR content…', desc: 'Analyze the content decoded from a QR code for threats.' },
  domain:   { label: 'Domain',        icon: '🖥', placeholder: 'example.com',               desc: 'Check domain reputation, WHOIS data, and threat intelligence.' },
  username: { label: 'Username',      icon: '👤', placeholder: '@username',                 desc: 'Search for this username across platforms for suspicious activity.' },
};

interface Props {
  lookupType: LookupPageProps['type'];
}

export default function LookupTool({ lookupType }: Props) {
  const [query, setQuery] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<string | null>(null);
  const cfg = CONFIG[lookupType];

  const handleLookup = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResult(null);
    // TODO: Connect to backend canister lookup methods
    await new Promise(r => setTimeout(r, 1000));
    setResult(`Lookup result for "${query}" (${cfg.label}) — Backend integration pending.\n\nThis field is prepared for connection to the VALTHORIS identity and threat intelligence canisters.`);
    setLoading(false);
  };

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '1.8rem' }}>{cfg.icon}</span>
        <div>
          <h1 style={{ margin: 0 }}>{cfg.label} Lookup</h1>
          <p className="text-muted" style={{ margin: 0, fontSize: '0.88rem' }}>{cfg.desc}</p>
        </div>
        <span className="badge-beta" style={{ marginLeft: 'auto' }}>BETA</span>
      </div>

      <div className="card mt-2" style={{ maxWidth: 600 }}>
        <div className="mb-2">
          <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.4rem' }}>
            {cfg.label}
          </label>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={cfg.placeholder}
            onKeyDown={e => e.key === 'Enter' && handleLookup()}
          />
        </div>
        <button
          className="btn-primary"
          style={{ width: '100%' }}
          onClick={handleLookup}
          disabled={loading || !query.trim()}
        >
          {loading ? '⏳ Searching…' : `🔎 Lookup ${cfg.label}`}
        </button>
      </div>

      {result && (
        <div className="card mt-2" style={{ maxWidth: 600 }}>
          <h3 style={{ marginTop: 0 }}>Result</h3>
          <p style={{ whiteSpace: 'pre-wrap', color: 'var(--text-muted)', fontSize: '0.88rem' }}>{result}</p>
        </div>
      )}

      <div className="card mt-2" style={{ maxWidth: 600, background: 'rgba(0,212,255,0.04)', border: '1px dashed var(--border)' }}>
        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          ℹ️ <strong style={{ color: 'var(--accent-cyan)' }}>TODO:</strong> Connect to backend canister methods for {cfg.label.toLowerCase()} lookup. Interface prepared.
        </p>
      </div>
    </div>
  );
}
