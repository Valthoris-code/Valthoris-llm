import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import { I18nProvider } from './i18n/I18nContext';
import { ConsentProvider } from './consent/ConsentContext';
import { ToastProvider } from './components/ui/Toast';
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
      <I18nProvider>
        <ConsentProvider>
          <ToastProvider>
            <AuthProvider>
              <ErrorBoundary>
                <App />
              </ErrorBoundary>
            </AuthProvider>
          </ToastProvider>
        </ConsentProvider>
      </I18nProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
