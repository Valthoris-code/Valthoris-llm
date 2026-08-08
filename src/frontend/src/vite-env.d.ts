/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DFX_NETWORK: string;
  readonly VITE_CANISTER_ID_BACKEND: string;
  readonly VITE_CANISTER_ID_COMMUNITY: string;
  readonly VITE_CANISTER_ID_IDENTITY: string;
  readonly VITE_CANISTER_ID_THREAT_INTELLIGENCE: string;
  readonly VITE_CANISTER_ID_SAFE_LOCATION: string;
  /** Supabase project URL  (e.g. https://<ref>.supabase.co) */
  readonly VITE_SUPABASE_URL: string;
  /** Supabase anon/public key — safe to expose in the browser */
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
