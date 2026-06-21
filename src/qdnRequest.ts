import type { BridgeState, NodeApiFetchResult, QdnAction } from './types';

const DEFAULT_NODE_API_URL = 'http://127.0.0.1:24891';

export const LOCAL_READ_ACTIONS = [
  'FETCH_NODE_API',
  'GET_NODE_STATUS',
  'IS_USING_PUBLIC_NODE',
  'SHOW_ACTIONS',
  'WHICH_UI',
] as const;

type QdnRequest = {
  action: string;
  maxBytes?: number;
  method?: string;
  path?: string;
  [key: string]: unknown;
};

export function getNodeApiUrl() {
  return (import.meta.env.VITE_QORTIUM_NODE_API_URL || DEFAULT_NODE_API_URL).replace(/\/+$/, '');
}

export function buildNodeWebSocketUrl(path: string) {
  const baseUrl =
    typeof window !== 'undefined' && hasHomeBridge()
      ? window.location.origin
      : getNodeApiUrl();
  const url = new URL(path, baseUrl);

  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';

  return url.toString();
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

async function fetchLocalNodeApi(request: QdnRequest): Promise<NodeApiFetchResult> {
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

async function fallbackQdnRequest<T>(request: QdnRequest): Promise<T> {
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
    case 'GET_SELECTED_ACCOUNT':
      throw new Error('Selected account is only available inside Qortium Home.');
    default:
      throw new Error(`${request.action} is not available in local browser development.`);
  }
}

export function hasHomeBridge() {
  return typeof window !== 'undefined' && typeof window.qdnRequest === 'function';
}

export async function qdnRequest<T = unknown>(request: QdnRequest): Promise<T> {
  if (!isRecord(request) || typeof request.action !== 'string') {
    throw new Error('QDN requests must include an action.');
  }

  const bridgeRequest = typeof window !== 'undefined' ? window.qdnRequest : undefined;

  if (typeof bridgeRequest === 'function') {
    return bridgeRequest<T>(request);
  }

  return fallbackQdnRequest<T>(request);
}

export async function getBridgeState(): Promise<BridgeState> {
  let actions: QdnAction[] = [];
  let ui = hasHomeBridge() ? 'QORTIUM_HOME_ELECTRON' : 'BROWSER_DEV';
  let isUsingPublicNode = false;

  try {
    const requestedActions = await qdnRequest<unknown>({ action: 'SHOW_ACTIONS' });

    actions = Array.isArray(requestedActions)
      ? requestedActions.filter((action): action is QdnAction => typeof action === 'string')
      : [];
  } catch {
    actions = [...LOCAL_READ_ACTIONS];
  }

  try {
    const requestedUi = await qdnRequest<unknown>({ action: 'WHICH_UI' });

    if (typeof requestedUi === 'string' && requestedUi) {
      ui = requestedUi;
    }
  } catch {
    // Keep the inferred UI label.
  }

  try {
    // Home reports whether chat is bound to a public/network node. There, sends
    // are keyless and only open groups are accepted; direct and closed-group
    // sends must be gated off. Default to false (trusted local/custom node).
    isUsingPublicNode = (await qdnRequest<unknown>({ action: 'IS_USING_PUBLIC_NODE' })) === true;
  } catch {
    isUsingPublicNode = false;
  }

  return {
    actions,
    isHomeBridge: hasHomeBridge(),
    isUsingPublicNode,
    ui,
  };
}

export function hasAction(actions: QdnAction[], ...candidates: string[]) {
  const actionSet = new Set(actions.map((action) => action.toUpperCase()));

  return candidates.some((candidate) => actionSet.has(candidate.toUpperCase()));
}
