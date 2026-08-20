import { describe, expect, it } from 'vitest';
import {
  getPrivateGroupComposerMaxPlaintextBytes,
  getPrivateGroupKeyAvailability,
  getUtf8ByteLength,
  isPrivateGroupKeyActionOutcomeUnknown,
} from './privateGroupComposer';
import type { QortalPrivateGroupChatState, QortiumPrivateGroupChatState } from './types';

const qortiumState: QortiumPrivateGroupChatState = {
  allPublicKeysKnown: true,
  available: true,
  epochId: new Uint8Array(32),
  groupId: 7,
  isOpen: false,
  keyAvailable: false,
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

describe('getPrivateGroupKeyAvailability', () => {
  it('uses Home account-relative Qortium key availability', () => {
    expect(getPrivateGroupKeyAvailability('qortium', qortiumState)).toBe(false);
    expect(getPrivateGroupKeyAvailability('qortium', { ...qortiumState, keyAvailable: true })).toBe(true);
  });

  it('uses Qortal bundle availability and preserves older-Home compatibility', () => {
    expect(getPrivateGroupKeyAvailability('qortal', qortalState)).toBe(true);
    expect(getPrivateGroupKeyAvailability('qortal', { ...qortalState, available: false })).toBe(false);
    const { keyAvailable: _omitted, ...legacyQortiumState } = qortiumState;
    expect(getPrivateGroupKeyAvailability('qortium', legacyQortiumState)).toBeUndefined();
    expect(getPrivateGroupKeyAvailability('qortium', null)).toBeUndefined();
  });
});

describe('isPrivateGroupKeyActionOutcomeUnknown', () => {
  it('recognizes Home broadcast uncertainty and explicit rejection', () => {
    expect(isPrivateGroupKeyActionOutcomeUnknown({ outcome: 'unknown', signature: 'signed' })).toBe(true);
    expect(isPrivateGroupKeyActionOutcomeUnknown({ accepted: false, signature: 'signed' })).toBe(true);
  });

  it('accepts QPGC success shapes without an accepted property', () => {
    expect(isPrivateGroupKeyActionOutcomeUnknown({ signature: 'confirmed' })).toBe(false);
    expect(isPrivateGroupKeyActionOutcomeUnknown({ accepted: true, signature: 'confirmed' })).toBe(false);
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
