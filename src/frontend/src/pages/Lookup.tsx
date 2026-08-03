import React from 'react';
import LookupTool from '../components/LookupTool';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';

const LOOKUP_TABS = [
  { path: 'phone',    label: 'Phone',         icon: '📞' },
  { path: 'email',    label: 'Email',          icon: '✉️' },
  { path: 'iban',     label: 'IBAN',           icon: '🏦' },
  { path: 'crypto',   label: 'Crypto Wallet',  icon: '₿' },
  { path: 'url',      label: 'URL',            icon: '🌐' },
  { path: 'qr',       label: 'QR Code',        icon: '📷' },
  { path: 'domain',   label: 'Domain',         icon: '🖥' },
  { path: 'username', label: 'Username',       icon: '👤' },
];

export default function Lookup() {
  const location = useLocation();

  return (
    <div className="page">
      <h1>🔎 Lookup</h1>
      <p className="text-muted">Identify and verify suspicious contacts, wallets, domains and more.</p>

      <div style={{
        display: 'flex',
        gap: '0.4rem',
        flexWrap: 'wrap',
        marginBottom: '1.5rem',
        borderBottom: '1px solid var(--border)',
        paddingBottom: '0.75rem',
      }}>
        {LOOKUP_TABS.map(tab => (
          <NavLink
            key={tab.path}
            to={`/lookup/${tab.path}`}
            style={({ isActive }) => ({
              padding: '0.35rem 0.8rem',
              borderRadius: 6,
              fontSize: '0.85rem',
              textDecoration: 'none',
              background: isActive ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.03)',
              border: isActive ? '1px solid rgba(0,212,255,0.3)' : '1px solid var(--border)',
              color: isActive ? 'var(--accent-cyan)' : 'var(--text-muted)',
              transition: 'all 0.15s',
            })}
          >
            {tab.icon} {tab.label}
          </NavLink>
        ))}
      </div>

      {location.pathname === '/lookup' && (
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <p className="text-muted">Select a lookup type from the tabs above.</p>
        </div>
      )}

      <Routes>
        <Route path="phone"    element={<LookupTool lookupType="phone" />} />
        <Route path="email"    element={<LookupTool lookupType="email" />} />
        <Route path="iban"     element={<LookupTool lookupType="iban" />} />
        <Route path="crypto"   element={<LookupTool lookupType="crypto" />} />
        <Route path="url"      element={<LookupTool lookupType="url" />} />
        <Route path="qr"       element={<LookupTool lookupType="qr" />} />
        <Route path="domain"   element={<LookupTool lookupType="domain" />} />
        <Route path="username" element={<LookupTool lookupType="username" />} />
      </Routes>
    </div>
  );
}
