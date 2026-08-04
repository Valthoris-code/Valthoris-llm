import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import './styles/app.css';

// Backwards compatibility: older builds shipped a 404.html that redirected
// to "/?p=<encodedPath>". 404.html now boots the SPA directly at the
// requested URL, but previously shared links may still carry "?p=".
// Only same-origin, single-slash-prefixed paths are restored, so a crafted
// "?p=//evil.example.com" cannot be used to forge the displayed location.
(function restoreGitHubPagesPath() {
  const searchParams = new URLSearchParams(window.location.search);
  const redirectedPath = searchParams.get('p');
  if (!redirectedPath) return;
  if (!redirectedPath.startsWith('/') || redirectedPath.startsWith('//')) return;
  searchParams.delete('p');
  const remaining = searchParams.toString();
  const newUrl =
    redirectedPath + (remaining ? '?' + remaining : '') +
    window.location.hash;
  window.history.replaceState(null, '', newUrl);
})();

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found in index.html');
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
