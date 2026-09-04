/**
 * AdminApp — the whole Administration & Governance Center, mounted at /admin/*.
 *
 * It is a self-contained area: its own provider, its own layout, its own
 * stylesheet, its own Supabase Auth session. The normal Valthoris application
 * renders none of it and links to none of it — an ordinary user has no way of
 * even knowing it is there, and typing the address only produces the login
 * screen, which reveals nothing.
 *
 * The whole module is lazily loaded from App.tsx, so a visitor who never opens
 * /admin does not even download this code.
 */

import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { AdminAuthProvider } from './AdminAuthContext';
import AdminRouteGuard, { PermissionGuard } from './AdminRouteGuard';
import AdminLayout from './AdminLayout';
import AdminLogin from './pages/AdminLogin';
import AdminDashboardPage from './pages/AdminDashboardPage';
import Administrators from './pages/Administrators';
import RolesPage from './pages/RolesPage';
import AuditLogPage from './pages/AuditLogPage';
import IntelSourcesPage from './pages/IntelSourcesPage';
import StatisticsPage from './pages/StatisticsPage';
import FraudReportsPage from './pages/FraudReportsPage';
import FraudMapPage from './pages/FraudMapPage';
import BlacklistPage from './pages/BlacklistPage';
import ReputationPage from './pages/ReputationPage';
import ThreatIntelligencePage from './pages/ThreatIntelligencePage';
import MonitoringPage from './pages/MonitoringPage';
import UsersPage from './pages/UsersPage';
import AdminPlaceholder from './pages/AdminPlaceholder';
import { ADMIN_NAV_ITEMS } from './adminNav';
import './admin.css';

/** Sections already delivered; everything else is mounted as a placeholder. */
const IMPLEMENTED = new Set([
  '/admin',
  '/admin/administrators',
  '/admin/roles',
  '/admin/audit',
  '/admin/intel-sources',
  '/admin/statistics',
  '/admin/fraud-reports',
  '/admin/fraud-map',
  '/admin/blacklist',
  '/admin/reputation',
  '/admin/monitoring',
  '/admin/threat-intelligence',
  '/admin/users',
]);

export default function AdminApp() {
  return (
    <AdminAuthProvider>
      <Routes>
        <Route path="login" element={<AdminLogin />} />

        <Route element={<AdminRouteGuard />}>
          <Route element={<AdminLayout />}>
            <Route index element={<AdminDashboardPage />} />
            <Route
              path="administrators"
              element={
                <PermissionGuard permission="admins.read">
                  <Administrators />
                </PermissionGuard>
              }
            />
            <Route
              path="roles"
              element={
                <PermissionGuard permission="roles.read">
                  <RolesPage />
                </PermissionGuard>
              }
            />
            <Route
              path="intel-sources"
              element={
                <PermissionGuard permission="system_health.read">
                  <IntelSourcesPage />
                </PermissionGuard>
              }
            />
            <Route
              path="audit"
              element={
                <PermissionGuard permission="audit.read">
                  <AuditLogPage />
                </PermissionGuard>
              }
            />

            {/* Centro de Comando — every section reads this project's Supabase. */}
            <Route
              path="statistics"
              element={
                <PermissionGuard permission="dashboard.read">
                  <StatisticsPage />
                </PermissionGuard>
              }
            />
            <Route
              path="fraud-reports"
              element={
                <PermissionGuard permission="reports.read">
                  <FraudReportsPage />
                </PermissionGuard>
              }
            />
            <Route
              path="fraud-map"
              element={
                <PermissionGuard permission="reports.read">
                  <FraudMapPage />
                </PermissionGuard>
              }
            />
            <Route
              path="blacklist"
              element={
                <PermissionGuard permission="blacklist.read">
                  <BlacklistPage />
                </PermissionGuard>
              }
            />
            <Route
              path="reputation"
              element={
                <PermissionGuard permission="reputation.read">
                  <ReputationPage />
                </PermissionGuard>
              }
            />
            <Route
              path="threat-intelligence"
              element={
                <PermissionGuard permission="threat_intel.read">
                  <ThreatIntelligencePage />
                </PermissionGuard>
              }
            />
            <Route
              path="monitoring"
              element={
                <PermissionGuard permission="audit.read">
                  <MonitoringPage />
                </PermissionGuard>
              }
            />
            <Route
              path="users"
              element={
                <PermissionGuard permission="users.read">
                  <UsersPage />
                </PermissionGuard>
              }
            />

            {ADMIN_NAV_ITEMS.filter(item => !IMPLEMENTED.has(item.to)).map(item => (
              <Route
                key={item.to}
                path={item.to.replace('/admin/', '')}
                element={
                  <PermissionGuard permission={item.permission}>
                    <AdminPlaceholder item={item} />
                  </PermissionGuard>
                }
              />
            ))}

            {/* Unknown administrative paths fall back to the dashboard. */}
            <Route path="*" element={<AdminDashboardPage />} />
          </Route>
        </Route>
      </Routes>
    </AdminAuthProvider>
  );
}
