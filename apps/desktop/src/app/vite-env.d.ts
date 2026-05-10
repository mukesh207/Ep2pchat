/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_WS_BASE_URL?: string;
  readonly VITE_ADMIN_BOOTSTRAP_SETUP_TOKEN?: string;
  readonly VITE_DEV_BACKEND_ORIGIN?: string;
  readonly VITE_E2E_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
