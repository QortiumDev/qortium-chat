import nacl from 'tweetnacl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { base58Encode } from './base58';
import {
  buildUnsignedQortalGeneralChatBytes,
  buildUnsignedQortalGeneralWrapperBytes,
  decodeQortalGeneralWrappedMessage,
  deriveQortalGeneralWrapperKeys,
  getQortalGeneralChatMessages,
  parseSignedQortalGeneralChatBytes,
  stampQortalGeneralChatNonce,
} from './qortalGeneralChat';

const qortalRequestMock = vi.hoisted(() => vi.fn());

vi.mock('./qortalRequest', () => ({
  qortalRequest: qortalRequestMock,
}));

function signedGeneralChat(message = '{"version":3,"messageText":"hello"}') {
  const keyPair = nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(7));
  const unsigned = buildUnsignedQortalGeneralChatBytes({
    lastReference: new Uint8Array(64).fill(11),
    message,
    senderPublicKey: base58Encode(keyPair.publicKey),
    timestamp: 1_700_000_000_000,
  });
  const stamped = stampQortalGeneralChatNonce(unsigned, 42);
  const signature = nacl.sign.detached(stamped, keyPair.secretKey);

  return { bytes: new Uint8Array([...stamped, ...signature]), keyPair, signature };
}

describe('Qortal MESSAGE-wrapped General Chat', () => {
  beforeEach(() => {
    qortalRequestMock.mockReset();
  });

  it('builds and verifies the signed embedded group-0 CHAT transaction', () => {
    const { bytes, keyPair, signature } = signedGeneralChat();
    const parsed = parseSignedQortalGeneralChatBytes(bytes);

    expect(new DataView(parsed.signingBytes.buffer).getInt32(112)).toBe(42);
    expect(parsed.timestamp).toBe(1_700_000_000_000);
    expect(parsed.chatReference).toBeNull();
    expect(parsed.publicKey).toEqual(keyPair.publicKey);
    expect(parsed.signature).toEqual(signature);
    expect(new TextDecoder().decode(parsed.data)).toBe('{"version":3,"messageText":"hello"}');
  });

  it('rejects a tampered embedded CHAT signature', () => {
    const { bytes } = signedGeneralChat();
    bytes[121] ^= 1;

    expect(() => parseSignedQortalGeneralChatBytes(bytes)).toThrow('Wrapped CHAT signature is invalid.');
  });

  it('derives and verifies the deterministic wrapper sender and recipient', async () => {
    const { bytes, keyPair, signature } = signedGeneralChat();
    const { recipientAddress, senderKeyPair } = await deriveQortalGeneralWrapperKeys(signature);
    const decoded = await decodeQortalGeneralWrappedMessage({
      amount: 0,
      data: base58Encode(bytes),
      fee: 0,
      isEncrypted: false,
      isText: false,
      recipient: recipientAddress,
      senderPublicKey: base58Encode(senderKeyPair.publicKey),
      txGroupId: 0,
    });

    expect(decoded).toMatchObject({
      isEncrypted: false,
      isText: true,
      recipient: null,
      sender: 'QM6xD1LM4BaidFGbjs1Q3PsSJ1cLXtw2HE',
      signature: base58Encode(signature),
      timestamp: 1_700_000_000_000,
      txGroupId: 0,
    });
    expect(decoded?.sender).not.toBe(base58Encode(keyPair.publicKey));
    expect(new TextDecoder().decode(Uint8Array.from(atob(decoded?.data ?? ''), (char) => char.charCodeAt(0)))).toBe(
      '{"version":3,"messageText":"hello"}',
    );

    await expect(
      decodeQortalGeneralWrappedMessage({
        amount: 0,
        data: base58Encode(bytes),
        fee: 0,
        isEncrypted: false,
        isText: false,
        recipient: recipientAddress,
        senderPublicKey: base58Encode(new Uint8Array(32).fill(9)),
        txGroupId: 0,
      }),
    ).resolves.toBeNull();
  });

  it('serializes the outer fee-zero MESSAGE transaction with its nonce at the CHAT/MESSAGE offset', async () => {
    const { bytes, signature } = signedGeneralChat();
    const { recipientAddress, senderKeyPair } = await deriveQortalGeneralWrapperKeys(signature);
    const unsigned = buildUnsignedQortalGeneralWrapperBytes({
      data: bytes,
      lastReference: new Uint8Array(64).fill(13),
      recipient: recipientAddress,
      senderPublicKey: senderKeyPair.publicKey,
      timestamp: 1_700_000_000_100,
    });
    const stamped = stampQortalGeneralChatNonce(unsigned, 99);
    const view = new DataView(stamped.buffer);

    expect(view.getInt32(0)).toBe(17);
    expect(view.getInt32(12)).toBe(0);
    expect(view.getInt32(112)).toBe(99);
    expect(stamped[116]).toBe(1);
    expect(stamped.at(-10)).toBe(0);
    expect(stamped.at(-9)).toBe(0);
  });

  it('reads only verified wrappers from the unconfirmed MESSAGE feed', async () => {
    const first = signedGeneralChat('first');
    const second = signedGeneralChat('second');
    const firstWrapper = await deriveQortalGeneralWrapperKeys(first.signature);
    const secondWrapper = await deriveQortalGeneralWrapperKeys(second.signature);
    qortalRequestMock.mockResolvedValueOnce({
      body: '',
      contentType: 'application/json',
      data: [
        {
          amount: 0,
          data: base58Encode(first.bytes),
          fee: 0,
          isEncrypted: false,
          isText: false,
          recipient: firstWrapper.recipientAddress,
          senderPublicKey: base58Encode(firstWrapper.senderKeyPair.publicKey),
          txGroupId: 0,
        },
        {
          amount: 0,
          data: base58Encode(second.bytes),
          fee: 0,
          isEncrypted: false,
          isText: false,
          recipient: secondWrapper.recipientAddress,
          senderPublicKey: base58Encode(new Uint8Array(32).fill(3)),
          txGroupId: 0,
        },
      ],
      ok: true,
      status: 200,
      statusText: 'OK',
    });

    const messages = await getQortalGeneralChatMessages();

    expect(messages).toHaveLength(1);
    expect(messages[0].signature).toBe(base58Encode(first.signature));
    expect(qortalRequestMock).toHaveBeenCalledWith({
      action: 'FETCH_NODE_API',
      maxBytes: 8 * 1024 * 1024,
      path: '/transactions/unconfirmed?txType=MESSAGE&limit=0&reverse=true',
    });
  });

  it('enforces the 4000-byte signed CHAT wrapper limit before proof-of-work', () => {
    const keyPair = nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(7));

    expect(() =>
      buildUnsignedQortalGeneralChatBytes({
        lastReference: new Uint8Array(64),
        message: 'x'.repeat(4000),
        senderPublicKey: base58Encode(keyPair.publicKey),
        timestamp: 1_700_000_000_000,
      }),
    ).toThrow('Message is too large for Qortal General Chat.');
  });
});
