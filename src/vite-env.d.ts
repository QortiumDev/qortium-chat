/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_QORTIUM_NODE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  qdnRequest?: <T = unknown>(request: Record<string, unknown>) => Promise<T>;
}
