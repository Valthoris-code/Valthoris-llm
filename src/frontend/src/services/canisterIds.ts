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
