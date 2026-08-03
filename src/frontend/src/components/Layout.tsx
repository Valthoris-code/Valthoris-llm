import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import BetaBanner from './BetaBanner';
import TopToolbar from './TopToolbar';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import AppFooter from './AppFooter';
import './Layout.css';

export default function Layout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="layout">
      <BetaBanner />
      <TopToolbar onMenuToggle={() => setSidebarCollapsed(c => !c)} />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(c => !c)} />

        <main className="content" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1 }}>
            <Outlet />
          </div>
          <AppFooter />
        </main>
      </div>

      <MobileNav />
    </div>
  );
}
