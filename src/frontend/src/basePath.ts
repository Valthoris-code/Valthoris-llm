/**
 * Resolve the public base path the app is served from.
 *
 * The same bundle is published to two places:
 *   • the custom domain      → https://valthoris.com/            (base "/")
 *   • the GitHub Pages repo  → https://<user>.github.io/<repo>/  (base "/<repo>/")
 *
 * Vite is configured with a relative `base`, so assets resolve correctly in
 * both cases. The router, however, needs the absolute base path, which we
 * derive at runtime from the URL of this very module (it always lives in
 * `<base>assets/*.js`).
 */
export function getBasePath(): string {
  try {
    const moduleUrl = new URL(import.meta.url);
    const marker = moduleUrl.pathname.lastIndexOf('/assets/');
    if (marker >= 0) {
      return moduleUrl.pathname.slice(0, marker + 1);
    }
  } catch {
    /* fall through to "/" */
  }
  return '/';
}

export const BASE_PATH = getBasePath();
