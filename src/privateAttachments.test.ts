import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachmentForViewer, readPrivateImagePreview } from './privateAttachments';
import type { PrivateAttachmentDescriptor } from './types';

const descriptor: PrivateAttachmentDescriptor = {
  version: 1, encrypted: true, network: 'qortium', codec: 'qenc-v2-direct',
  conversation: { kind: 'direct', otherAddress: 'Bob' },
  resource: { service: 'QCHAT_ATTACHMENT_PRIVATE', name: 'Alice', identifier: 'picture' },
  ciphertext: { algorithm: 'SHA-256', hash: 'a'.repeat(64), size: 123, transactionSignature: 'signature' },
};
const message = { sender: 'Alice', recipient: 'Bob', txGroupId: 0 };

describe('sender-relative private attachment descriptors', () => {
  it.each(['qortium', 'qortal'] as const)('opens sent and received %s files without changing their resource or hash', (network) => {
    const wire = { ...descriptor, network };
    const received = attachmentForViewer(wire, message, 'Bob', network);
    expect(received.conversation).toEqual({ kind: 'direct', otherAddress: 'Alice' });
    expect(received.resource).toBe(wire.resource);
    expect(received.ciphertext).toBe(wire.ciphertext);
    expect(attachmentForViewer(wire, message, 'Alice', network).conversation).toEqual(wire.conversation);
    expect(wire.conversation).toEqual({ kind: 'direct', otherAddress: 'Bob' });
  });
  it('rejects unrelated accounts, recipients, networks and group contexts', () => {
    expect(() => attachmentForViewer(descriptor, message, 'Eve', 'qortium')).toThrow(/selected account/);
    expect(() => attachmentForViewer(descriptor, message, null, 'qortium')).toThrow(/selected account/);
    expect(() => attachmentForViewer(descriptor, message, 'Bob', 'qortal')).toThrow(/network/);
    expect(() => attachmentForViewer(descriptor, { ...message, recipient: 'Eve' }, 'Alice', 'qortium')).toThrow(/recipient/);
    const group = { ...descriptor, conversation: { kind: 'group' as const, groupId: 12 } };
    expect(() => attachmentForViewer(group, message, 'Bob', 'qortium')).toThrow(/group/);
    expect(attachmentForViewer(group, { sender: 'Alice', txGroupId: 12 }, 'Bob', 'qortium')).toBe(group);
  });
});

describe('private image stream', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('uses Home content type and preserves bytes for a reusable raster preview', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } }));
    vi.stubGlobal('fetch', fetcher);
    const blob = await readPrivateImagePreview('opaque-stream', new AbortController().signal);
    expect(blob?.type).toBe('image/png');
    expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each(['text/html', 'image/svg+xml', 'application/pdf'])('never renders %s as an image', async (type) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('content', { headers: { 'content-type': type } })));
    expect(await readPrivateImagePreview('opaque-stream', new AbortController().signal)).toBeNull();
  });
  it('bounds streams even when Content-Length is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array(1024 * 1024 + 1), { headers: { 'content-type': 'image/png' } })));
    await expect(readPrivateImagePreview('opaque-stream', new AbortController().signal)).rejects.toThrow(/size limit/);
  });
  it('reports unavailable data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    await expect(readPrivateImagePreview('opaque-stream', new AbortController().signal)).rejects.toThrow(/404/);
  });
});
