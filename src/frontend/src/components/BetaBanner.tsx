import React from 'react';

export default function BetaBanner() {
  return (
    <div style={{
      background: 'linear-gradient(90deg, rgba(255,170,0,0.12) 0%, rgba(0,212,255,0.08) 100%)',
      borderBottom: '1px solid rgba(255,170,0,0.3)',
      padding: '0.45rem 1.5rem',
      display: 'flex',
      alignItems: 'center',
      gap: '0.6rem',
      fontSize: '0.82rem',
      color: '#ffcc55',
      zIndex: 200,
    }}>
      <span>⚠</span>
      <span>
        <strong>BETA PRIVATE</strong> — Platform under development. Some features are still under construction.
      </span>
      <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        v0.1-beta
      </span>
    </div>
  );
}
