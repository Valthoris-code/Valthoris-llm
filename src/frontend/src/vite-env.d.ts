/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DFX_NETWORK: string;
  readonly VITE_CANISTER_ID_BACKEND: string;
  readonly VITE_CANISTER_ID_COMMUNITY: string;
  readonly VITE_CANISTER_ID_IDENTITY: string;
  readonly VITE_CANISTER_ID_THREAT_INTELLIGENCE: string;
  readonly VITE_CANISTER_ID_SAFE_LOCATION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
