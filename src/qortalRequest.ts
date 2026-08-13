// Mirrors qdnRequest.ts for the Qortal protocol: Home 2.0's v2 bridge exposes
// Qortium as window.qdnRequest and Qortal as a SEPARATE global,
// window.qortalRequest, each with its own SHOW_ACTIONS catalogue (see
// docs/HOME_V2_BRIDGE_COMPATIBILITY.md in qortium-home). The two entry points
// are kept deliberately distinct (not merged into one "network" bridge file)
// so a Qortium-only host is never at risk of a Qortal code path — the whole
// module is a no-op unless window.qortalRequest exists or a caller invokes it
// directly (browser-dev fallback below).
import type { BridgeState, BridgeTransport, NodeApiFetchResult, QdnAction } from './types';
import { classifyBridgeTransport } from './qdnRequest';

const DEFAULT_NODE_API_URL = 'http://127.0.0.1:12391';

export const LOCAL_READ_ACTIONS = [
  'FETCH_NODE_API',
  'GET_NODE_STATUS',
  'IS_USING_PUBLIC_NODE',
  'SHOW_ACTIONS',
  'WHICH_UI',
] as const;

type QortalRequestPayload = {
  action: string;
  maxBytes?: number;
  method?: string;
  path?: string;
  [key: string]: unknown;
};

export function getNodeApiUrl() {
  return (import.meta.env.VITE_QORTAL_NODE_API_URL || DEFAULT_NODE_API_URL).replace(/\/+$/, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseResponseData(body: string, contentType: string) {
  if (!body) {
    return null;
  }

  if (contentType.toLowerCase().includes('json') || /^[\s\n\r]*[\[{]/.test(body)) {
    try {
      return JSON.parse(body) as unknown;
    } catch {
      return body;
    }
  }

  return body;
}

function sanitizeNodePath(path: unknown) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
    throw new Error('Node API paths must start with /.');
  }

  if (/[\x00-\x1F]/.test(path)) {
    throw new Error('Node API path contains invalid control characters.');
  }

  const url = new URL(path, DEFAULT_NODE_API_URL);

  return `${url.pathname}${url.search}`;
}

function sanitizeReadMethod(method: unknown) {
  const normalizedMethod = typeof method === 'string' && method.trim() ? method.trim().toUpperCase() : 'GET';

  if (normalizedMethod !== 'GET' && normalizedMethod !== 'HEAD') {
    throw new Error('Only GET and HEAD node API requests are supported.');
  }

  return normalizedMethod;
}

function getContentLength(response: Response, bodyLength: number) {
  const rawLength = response.headers.get('content-length');
  const contentLength = rawLength ? Number(rawLength) : bodyLength;

  return Number.isFinite(contentLength) ? contentLength : undefined;
}

async function fetchLocalNodeApi(request: QortalRequestPayload): Promise<NodeApiFetchResult> {
  const method = sanitizeReadMethod(request.method);
  const apiPath = sanitizeNodePath(request.path);
  const response = await fetch(`${getNodeApiUrl()}${apiPath}`, { method });
  const contentType = response.headers.get('content-type') ?? '';
  const body = method === 'HEAD' ? '' : await response.text();
  const bodyLength = new TextEncoder().encode(body).byteLength;
  const maxBytes = typeof request.maxBytes === 'number' ? request.maxBytes : 0;

  if (maxBytes > 0 && bodyLength > maxBytes) {
    throw new Error(`Node API response exceeded the ${maxBytes.toLocaleString()} byte limit.`);
  }

  return {
    body,
    contentLength: getContentLength(response, bodyLength),
    contentType,
    data: parseResponseData(body, contentType),
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
  };
}

async function fallbackQortalRequest<T>(request: QortalRequestPayload): Promise<T> {
  switch (request.action.toUpperCase()) {
    case 'SHOW_ACTIONS':
      return [...LOCAL_READ_ACTIONS] as T;
    case 'WHICH_UI':
      return 'BROWSER_DEV' as T;
    case 'IS_USING_PUBLIC_NODE':
      return false as T;
    case 'FETCH_NODE_API':
      return (await fetchLocalNodeApi(request)) as T;
    case 'GET_NODE_STATUS': {
      const result = await fetchLocalNodeApi({ action: 'FETCH_NODE_API', path: '/admin/status' });

      if (!result.ok) {
        throw new Error(result.body || `Node status failed with HTTP ${result.status}.`);
      }

      return result.data as T;
    }
    case 'GET_USER_ACCOUNT':
      throw new Error('Qortal user account is only available inside Qortium Home.');
    default:
      throw new Error(`${request.action} is not available in local browser development.`);
  }
}

/** True only when the host actually injected window.qortalRequest — an older
 * Home build (or a Qortium-only gateway) never sets this global, which is the
 * signal the app uses to hide the whole Qortal section rather than just
 * gating individual actions. */
export function hasQortalHomeBridge() {
  return typeof window !== 'undefined' && typeof window.qortalRequest === 'function';
}

export async function qortalRequest<T = unknown>(request: QortalRequestPayload): Promise<T> {
  if (!isRecord(request) || typeof request.action !== 'string') {
    throw new Error('Qortal requests must include an action.');
  }

  const bridgeRequest = typeof window !== 'undefined' ? window.qortalRequest : undefined;

  if (typeof bridgeRequest === 'function') {
    return bridgeRequest<T>(request);
  }

  return fallbackQortalRequest<T>(request);
}

export async function getQortalBridgeState(): Promise<BridgeState> {
  const hasInjectedBridge = hasQortalHomeBridge();
  let actions: QdnAction[] = [];
  let ui = hasInjectedBridge ? 'QORTIUM_HOME_ELECTRON' : 'BROWSER_DEV';
  let isUsingPublicNode = false;

  try {
    const requestedActions = await qortalRequest<unknown>({ action: 'SHOW_ACTIONS' });

    actions = Array.isArray(requestedActions)
      ? requestedActions.filter((action): action is QdnAction => typeof action === 'string')
      : [];
  } catch {
    actions = [...LOCAL_READ_ACTIONS];
  }

  try {
    const requestedUi = await qortalRequest<unknown>({ action: 'WHICH_UI' });

    if (typeof requestedUi === 'string' && requestedUi) {
      ui = requestedUi;
    }
  } catch {
    // Keep the inferred UI label.
  }

  try {
    isUsingPublicNode = (await qortalRequest<unknown>({ action: 'IS_USING_PUBLIC_NODE' })) === true;
  } catch {
    isUsingPublicNode = false;
  }

  const transport: BridgeTransport = classifyBridgeTransport(ui, hasInjectedBridge);

  return {
    actions,
    isHomeBridge: transport === 'home',
    isUsingPublicNode,
    transport,
    ui,
  };
}
