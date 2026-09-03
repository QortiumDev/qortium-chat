import { describe, expect, it } from 'vitest';
import { hasLegacyHomeDirectSend, hasLegacyHomePrivateGroupSend, isLegacyHomePreBroadcastRefusal } from './legacyHome';

// Home 1.8.0 SHOW_ACTIONS on a local node (electron/qdn-app-actions.ts at v1.8.0).
const HOME_1X_LOCAL = [
  'SEND_CHAT_MESSAGE',
  'SEARCH_CHAT_MESSAGES',
  'GET_PRIVATE_GROUP_ACTIVE_CHATS',
  'SEARCH_PRIVATE_GROUP_CHAT_MESSAGES',
  'REQUEST_PRIVATE_GROUP_CHAT_KEY',
  'GET_PRIVATE_DIRECT_ACTIVE_CHATS',
  'SEARCH_PRIVATE_DIRECT_CHAT_MESSAGES',
];
// Same host on a public/network node: the private family is stripped.
const HOME_1X_PUBLIC = ['SEND_CHAT_MESSAGE', 'SEARCH_CHAT_MESSAGES'];
// Home 2 advertises the exact family alongside the reads.
const HOME_2 = [
  ...HOME_1X_LOCAL,
  'SEND_PRIVATE_GROUP_CHAT_MESSAGE',
  'GET_PRIVATE_GROUP_CHAT_STATE',
  'SEND_DIRECT_CHAT_MESSAGE',
];
// Qortal Hub: generic send, no private reads.
const HUB = ['SEND_CHAT_MESSAGE', 'SEARCH_CHAT_MESSAGES', 'SIGN_TRANSACTION'];

describe('legacy Home private-send detection', () => {
  it('matches Home 1.x on a trusted node only', () => {
    expect(hasLegacyHomePrivateGroupSend(HOME_1X_LOCAL)).toBe(true);
    expect(hasLegacyHomeDirectSend(HOME_1X_LOCAL)).toBe(true);
  });

  it('does not match Home 1.x on a public node (reads stripped, sends refused)', () => {
    expect(hasLegacyHomePrivateGroupSend(HOME_1X_PUBLIC)).toBe(false);
    expect(hasLegacyHomeDirectSend(HOME_1X_PUBLIC)).toBe(false);
  });

  it('does not match Home 2, Hub, an empty list, or no list', () => {
    for (const actions of [HOME_2, HUB, [], undefined]) {
      expect(hasLegacyHomePrivateGroupSend(actions)).toBe(false);
      expect(hasLegacyHomeDirectSend(actions)).toBe(false);
    }
  });

  it('is case-insensitive like hasAction', () => {
    expect(hasLegacyHomePrivateGroupSend(HOME_1X_LOCAL.map((action) => action.toLowerCase()))).toBe(true);
  });
});

describe('isLegacyHomePreBroadcastRefusal', () => {
  it('recognises Home 1.x\'s Core-offline refusal, which happens before anything is signed', () => {
    expect(
      isLegacyHomePreBroadcastRefusal(
        'Start Qortium Core from Home, or save the local node API key before using protected QDN workflows.',
      ),
    ).toBe(true);
  });

  it('does not match other errors', () => {
    expect(isLegacyHomePreBroadcastRefusal('Chat send did not return a transaction signature.')).toBe(false);
    expect(isLegacyHomePreBroadcastRefusal('')).toBe(false);
  });
});
