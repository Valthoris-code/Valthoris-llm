import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import BetaBanner from './BetaBanner';
import TopToolbar from './TopToolbar';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import MobileDrawer from './MobileDrawer';
import AppFooter from './AppFooter';
import ErrorBoundary from './ErrorBoundary';
import ConsentGate from './ConsentGate';
import CookieBanner from './CookieBanner';
import { useViewportMetrics } from '../hooks/useViewportMetrics';
import './Layout.css';

/**
 * Routes whose page owns the full height of the content area: the shell itself
 * must not scroll, the page manages its own scrolling regions.
 */
const FULL_HEIGHT_ROUTES = ['/assistant'];

/**
 * Routes that must not render the marketing footer. On a phone that footer was
 * appearing inside the conversation and under the composer while the user was
 * typing.
 */
const NO_FOOTER_ROUTES = ['/assistant', '/rooms', '/room/'];

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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { pathname } = useLocation();
  useViewportMetrics();

  const fullHeight = FULL_HEIGHT_ROUTES.some(route => pathname.startsWith(route));
  const showFooter = !NO_FOOTER_ROUTES.some(route => pathname.startsWith(route));

  return (
    <div className="layout">
      {/* Subtle shield watermark in the background */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          bottom: '5%',
          right: '3%',
          width: 340,
          height: 340,
          backgroundImage: 'url(/valthoris-shield-512.png)',
          backgroundSize: 'contain',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
          opacity: 0.04,
          pointerEvents: 'none',
          zIndex: 0,
          userSelect: 'none',
        }}
      />
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

        <main
          id="main-content"
          className={`content${fullHeight ? ' content-full-height' : ''}`}
          style={{
            flex: 1,
            overflowY: fullHeight ? 'hidden' : 'auto',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          {/*
            * On a full-height route the page owns the viewport and must be
            * allowed to shrink (flex: 1 with min-height: 0). On a normal,
            * scrolling route the wrapper must instead be free to grow with its
            * content: `flex: 1` would cap it at the height of the scroll
            * container and let long pages overflow behind the fixed bottom
            * navigation, where they could not be scrolled into view.
            */}
          <div
            style={
              fullHeight
                ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }
                : { flex: '1 0 auto', display: 'flex', flexDirection: 'column' }
            }
          >
            <ErrorBoundary fallback={<PageFallback />}>
              <Outlet />
            </ErrorBoundary>
          </div>
          {showFooter && (
            <ErrorBoundary fallback={null}>
              <AppFooter />
            </ErrorBoundary>
          )}
        </main>
      </div>

      <ErrorBoundary fallback={null}>
        <CookieBanner />
      </ErrorBoundary>

      <ErrorBoundary fallback={null}>
        <MobileNav onMenuOpen={() => setDrawerOpen(true)} />
      </ErrorBoundary>

      <ErrorBoundary fallback={null}>
        <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      </ErrorBoundary>
    </div>
  );
}
