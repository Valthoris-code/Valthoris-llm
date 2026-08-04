import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout         from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';

// Existing pages (preserved)
import Home            from './pages/Home';
import Dashboard       from './pages/Dashboard';
import Scanner         from './pages/Scanner';
import Reports         from './pages/Reports';
import SafeLocation    from './pages/SafeLocation';
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

export default function App() {
  return (
    <BrowserRouter>
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
          <Route path="help"       element={<Help />} />

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
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
