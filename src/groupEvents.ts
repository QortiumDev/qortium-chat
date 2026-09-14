// Chat 2.0.20 — everyone's group system messages (parity gap G2).
//
// Hub interleaves confirmed membership/administration transactions for ALL
// members into the group feed; Chat only showed the acting user's own tracked
// transactions. Home 2 and Hub both expose SEARCH_TRANSACTIONS (txType list,
// confirmation status, limit, reverse), but Core's search has no group filter
// for these types — the group id lives in each transaction's body — so, like
// HubCE, Chat fetches the newest N of each type and filters client-side. This
// module is the pure part: normalising the raw transactions into events and
// inferring the two composite kinds (a join REQUEST to a closed group, and the
// admin invite that APPROVES it).

import type { ChatNetwork } from './types';

export const GROUP_EVENT_TX_TYPES = [
  'JOIN_GROUP',
  'LEAVE_GROUP',
  'GROUP_KICK',
  'GROUP_BAN',
  'CANCEL_GROUP_BAN',
  'GROUP_INVITE',
  'CANCEL_GROUP_INVITE',
  'ADD_GROUP_ADMIN',
  'REMOVE_GROUP_ADMIN',
  'UPDATE_GROUP',
] as const;

export type GroupEventTxType = (typeof GROUP_EVENT_TX_TYPES)[number];

export type GroupEventKind =
  | 'adminAdded'
  | 'adminRemoved'
  | 'approved'
  | 'banned'
  | 'inviteCancelled'
  | 'invited'
  | 'joinRequested'
  | 'joined'
  | 'kicked'
  | 'left'
  | 'unbanned'
  | 'updated';

export type GroupEvent = {
  /** The acting account (creatorAddress). */
  actor: string;
  groupId: number;
  id: string;
  kind: GroupEventKind;
  network: ChatNetwork;
  /** The affected account for two-party events (kick/ban/invite/admin). */
  target: string | null;
  timestamp: number;
};

/** How far back the feed shows events (HubCE: 24 h). */
export const GROUP_EVENT_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Newest transactions requested per sweep (Home caps SEARCH_TRANSACTIONS at 100). */
export const GROUP_EVENT_FETCH_LIMIT = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function numberField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return null;
}

/**
 * Turns raw `/transactions/search` rows into this group's events, newest
 * last. `isOpen` drives the join inference: a JOIN_GROUP into a closed group
 * with no earlier GROUP_INVITE for that account is a join request, and a
 * GROUP_INVITE that follows such a request is the approval.
 */
export function normalizeGroupEvents(
  rows: readonly unknown[],
  input: { groupId: number; isOpen: boolean; network: ChatNetwork; now: number; windowMs?: number },
): GroupEvent[] {
  const cutoff = input.now - (input.windowMs ?? GROUP_EVENT_WINDOW_MS);
  const events: GroupEvent[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (!isRecord(row)) continue;
    if (numberField(row, 'groupId') !== input.groupId) continue;
    const type = stringField(row, 'type', 'txType')?.toUpperCase() as GroupEventTxType | undefined;
    const timestamp = numberField(row, 'timestamp');
    const actor = stringField(row, 'creatorAddress');
    const signature = stringField(row, 'signature');
    if (!type || !GROUP_EVENT_TX_TYPES.includes(type) || timestamp === null || !actor || timestamp < cutoff) continue;
    const id = signature ?? `${input.network}:${type}:${input.groupId}:${timestamp}:${actor}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const base = { actor, groupId: input.groupId, id, network: input.network, timestamp };

    switch (type) {
      case 'JOIN_GROUP':
        events.push({ ...base, kind: 'joined', target: null });
        break;
      case 'LEAVE_GROUP':
        events.push({ ...base, kind: 'left', target: null });
        break;
      case 'GROUP_KICK':
        events.push({ ...base, kind: 'kicked', target: stringField(row, 'member') });
        break;
      case 'GROUP_BAN':
        events.push({ ...base, kind: 'banned', target: stringField(row, 'offender', 'member') });
        break;
      case 'CANCEL_GROUP_BAN':
        events.push({ ...base, kind: 'unbanned', target: stringField(row, 'member', 'offender') });
        break;
      case 'GROUP_INVITE':
        events.push({ ...base, kind: 'invited', target: stringField(row, 'invitee') });
        break;
      case 'CANCEL_GROUP_INVITE':
        events.push({ ...base, kind: 'inviteCancelled', target: stringField(row, 'invitee') });
        break;
      case 'ADD_GROUP_ADMIN':
        events.push({ ...base, kind: 'adminAdded', target: stringField(row, 'member') });
        break;
      case 'REMOVE_GROUP_ADMIN':
        events.push({ ...base, kind: 'adminRemoved', target: stringField(row, 'admin', 'member') });
        break;
      case 'UPDATE_GROUP':
        events.push({ ...base, kind: 'updated', target: null });
        break;
    }
  }

  events.sort((left, right) => left.timestamp - right.timestamp || left.id.localeCompare(right.id));

  if (!input.isOpen) {
    // Closed group: a join without a preceding invite is a request; the
    // invite that follows a request is the approval.
    const invitedBefore = new Set<string>();
    const requestedBefore = new Set<string>();

    for (const event of events) {
      if (event.kind === 'joined') {
        if (!invitedBefore.has(event.actor)) {
          event.kind = 'joinRequested';
          requestedBefore.add(event.actor);
        }
      } else if (event.kind === 'invited' && event.target) {
        if (requestedBefore.has(event.target)) {
          event.kind = 'approved';
          requestedBefore.delete(event.target);
        }
        invitedBefore.add(event.target);
      }
    }
  }

  return events;
}

/** Merges events from several sweeps, newest wins on id collisions, sorted. */
export function mergeGroupEvents(...lists: readonly (readonly GroupEvent[])[]): GroupEvent[] {
  const byId = new Map<string, GroupEvent>();
  for (const list of lists) for (const event of list) byId.set(event.id, event);
  return [...byId.values()].sort((left, right) => left.timestamp - right.timestamp || left.id.localeCompare(right.id));
}
