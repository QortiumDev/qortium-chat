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

const CHAT_ROUTE_QUERY_KEYS = ['address', 'group', 'network'] as const;

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

// Rewrite only the conversation target. Home's bridge/display parameters and
// any future host-owned values must survive every in-app navigation.
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

  const serializedQuery = query.toString();

  return `${location.pathname || '/'}${serializedQuery ? `?${serializedQuery}` : ''}${location.hash ?? ''}`;
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
  const currentUrl = `${browser.location.pathname || '/'}${browser.location.search ?? ''}${browser.location.hash ?? ''}`;

  if (nextUrl === currentUrl) {
    return;
  }

  browser.history[mode === 'replace' ? 'replaceState' : 'pushState']({}, '', nextUrl);
}

export function getInitialDeepLinkTarget(): ChatDeepLinkTarget | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return parseDeepLinkSearch(window.location?.search ?? '');
}

export function parseOpenAppTargetMessage(value: unknown): ChatDeepLinkTarget | null {
  if (!isRecord(value) || value.action !== 'OPEN_APP_TARGET' || value.requestedHandler !== 'UI' || !isRecord(value.query)) {
    return null;
  }

  return parseTarget(value.query.address, value.query.group, value.query.network);
}
