/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_QORTIUM_NODE_API_URL?: string;
  // Comma-separated group ids treated as development (tx-approval) groups. Defaults to "1".
  readonly VITE_QORTIUM_DEV_GROUP_IDS?: string;
  // Chat 2.0 slice 2 (dual-chain): browser-dev fallback node URL for the Qortal
  // protocol, mirroring VITE_QORTIUM_NODE_API_URL above.
  readonly VITE_QORTAL_NODE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  _qdnContext?: unknown;
  _qdnLang?: unknown;
  _qdnLanguage?: unknown;
  _qdnTextSize?: unknown;
  _qdnTheme?: unknown;
  _qdnAccent?: unknown;
  qdnRequest?: <T = unknown>(request: Record<string, unknown>) => Promise<T>;
  // Chat 2.0 slice 2: the Home 2.0 v2 bridge's separate Qortal-protocol global
  // (window.qdnRequest above stays Qortium-only). See qortalRequest.ts.
  qortalRequest?: <T = unknown>(request: Record<string, unknown>) => Promise<T>;
}
