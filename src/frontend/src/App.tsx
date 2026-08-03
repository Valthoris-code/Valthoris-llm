import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout        from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Home          from './pages/Home';
import Dashboard     from './pages/Dashboard';
import Scanner       from './pages/Scanner';
import Reports       from './pages/Reports';
import SafeLocation  from './pages/SafeLocation';
import Profile       from './pages/Profile';
import AdminDashboard from './pages/AdminDashboard';
import UserManagement from './pages/UserManagement';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          {/* Public routes — accessible without authentication */}
          <Route index             element={<Home />} />
          <Route path="scanner"   element={<Scanner />} />
          <Route path="reports"   element={<Reports />} />

          {/* Protected routes — require a valid Internet Identity session */}
          <Route element={<ProtectedRoute />}>
            <Route path="dashboard"     element={<Dashboard />} />
            <Route path="safe-location" element={<SafeLocation />} />
            <Route path="profile"       element={<Profile />} />
            {/* Administration — access enforced by RoleGuard inside each page */}
            <Route path="admin"         element={<AdminDashboard />} />
            <Route path="admin/users"   element={<UserManagement />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
