/**
 * PublicRoute — explicit wrapper for routes that require no authentication.
 *
 * Usage in App.tsx:
 *   <Route element={<PublicRoute />}>
 *     <Route path="scanner" element={<Scanner />} />
 *   </Route>
 *
 * Currently this is a pass-through component (<Outlet />) used to make
 * the routing intent explicit and provide a single extension point for
 * any future public-route middleware (e.g. analytics, locale detection).
 */

import React from 'react';
import { Outlet } from 'react-router-dom';

export default function PublicRoute() {
  return <Outlet />;
}
