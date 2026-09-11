// Conversation targets supplied by Qortium Home. The values are deliberately
// validated here before they reach the app's selection state: a target can open
// a conversation, but it cannot become an arbitrary search or API input.
import type { ChatNetwork } from './types';

export type ChatDeepLinkTarget = {
  address?: string;
  group?: number;
  network?: ChatNetwork;
};

export type ChatHistoryMode = 'none' | 'push' | 'replace';

// Workspace shown by the app shell. 'chat' is the conversation layout;
// 'developers' overlays the public contract reference (README "Developers")
// without touching the conversation selection or its in-memory draft.
export type ChatView = 'chat' | 'developers';

type LocationLike = {
  hash?: string;
  pathname?: string;
  search?: string;
};

type HistoryLike = {
  pushState(data: unknown, unused: string, url?: string | URL | null): void;
  replaceState(data: unknown, unused: string, url?: string | URL | null): void;
};

type BrowserLike = {
  history: HistoryLike;
  location: LocationLike;
};

export const CHAT_ROUTE_QUERY_KEYS = ['address', 'group', 'network'] as const;

// Fleet Developers-workspace route: `?view=developers` is canonical; the
// `developer`/`reference` spellings are accepted and folded on mount.
export const VIEW_QUERY_PARAM = 'view';
export const DEVELOPERS_VIEW = 'developers';
export const DEVELOPERS_VIEW_ALIASES = ['developer', 'reference'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

// Qortium/Qortal addresses are Base58, start with Q, and are approximately 34
// characters long. This intentionally mirrors the direct-chat address check.
export function isPlausibleQortiumAddress(value: string) {
  return /^Q[1-9A-HJ-NP-Za-km-z]{25,40}$/.test(value);
}

function parseGroupId(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }

  const group = Number(value);

  return Number.isSafeInteger(group) ? group : null;
}

function parseNetwork(value: unknown): ChatNetwork | undefined | null {
  if (value === undefined) {
    return undefined;
  }

  return value === 'qortal' || value === 'qortium' ? value : null;
}

function parseTarget(address: unknown, group: unknown, network: unknown): ChatDeepLinkTarget | null {
  if (address !== undefined && (typeof address !== 'string' || !isPlausibleQortiumAddress(address))) {
    return null;
  }

  if (group !== undefined && typeof group !== 'string') {
    return null;
  }

  const parsedGroup = typeof group === 'string' ? parseGroupId(group) : undefined;
  const parsedNetwork = parseNetwork(network);

  if (parsedGroup === null || parsedNetwork === null) {
    return null;
  }

  if (address === undefined && parsedGroup === undefined) {
    return null;
  }

  return {
    ...(typeof address === 'string' ? { address } : {}),
    ...(typeof parsedGroup === 'number' ? { group: parsedGroup } : {}),
    ...(parsedNetwork ? { network: parsedNetwork } : {}),
  };
}

export function parseDeepLinkSearch(search: string): ChatDeepLinkTarget | null {
  const query = new URLSearchParams(search);

  return parseTarget(
    query.get('address') ?? undefined,
    query.get('group') ?? undefined,
    query.get('network') ?? undefined,
  );
}

export function normalizeChatView(value: string | null | undefined): ChatView {
  const normalized = (value ?? '').trim().toLowerCase();

  return normalized === DEVELOPERS_VIEW || (DEVELOPERS_VIEW_ALIASES as readonly string[]).includes(normalized)
    ? 'developers'
    : 'chat';
}

// Any `view` value (canonical or alias, even when repeated) selects the
// Developers workspace; everything else is the conversation layout.
export function parseChatView(search: string): ChatView {
  const values = new URLSearchParams(search).getAll(VIEW_QUERY_PARAM);

  return values.some((value) => normalizeChatView(value) === 'developers') ? 'developers' : 'chat';
}

function serializeLocation(location: LocationLike, query: URLSearchParams) {
  const serializedQuery = query.toString();

  return `${location.pathname || '/'}${serializedQuery ? `?${serializedQuery}` : ''}${location.hash ?? ''}`;
}

function getCurrentUrl(location: LocationLike) {
  return `${location.pathname || '/'}${location.search ?? ''}${location.hash ?? ''}`;
}

// Rewrite only the conversation target. Home's bridge/display parameters, the
// workspace `view`, and any future host-owned values must survive every
// in-app navigation.
export function getChatRouteUrl(
  target: ChatDeepLinkTarget,
  location: LocationLike = typeof window === 'undefined' ? {} : window.location,
): string {
  const query = new URLSearchParams(location.search ?? '');

  for (const key of CHAT_ROUTE_QUERY_KEYS) {
    query.delete(key);
  }

  // A direct address is the more specific target when an incoming Home link
  // carries both legacy fields. Serializing one target also canonicalizes the
  // URL so later Back/Forward entries are unambiguous.
  if (target.address) {
    query.set('address', target.address);
  } else if (target.group !== undefined) {
    query.set('group', String(target.group));
  }

  if (target.address || target.group !== undefined) {
    query.set('network', target.network ?? 'qortium');
  }

  return serializeLocation(location, query);
}

// Rewrite only the workspace `view`. The conversation keys, host parameters,
// repeated/unknown keys and the fragment all survive, so entering or leaving
// the Developers workspace never changes which conversation the URL names.
export function getChatViewUrl(
  view: ChatView,
  location: LocationLike = typeof window === 'undefined' ? {} : window.location,
): string {
  const query = new URLSearchParams(location.search ?? '');

  query.delete(VIEW_QUERY_PARAM);

  if (view === 'developers') {
    query.set(VIEW_QUERY_PARAM, DEVELOPERS_VIEW);
  }

  return serializeLocation(location, query);
}

export function writeChatRoute(
  target: ChatDeepLinkTarget,
  mode: ChatHistoryMode,
  browser: BrowserLike = window,
): void {
  if (mode === 'none') {
    return;
  }

  const nextUrl = getChatRouteUrl(target, browser.location);

  if (nextUrl === getCurrentUrl(browser.location)) {
    return;
  }

  browser.history[mode === 'replace' ? 'replaceState' : 'pushState']({}, '', nextUrl);
}

export function writeChatView(view: ChatView, mode: ChatHistoryMode, browser: BrowserLike = window): void {
  if (mode === 'none') {
    return;
  }

  const nextUrl = getChatViewUrl(view, browser.location);

  if (nextUrl === getCurrentUrl(browser.location)) {
    return;
  }

  browser.history[mode === 'replace' ? 'replaceState' : 'pushState']({}, '', nextUrl);
}

// Fold `view=developer` / `view=reference` (or a repeated `view`) into the
// canonical `view=developers`, and drop a `view` that does not name a
// workspace, without adding a history entry. Nothing else in the URL changes.
export function canonicalizeChatViewUrl(browser: BrowserLike = window): void {
  const rawValues = new URLSearchParams(browser.location.search ?? '').getAll(VIEW_QUERY_PARAM);

  if (rawValues.length === 0) {
    return;
  }

  const view = parseChatView(browser.location.search ?? '');
  const isCanonical = view === 'developers' ? rawValues.length === 1 && rawValues[0] === DEVELOPERS_VIEW : false;

  if (isCanonical) {
    return;
  }

  writeChatView(view, 'replace', browser);
}

// The conversation the app currently shows, in the shape App.tsx keeps it.
// Only the fields the route names are read.
export type ChatSelectionLike =
  | { kind: 'group'; group: { groupId: number }; network?: ChatNetwork }
  | { kind: 'direct'; direct: { address: string }; network?: ChatNetwork };

// True when a history entry's target names the conversation that is already
// selected. Back/Forward between the chat and Developers workspaces (or
// between reference sections) produces such entries: they must switch only
// the workspace, never re-select the conversation, so the reply/edit context,
// the in-memory draft and the mobile list/conversation state survive.
export function isDeepLinkTargetForSelection(
  target: ChatDeepLinkTarget | null,
  selection: ChatSelectionLike | null,
): boolean {
  if (!target || !selection) {
    return false;
  }

  if ((target.network ?? 'qortium') !== (selection.network ?? 'qortium')) {
    return false;
  }

  return selection.kind === 'group'
    ? target.address === undefined && target.group === selection.group.groupId
    : target.address === selection.direct.address;
}

export function getInitialDeepLinkTarget(): ChatDeepLinkTarget | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return parseDeepLinkSearch(window.location?.search ?? '');
}

export function getInitialChatView(): ChatView {
  if (typeof window === 'undefined') {
    return 'chat';
  }

  return parseChatView(window.location?.search ?? '');
}

export function parseOpenAppTargetMessage(value: unknown): ChatDeepLinkTarget | null {
  if (!isRecord(value) || value.action !== 'OPEN_APP_TARGET' || value.requestedHandler !== 'UI' || !isRecord(value.query)) {
    return null;
  }

  return parseTarget(value.query.address, value.query.group, value.query.network);
}
