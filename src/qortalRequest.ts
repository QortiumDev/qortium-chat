// Home 2 exposes Qortal through a dedicated window.qortalRequest bridge. Home
// 1.7 exposes the same bounded Qortal group-chat foundation through older,
// Qortal-prefixed actions on window.qdnRequest (the contract ChibiHub uses).
// This adapter normalizes both hosts to the Home 2 action names consumed by the
// rest of Chat; it never moves account keys or signing into the QDN app.
import type { BridgeHost, BridgeState, BridgeTransport, NodeApiFetchResult, QdnAction } from './types';
import { classifyBridgeHost, classifyBridgeTransport, hasHomeBridge, qdnRequest } from './qdnRequest';
import { buildQortalHubGroupChatPayload, normalizeQortalOutgoingMessage } from './qortalChatPayload';
import { getInjectedQortalRequestGlobal } from './qortalGlobal';

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

const LEGACY_QORTAL_ACTIONS: Readonly<Record<string, string>> = Object.freeze({
  FETCH_NODE_API: 'FETCH_QORTAL_NODE_API',
  FETCH_QDN_RESOURCE: 'FETCH_QORTAL_RESOURCE',
  GET_ACCOUNT_GROUPS: 'GET_QORTAL_ACCOUNT_GROUPS',
  GET_ACCOUNT_NAMES: 'GET_QORTAL_ACCOUNT_NAMES',
  GET_ACTIVE_CHATS: 'GET_QORTAL_ACTIVE_CHATS',
  GET_CHAT_MESSAGE: 'GET_QORTAL_CHAT_MESSAGE',
  GET_NAME_DATA: 'GET_QORTAL_NAME_DATA',
  GET_NODE_STATUS: 'GET_QORTAL_NODE_STATUS',
  GET_PRIMARY_NAME: 'GET_QORTAL_PRIMARY_NAME',
  GET_QDN_RESOURCE_METADATA: 'GET_QORTAL_RESOURCE_METADATA',
  GET_QDN_RESOURCE_STATUS: 'GET_QORTAL_RESOURCE_STATUS',
  GET_QDN_RESOURCE_URL: 'GET_QORTAL_RESOURCE_URL',
  SEARCH_CHAT_MESSAGES: 'GET_QORTAL_CHAT_MESSAGES',
  SEARCH_QDN_RESOURCES: 'SEARCH_QORTAL_RESOURCES',
  SEARCH_TRANSACTIONS: 'SEARCH_QORTAL_TRANSACTIONS',
  SEND_CHAT_MESSAGE: 'SEND_QORTAL_GROUP_CHAT',
});

const LEGACY_PASSTHROUGH_ACTIONS = ['SHOW_ACTIONS', 'WHICH_UI'] as const;

function getLegacyQortalActions(value: unknown): QdnAction[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const legacyActions = new Set(
    value.filter((action): action is string => typeof action === 'string').map((action) => action.toUpperCase()),
  );
  const actions = Object.entries(LEGACY_QORTAL_ACTIONS)
    .filter(([, legacyAction]) => legacyActions.has(legacyAction))
    .map(([action]) => action);

  if (legacyActions.has('GET_SELECTED_ACCOUNT')) {
    actions.push('GET_USER_ACCOUNT');
  }

  for (const action of LEGACY_PASSTHROUGH_ACTIONS) {
    if (legacyActions.has(action)) {
      actions.push(action);
    }
  }

  // Home 1.7 chooses a healthy local or public Qortal read node internally.
  // It has no separate Qortal node-mode action, and this first compatibility
  // slice exposes only public groups, so reporting false avoids accidentally
  // applying the primary Qortium connection's mode to Qortal.
  actions.push('IS_USING_PUBLIC_NODE');

  return Array.from(new Set(actions));
}

// Hub does not advertise GET_ACCOUNT_GROUPS (core q-apps.js handles only
// LIST_GROUPS etc.), so it is required only for non-Hub hosts.
export function hasQortalChatBridgeActions(actions: readonly string[], host?: BridgeHost) {
  const available = new Set(actions.map((action) => action.toUpperCase()));

  return (
    available.has('GET_USER_ACCOUNT') &&
    available.has('SEARCH_CHAT_MESSAGES') &&
    (host === 'hub' || available.has('GET_ACCOUNT_GROUPS'))
  );
}

async function requestLegacyQortal<T>(request: QortalRequestPayload): Promise<T> {
  const action = request.action.toUpperCase();

  if (action === 'SHOW_ACTIONS') {
    return getLegacyQortalActions(await qdnRequest<unknown>({ action: 'SHOW_ACTIONS' })) as T;
  }

  if (action === 'WHICH_UI') {
    return qdnRequest<T>({ action: 'WHICH_UI' });
  }

  if (action === 'IS_USING_PUBLIC_NODE') {
    return false as T;
  }

  if (action === 'GET_USER_ACCOUNT') {
    const account = await qdnRequest<{ address: string; publicKey?: string | null }>({
      action: 'GET_SELECTED_ACCOUNT',
    });

    return { address: account.address, publicKey: account.publicKey ?? null } as T;
  }

  const legacyAction = LEGACY_QORTAL_ACTIONS[action];

  if (!legacyAction) {
    throw new Error(`${request.action} is not available through the Home 1.7 Qortal bridge.`);
  }

  if (action === 'SEND_CHAT_MESSAGE') {
    if (typeof request.chatReference === 'string' && request.chatReference) {
      throw new Error('Qortal edits and reactions require a newer Home bridge.');
    }

    if (typeof request.message !== 'string') {
      throw new Error('Qortal chat messages require text.');
    }

    const outgoing = normalizeQortalOutgoingMessage(request.message);

    return qdnRequest<T>({
      action: legacyAction,
      groupId: request.groupId,
      repliedTo: outgoing.repliedTo ?? undefined,
      text: outgoing.text,
      txGroupId: request.txGroupId,
    });
  }

  const { action: _action, ...requestValue } = request;

  return qdnRequest<T>({ action: legacyAction, ...requestValue });
}

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

/** True when a dedicated qortalRequest protocol global exists — Home 2's
 * window.qortalRequest, or Qortal Hub's top-level lexical const (see
 * qortalGlobal.ts). Home 1.7 is detected separately and must prove its
 * Qortal-prefixed action catalogue before Chat shows the network section. */
export function hasQortalHomeBridge() {
  return getInjectedQortalRequestGlobal() !== undefined;
}

export function hasLegacyQortalBridgeCandidate() {
  return !hasQortalHomeBridge() && hasHomeBridge();
}

export async function qortalRequest<T = unknown>(request: QortalRequestPayload): Promise<T> {
  if (!isRecord(request) || typeof request.action !== 'string') {
    throw new Error('Qortal requests must include an action.');
  }

  const bridgeRequest = getInjectedQortalRequestGlobal();

  if (typeof bridgeRequest === 'function') {
    if (request.action.toUpperCase() === 'SEND_CHAT_MESSAGE') {
      if (typeof request.chatReference === 'string' && request.chatReference) {
        throw new Error('Qortal edits and reactions require a newer Home bridge.');
      }

      if (typeof request.message !== 'string') {
        throw new Error('Qortal chat messages require text.');
      }

      return bridgeRequest<T>({
        ...request,
        message: buildQortalHubGroupChatPayload(normalizeQortalOutgoingMessage(request.message)),
      });
    }

    return bridgeRequest<T>(request);
  }

  if (hasLegacyQortalBridgeCandidate()) {
    return requestLegacyQortal<T>(request);
  }

  return fallbackQortalRequest<T>(request);
}

export async function getQortalBridgeState(): Promise<BridgeState> {
  const hasDedicatedBridge = hasQortalHomeBridge();
  const hasLegacyCandidate = hasLegacyQortalBridgeCandidate();
  const hasInjectedBridge = hasDedicatedBridge || hasLegacyCandidate;
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

  // Hub-ness only needs `ui`, not the transport it feeds into below — resolve
  // it first so the GET_ACCOUNT_GROUPS relaxation applies to the capability
  // check that decides transport itself.
  const normalizedUi = ui.trim().toUpperCase();
  const isHubUi = normalizedUi === 'HUB_ELECTRON' || normalizedUi === 'HUB_WEB';
  const hasQortalCapabilities = hasQortalChatBridgeActions(actions, isHubUi ? 'hub' : undefined);
  const transport: BridgeTransport = classifyBridgeTransport(
    ui,
    hasDedicatedBridge || (hasLegacyCandidate && hasQortalCapabilities),
  );
  const host = classifyBridgeHost(ui, transport, {
    isLegacyAdapter: !hasDedicatedBridge && hasLegacyCandidate,
  });

  return {
    actions,
    host,
    isHomeBridge: transport === 'home',
    isUsingPublicNode,
    transport,
    ui,
  };
}
