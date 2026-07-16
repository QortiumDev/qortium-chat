// Conversation targets supplied by Qortium Home. The values are deliberately
// validated here before they reach the app's selection state: a target can open
// a conversation, but it cannot become an arbitrary search or API input.
export type ChatDeepLinkTarget = {
  address?: string;
  group?: number;
};

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

function parseTarget(address: unknown, group: unknown): ChatDeepLinkTarget | null {
  if (address !== undefined && (typeof address !== 'string' || !isPlausibleQortiumAddress(address))) {
    return null;
  }

  if (group !== undefined && typeof group !== 'string') {
    return null;
  }

  const parsedGroup = typeof group === 'string' ? parseGroupId(group) : undefined;

  if (parsedGroup === null) {
    return null;
  }

  if (address === undefined && parsedGroup === undefined) {
    return null;
  }

  return {
    ...(typeof address === 'string' ? { address } : {}),
    ...(typeof parsedGroup === 'number' ? { group: parsedGroup } : {}),
  };
}

export function parseDeepLinkSearch(search: string): ChatDeepLinkTarget | null {
  const query = new URLSearchParams(search);

  return parseTarget(query.get('address') ?? undefined, query.get('group') ?? undefined);
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

  return parseTarget(value.query.address, value.query.group);
}
