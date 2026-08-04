import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import BetaBanner from './BetaBanner';
import TopToolbar from './TopToolbar';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import AppFooter from './AppFooter';
import ErrorBoundary from './ErrorBoundary';
import ConsentGate from './ConsentGate';
import CookieBanner from './CookieBanner';
import './Layout.css';

function PageFallback() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        padding: '3rem 2rem',
        textAlign: 'center',
        color: 'var(--text-muted)',
      }}
    >
      <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⚠</div>
      <h2 style={{ margin: '0 0 0.5rem', color: 'var(--accent-amber)' }}>Page Error</h2>
      <p style={{ margin: '0 0 1.5rem', fontSize: '0.9rem' }}>
        This page encountered an error and cannot be displayed.
      </p>
      <button
        className="btn-primary"
        onClick={() => window.location.assign('/assistant')}
      >
        ← Back to AI Assistant
      </button>
    </div>
  );
}

export default function Layout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="layout">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <ErrorBoundary fallback={null}>
        <ConsentGate />
      </ErrorBoundary>
      <ErrorBoundary fallback={null}>
        <BetaBanner />
      </ErrorBoundary>
      <ErrorBoundary fallback={null}>
        <TopToolbar onMenuToggle={() => setSidebarCollapsed(c => !c)} />
      </ErrorBoundary>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <ErrorBoundary fallback={null}>
          <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(c => !c)} />
        </ErrorBoundary>

        <main id="main-content" className="content" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1 }}>
            <ErrorBoundary fallback={<PageFallback />}>
              <Outlet />
            </ErrorBoundary>
          </div>
          <ErrorBoundary fallback={null}>
            <AppFooter />
          </ErrorBoundary>
        </main>
      </div>

      <ErrorBoundary fallback={null}>
        <CookieBanner />
      </ErrorBoundary>

      <ErrorBoundary fallback={null}>
        <MobileNav />
      </ErrorBoundary>
    </div>
  );
}
