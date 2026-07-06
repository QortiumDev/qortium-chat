/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_QORTIUM_NODE_API_URL?: string;
  // Comma-separated group ids treated as development (tx-approval) groups. Defaults to "1".
  readonly VITE_QORTIUM_DEV_GROUP_IDS?: string;
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
