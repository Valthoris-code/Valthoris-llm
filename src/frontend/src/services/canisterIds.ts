/**
 * Canister IDs — resolved from environment variables injected by dfx
 * (`output_env_file = ".env"` in dfx.json), falling back to official
 * mainnet IDs so the app works when deployed to IC without local dfx.
 */

const network = import.meta.env.VITE_DFX_NETWORK ?? 'ic';

export const CANISTER_IDS = {
  backend: (
    import.meta.env.VITE_CANISTER_ID_BACKEND
    ?? (network === 'ic' ? 'c6sjf-tqaaa-aaaap-qsiea-cai' : 'ryjl3-tyaaa-aaaaa-aaaba-cai')
  ),
  community: (
    import.meta.env.VITE_CANISTER_ID_COMMUNITY
    ?? (network === 'ic' ? '7w5qg-6aaaa-aaaab-ael4a-cai' : 'ryjl3-tyaaa-aaaaa-aaaba-cai')
  ),
  identity: (
    import.meta.env.VITE_CANISTER_ID_IDENTITY
    ?? (network === 'ic' ? 'ezroe-caaaa-aaaac-bcdeq-cai' : 'ryjl3-tyaaa-aaaaa-aaaba-cai')
  ),
  threat_intelligence: (
    import.meta.env.VITE_CANISTER_ID_THREAT_INTELLIGENCE
    ?? (network === 'ic' ? 'e2m3q-yqaaa-aaaas-qekva-cai' : 'ryjl3-tyaaa-aaaaa-aaaba-cai')
  ),
  safe_location: (
    import.meta.env.VITE_CANISTER_ID_SAFE_LOCATION
    ?? (network === 'ic' ? 'sodv3-uiaaa-aaaak-qxubq-cai' : 'ryjl3-tyaaa-aaaaa-aaaba-cai')
  ),
} as const;

export const IC_HOST =
  network === 'ic'
    ? 'https://icp0.io'
    : `http://127.0.0.1:4943`;

export const INTERNET_IDENTITY_URL =
  network === 'ic'
    ? 'https://identity.ic0.app'
    : `http://127.0.0.1:4943/?canisterId=rdmx6-jaaaa-aaaaa-aaadq-cai`;

/**
 * Canonical Internet Identity derivation origin.
 *
 * Internet Identity derives a *different* principal for every frontend origin
 * it is called from. The very same bundle is reachable from more than one
 * origin (the custom domain, the GitHub Pages project URL and the asset
 * canister), so without pinning a derivation origin the same human gets a
 * different principal depending on where they signed in — and their canister
 * profile, which is keyed by that principal, appears to have been lost after a
 * logout/login cycle.
 *
 * Pinning the canonical origin makes the principal stable across every origin
 * the app is served from. Users who signed in on https://valthoris.com keep
 * exactly the principal they already have, because for them the derivation
 * origin is the origin they are already using.
 *
 * Internet Identity only accepts an alternative derivation origin when the
 * derivation origin serves `/.well-known/ii-alternative-origins` listing the
 * requesting origin — see src/frontend/public/.well-known/ii-alternative-origins.
 */
export const II_DERIVATION_ORIGIN =
  network === 'ic' ? 'https://valthoris.com' : undefined;
