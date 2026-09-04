import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { BASE_PATH }  from './basePath';
import Layout         from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import SecurityBadge  from './components/SecurityBadge';

// Existing pages (preserved)
import Home            from './pages/Home';
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Scanner = lazy(() => import('./pages/Scanner'));
const Reports = lazy(() => import('./pages/Reports'));
const SafeLocation = lazy(() => import('./pages/SafeLocation'));
const SharedLocation = lazy(() => import('./pages/SharedLocation'));
const SafeRoomPage = lazy(() => import('./pages/SafeRoomPage'));
const Profile = lazy(() => import('./pages/Profile'));
const OperationsConsole = lazy(() => import('./pages/AdminDashboard'));
const UserManagement = lazy(() => import('./pages/UserManagement'));

/**
 * Administration & Governance Center — a self-contained area mounted at
 * /admin/*. It has its own layout, its own Supabase Auth session and its own
 * authorization; nothing of the normal application is rendered inside it, and
 * it is only downloaded when somebody actually opens /admin.
 */
const AdminApp = lazy(() => import('./admin/AdminApp'));

// New pages
import AIAssistant       from './pages/AIAssistant';
const Lookup = lazy(() => import('./pages/Lookup'));
const RadarGlobal = lazy(() => import('./pages/RadarGlobal'));
const CommunityReports = lazy(() => import('./pages/CommunityReports'));
const CryptoIntelligence = lazy(() => import('./pages/CryptoIntelligence'));
const ThreatIntelligence = lazy(() => import('./pages/ThreatIntelligence'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Downloads = lazy(() => import('./pages/Downloads'));
const LegalFramework = lazy(() => import('./pages/LegalFramework'));
const Settings = lazy(() => import('./pages/Settings'));
const Help = lazy(() => import('./pages/Help'));
const AuthPage = lazy(() => import('./pages/AuthPage'));
const WaitingList = lazy(() => import('./pages/WaitingList'));
const Contact = lazy(() => import('./pages/Contact'));
const ComingSoon = lazy(() => import('./pages/ComingSoon'));

// Legal pages
const PrivacyPolicy = lazy(() => import('./pages/legal/PrivacyPolicy'));
const Terms = lazy(() => import('./pages/legal/Terms'));
const CookiePolicy = lazy(() => import('./pages/legal/CookiePolicy'));
const CookiePreferences = lazy(() => import('./pages/legal/CookiePreferences'));
const GdprRights = lazy(() => import('./pages/legal/GdprRights'));
const DataProcessing = lazy(() => import('./pages/legal/DataProcessing'));
const ResponsibleDisclosure = lazy(() => import('./pages/legal/ResponsibleDisclosure'));
const SecurityPolicy = lazy(() => import('./pages/legal/SecurityPolicy'));
const ContactDpo = lazy(() => import('./pages/legal/ContactDpo'));
const Copyright = lazy(() => import('./pages/legal/Copyright'));

/**
 * Shown while a lazily loaded route chunk is being fetched. Deliberately
 * minimal: on a phone the chunk usually arrives within a frame or two, so
 * anything heavier would flash.
 */
function RouteFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '40vh',
        padding: '2rem',
        color: 'var(--text-muted)',
        fontSize: '0.85rem',
      }}
    >
      Loading…
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter basename={BASE_PATH}>
      <SecurityBadge />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* Administration & Governance Center — outside the normal layout.
              Visible only to the authorised administrators; every unauthorised
              visitor gets the login screen, which reveals nothing, and the
              backend refuses the data regardless. */}
          <Route path="/admin/*" element={<AdminApp />} />

          {/* Auth pages — outside main layout */}
          <Route path="/auth"         element={<AuthPage />} />
          <Route path="/waiting-list" element={<WaitingList />} />

          <Route path="/" element={<Layout />}>
            {/* Default → AI Assistant */}
            <Route index element={<Navigate to="/assistant" replace />} />

            {/* Public routes */}
            <Route path="home"       element={<Home />} />
            <Route path="assistant"  element={<AIAssistant />} />
            {/*
              The saved conversations, reachable from the mobile bottom bar:
              the same assistant, opened on its conversation list, which the
              narrow layout otherwise hides.
            */}
            <Route path="assistant/conversas" element={<AIAssistant />} />
            <Route path="scanner"    element={<Scanner />} />
            <Route path="reports"    element={<Reports />} />
            <Route path="community"  element={<CommunityReports />} />
            <Route path="radar"      element={<RadarGlobal />} />
            <Route path="crypto-intelligence" element={<CryptoIntelligence />} />
            <Route path="threat-intelligence" element={<ThreatIntelligence />} />
            <Route path="downloads"  element={<Downloads />} />
            <Route path="legal"      element={<LegalFramework />} />
            <Route path="legal/privacy"                 element={<PrivacyPolicy />} />
            <Route path="legal/terms"                   element={<Terms />} />
            <Route path="legal/cookies"                 element={<CookiePolicy />} />
            <Route path="legal/cookie-preferences"      element={<CookiePreferences />} />
            <Route path="legal/gdpr"                    element={<GdprRights />} />
            <Route path="legal/data-processing"         element={<DataProcessing />} />
            <Route path="legal/responsible-disclosure"  element={<ResponsibleDisclosure />} />
            <Route path="legal/security"                element={<SecurityPolicy />} />
            <Route path="legal/dpo"                     element={<ContactDpo />} />
            <Route path="legal/copyright"               element={<Copyright />} />
            <Route path="contact"    element={<Contact />} />
            <Route path="coming-soon" element={<ComingSoon />} />
            <Route path="help"       element={<Help />} />

            {/* Public share-link resolution */}
            <Route path="share/:token" element={<SharedLocation />} />

            {/* Safe Rooms — creation and link-based entry (guests welcome: the
                room token plus the accepted terms are the authorisation). */}
            <Route path="rooms"        element={<SafeRoomPage />} />
            <Route path="room/:token"  element={<SafeRoomPage />} />

            {/* Lookup sub-routes */}
            <Route path="lookup/*"   element={<Lookup />} />

            {/* Protected routes */}
            <Route element={<ProtectedRoute />}>
              <Route path="dashboard"      element={<Dashboard />} />
              <Route path="safe-location"  element={<SafeLocation />} />
              <Route path="profile"        element={<Profile />} />
              <Route path="notifications"  element={<Notifications />} />
              <Route path="settings"       element={<Settings />} />
              {/* Internet Identity operations console (unchanged behaviour).
                  It moved off /admin, which is now the Administration &
                  Governance Center — a different area with a different
                  identity model. */}
              <Route path="operations"       element={<OperationsConsole />} />
              <Route path="operations/users" element={<UserManagement />} />
            </Route>

            {/* Unknown paths inside the shell fall back to the assistant */}
            <Route path="*" element={<Navigate to="/assistant" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
