import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import './styles/app.css';

// Restore path after GitHub Pages 404 redirect
// The 404.html redirects to /?p=<encodedPath> so the SPA can restore it.
(function restoreGitHubPagesPath() {
  const searchParams = new URLSearchParams(window.location.search);
  const redirectedPath = searchParams.get('p');
  if (redirectedPath) {
    searchParams.delete('p');
    const remaining = searchParams.toString();
    const newUrl =
      redirectedPath + (remaining ? '?' + remaining : '') +
      window.location.hash;
    window.history.replaceState(null, '', newUrl);
  }
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
