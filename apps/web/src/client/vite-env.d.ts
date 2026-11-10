/// <reference types="vite/client" />
declare const __ROWLENS_RELEASE__: string;

// Build-time flags; read with dot notation so Vite can replace them and drop disabled code.
interface ImportMetaEnv {
  readonly VITE_FEATURE_UNIFIED_USERS?: string;
  readonly VITE_FEATURE_PLAYER_DEMO?: string;
}
