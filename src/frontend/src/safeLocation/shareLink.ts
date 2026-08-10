import { BASE_PATH } from '../basePath';

/**
 * Absolute, shareable URL for a safe-location token.
 * `BASE_PATH` always ends with "/" so the same build works on the custom
 * domain (https://valthoris.com/share/<token>) and on GitHub Pages sub-paths.
 */
export function buildShareUrl(token: string): string {
  return `${window.location.origin}${BASE_PATH}share/${encodeURIComponent(token)}`;
}

/** Copies text to the clipboard. Returns false when the browser blocks it. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
