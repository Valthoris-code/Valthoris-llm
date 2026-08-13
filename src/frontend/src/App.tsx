import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { BASE_PATH }  from './basePath';
import Layout         from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';

// Existing pages (preserved)
import Home            from './pages/Home';
import Dashboard       from './pages/Dashboard';
import Scanner         from './pages/Scanner';
import Reports         from './pages/Reports';
import SafeLocation    from './pages/SafeLocation';
import SharedLocation  from './pages/SharedLocation';
import SafeRoomPage    from './pages/SafeRoomPage';
import Profile         from './pages/Profile';
import AdminDashboard  from './pages/AdminDashboard';
import UserManagement  from './pages/UserManagement';

// New pages
import AIAssistant       from './pages/AIAssistant';
import Lookup            from './pages/Lookup';
import RadarGlobal       from './pages/RadarGlobal';
import CommunityReports  from './pages/CommunityReports';
import CryptoIntelligence from './pages/CryptoIntelligence';
import ThreatIntelligence from './pages/ThreatIntelligence';
import Notifications     from './pages/Notifications';
import Downloads         from './pages/Downloads';
import LegalFramework    from './pages/LegalFramework';
import Settings          from './pages/Settings';
import Help              from './pages/Help';
import AuthPage          from './pages/AuthPage';
import WaitingList       from './pages/WaitingList';
import Contact           from './pages/Contact';
import ComingSoon        from './pages/ComingSoon';

// Legal pages
import PrivacyPolicy         from './pages/legal/PrivacyPolicy';
import Terms                 from './pages/legal/Terms';
import CookiePolicy          from './pages/legal/CookiePolicy';
import CookiePreferences     from './pages/legal/CookiePreferences';
import GdprRights            from './pages/legal/GdprRights';
import DataProcessing        from './pages/legal/DataProcessing';
import ResponsibleDisclosure from './pages/legal/ResponsibleDisclosure';
import SecurityPolicy        from './pages/legal/SecurityPolicy';
import ContactDpo            from './pages/legal/ContactDpo';
import Copyright             from './pages/legal/Copyright';

export default function App() {
  return (
    <BrowserRouter basename={BASE_PATH}>
      <Routes>
        {/* Auth pages — outside main layout */}
        <Route path="/auth"         element={<AuthPage />} />
        <Route path="/waiting-list" element={<WaitingList />} />

        <Route path="/" element={<Layout />}>
          {/* Default → AI Assistant */}
          <Route index element={<Navigate to="/assistant" replace />} />

          {/* Public routes */}
          <Route path="home"       element={<Home />} />
          <Route path="assistant"  element={<AIAssistant />} />
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
            {/* Admin */}
            <Route path="admin"          element={<AdminDashboard />} />
            <Route path="admin/users"    element={<UserManagement />} />
          </Route>

          {/* Unknown paths inside the shell fall back to the assistant */}
          <Route path="*" element={<Navigate to="/assistant" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
