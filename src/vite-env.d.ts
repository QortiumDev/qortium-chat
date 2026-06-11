/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_QORTIUM_NODE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  _qdnLang?: unknown;
  _qdnLanguage?: unknown;
  _qdnTextSize?: unknown;
  _qdnTheme?: unknown;
  _qdnAccent?: unknown;
  qdnRequest?: <T = unknown>(request: Record<string, unknown>) => Promise<T>;
}
