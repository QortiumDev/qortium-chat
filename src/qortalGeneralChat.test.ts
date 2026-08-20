import nacl from 'tweetnacl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { base58Decode, base58Encode } from './base58';
import {
  buildUnsignedQortalGeneralChatBytes,
  buildUnsignedQortalGeneralWrapperBytes,
  decodeQortalGeneralWrappedMessage,
  deriveQortalGeneralWrapperKeys,
  getQortalGeneralChatMessages,
  parseSignedQortalGeneralChatBytes,
  sendQortalGeneralChatMessage,
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

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it('asks Hub to sign only the inner CHAT and posts a MESSAGE containing those signed bytes', async () => {
    const accountKeyPair = nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(17));
    let signedChat: Uint8Array | null = null;
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('true', { status: 200 }));

    class ImmediatePowWorker {
      private messageListener: ((event: { data: { id: string; nonce: number } }) => void) | null = null;

      addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        if (type === 'message') {
          this.messageListener = listener as unknown as (event: { data: { id: string; nonce: number } }) => void;
        }
      }

      postMessage(value: { difficulty: number; id: string }) {
        queueMicrotask(() => this.messageListener?.({ data: { id: value.id, nonce: value.difficulty } }));
      }

      terminate() {}
    }

    qortalRequestMock.mockImplementation(async (request: Record<string, unknown>) => {
      if (request.action === 'WHICH_UI') return 'HUB_WEB';
      if (request.action === 'GET_USER_ACCOUNT') {
        return { address: 'Qaccount', publicKey: base58Encode(accountKeyPair.publicKey) };
      }
      if (request.action === 'SIGN_TRANSACTION') {
        const unsignedChat = base58Decode(String(request.unsignedBytes));
        const signature = nacl.sign.detached(unsignedChat, accountKeyPair.secretKey);

        signedChat = new Uint8Array([...unsignedChat, ...signature]);
        return base58Encode(signedChat);
      }
      throw new Error(`Unexpected Qortal request: ${String(request.action)}`);
    });

    vi.stubGlobal('Worker', ImmediatePowWorker);
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', {
      location: { origin: 'https://hub.example' },
      setTimeout,
    });

    const result = await sendQortalGeneralChatMessage('hello wrapper');
    const signRequest = qortalRequestMock.mock.calls.find(([request]) => request.action === 'SIGN_TRANSACTION')?.[0];

    expect(signRequest).toMatchObject({ action: 'SIGN_TRANSACTION', process: false });
    expect(new DataView(base58Decode(String(signRequest.unsignedBytes)).buffer).getInt32(0)).toBe(18);
    expect(result.signature).toBe(base58Encode(signedChat!.slice(-64)));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://hub.example/transactions/process?apiVersion=2');

    const postedWrapper = base58Decode(String(fetchMock.mock.calls[0]?.[1]?.body));
    const wrapperView = new DataView(postedWrapper.buffer, postedWrapper.byteOffset, postedWrapper.byteLength);
    const embeddedLength = wrapperView.getInt32(150);

    expect(wrapperView.getInt32(0)).toBe(17);
    expect(postedWrapper.slice(154, 154 + embeddedLength)).toEqual(signedChat);
  });
});
