// Qortal Hub injects `qortalRequest` as a top-level lexical `const` in the
// page (Core's q-apps.js), not as a `window` property, while Qortium Home 2
// sets window.qortalRequest. This module is the only place that reads the
// lexical global, kept separate from qortalRequest.ts because that file's own
// exported function is also named qortalRequest and would shadow it.
declare const qortalRequest: unknown;

export function getInjectedQortalRequestGlobal():
  (<T = unknown>(request: Record<string, unknown>) => Promise<T>) | undefined {
  if (typeof window !== 'undefined' && typeof window.qortalRequest === 'function') {
    return window.qortalRequest as <T = unknown>(request: Record<string, unknown>) => Promise<T>;
  }

  try {
    if (typeof qortalRequest === 'function') {
      return qortalRequest as <T = unknown>(request: Record<string, unknown>) => Promise<T>;
    }
  } catch {
    // ReferenceError in TDZ or undeclared — treat as absent.
  }

  return undefined;
}
