/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL de base de l'API, version comprise. Facultative : '/api/v1' par défaut (proxy Vite). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
