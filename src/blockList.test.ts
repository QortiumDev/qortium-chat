import { describe, expect, it } from 'vitest';

import {
  filterBlockedMessages,
  getBlockListActions,
  getBlockListCapability,
  isBlockListUnavailableError,
  isBlockedSender,
  normalizeBlockedAddresses,
} from './blockList';
import type { QdnAction } from './types';

const home: QdnAction[] = ['GET_LIST', 'ADD_TO_LIST', 'REMOVE_FROM_LIST', 'SEND_CHAT_MESSAGE'];
const hub: QdnAction[] = ['GET_LIST_ITEMS', 'ADD_LIST_ITEMS', 'DELETE_LIST_ITEM'];

describe('block list (G5)', () => {
  it('detects the host dialect and the write capability per network', () => {
    expect(getBlockListActions('qortium', home)?.read).toBe('GET_LIST');
    expect(getBlockListActions('qortal', hub)?.read).toBe('GET_LIST_ITEMS');
    // Home 2 does not offer lists on qortalRequest; a Qortium host with the Home dialect still reads.
    expect(getBlockListActions('qortal', home)?.read).toBe('GET_LIST');
    expect(getBlockListActions('qortium', hub)).toBeNull();
    expect(getBlockListCapability('qortium', home)).toEqual({ read: true, write: true });
    expect(getBlockListCapability('qortium', ['GET_LIST'])).toEqual({ read: true, write: false });
    expect(getBlockListCapability('qortium', ['get_list', 'add_to_list', 'remove_from_list'])).toEqual({ read: true, write: true });
    expect(getBlockListCapability('qortal', ['GET_LIST_ITEMS', 'ADD_LIST_ITEMS'])).toEqual({ read: true, write: false });
    expect(getBlockListCapability('qortium', [])).toEqual({ read: false, write: false });
    expect(getBlockListCapability('qortium', undefined)).toEqual({ read: false, write: false });
  });

  it('normalizes Core and wrapped list answers, trimming and de-duplicating', () => {
    expect([...normalizeBlockedAddresses(['Qa', ' Qb ', 'Qa', '', 7, null])]).toEqual(['Qa', 'Qb']);
    expect([...normalizeBlockedAddresses({ items: ['Qc'] })]).toEqual(['Qc']);
    expect(normalizeBlockedAddresses(null).size).toBe(0);
    expect(normalizeBlockedAddresses('nope').size).toBe(0);
  });

  it('treats an unadministered node as "unavailable", not as an error', () => {
    expect(isBlockListUnavailableError(new Error('NODE_CAPABILITY_MISSING: attach an API key'))).toBe(true);
    expect(isBlockListUnavailableError(new Error('Lists need an administered node.'))).toBe(true);
    expect(isBlockListUnavailableError(new Error('Node lookup returned HTTP 403.'))).toBe(true);
    expect(isBlockListUnavailableError(new Error('The node lookup failed.'))).toBe(false);
  });

  it('filters every frame from a blocked sender and nothing else', () => {
    const blocked = new Set(['Qbad']);
    const messages = [
      { sender: 'Qgood', signature: '1' },
      { sender: 'Qbad', signature: '2' },
      { sender: 'Qbad', signature: '3', chatReference: '1' },
      { sender: 'Qother', signature: '4', chatReference: '2' },
    ];
    expect(filterBlockedMessages(messages, blocked).map((m) => m.signature)).toEqual(['1', '4']);
    expect(filterBlockedMessages(messages, null)).toBe(messages);
    expect(filterBlockedMessages(messages, new Set())).toBe(messages);
    expect(isBlockedSender(blocked, 'Qbad')).toBe(true);
    expect(isBlockedSender(blocked, 'Qgood')).toBe(false);
    expect(isBlockedSender(null, 'Qbad')).toBe(false);
  });
});
