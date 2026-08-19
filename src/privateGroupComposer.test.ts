import { describe, expect, it } from 'vitest';
import { getPrivateGroupComposerMaxPlaintextBytes, getUtf8ByteLength } from './privateGroupComposer';
import type { QortalPrivateGroupChatState, QortiumPrivateGroupChatState } from './types';

const qortiumState: QortiumPrivateGroupChatState = {
  allPublicKeysKnown: true,
  available: true,
  epochId: new Uint8Array(32),
  groupId: 7,
  isOpen: false,
  maxMessagePlaintextBytes: 4096,
  memberCount: 3,
  memberPublicKeys: [],
  qpgcVersion: 1,
};

const qortalState: QortalPrivateGroupChatState = {
  available: true,
  groupId: 7,
  groupName: 'Secret',
  isMember: true,
  isOpen: false,
  memberCount: 3,
  publisherName: null,
  qortalPrivateGroupVersion: 1,
  recipientCount: null,
  resourceSignature: null,
  rotationRequired: false,
};

describe('getPrivateGroupComposerMaxPlaintextBytes', () => {
  it('is always the fixed Qortal cap on qortal, regardless of state', () => {
    expect(getPrivateGroupComposerMaxPlaintextBytes('qortal', null)).toBe(2225);
    expect(getPrivateGroupComposerMaxPlaintextBytes('qortal', qortiumState)).toBe(2225);
  });

  it('reads maxMessagePlaintextBytes from Qortium state when available', () => {
    expect(getPrivateGroupComposerMaxPlaintextBytes('qortium', qortiumState)).toBe(4096);
  });

  it('is undefined on qortium when state has not loaded or is the wrong shape', () => {
    expect(getPrivateGroupComposerMaxPlaintextBytes('qortium', null)).toBeUndefined();
    expect(getPrivateGroupComposerMaxPlaintextBytes('qortium', qortalState)).toBeUndefined();
  });
});

describe('getUtf8ByteLength', () => {
  it('counts ASCII as one byte per character', () => {
    expect(getUtf8ByteLength('hello')).toBe(5);
  });

  it('counts multi-byte characters by their UTF-8 encoding, not code-unit count', () => {
    expect(getUtf8ByteLength('日本語')).toBe(9);
  });
});
