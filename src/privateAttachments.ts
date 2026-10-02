import type { ChatMessage, ChatNetwork, PrivateAttachmentDescriptor } from './types';

// The published descriptor is sender-relative. Home's access contract is
// viewer-relative and checks BOTH recipients against the encrypted envelope.
// Adapt only the conversation; never change the immutable resource/digest.
export function attachmentForViewer(
  descriptor: PrivateAttachmentDescriptor,
  message: Pick<ChatMessage, 'sender' | 'recipient' | 'txGroupId'>,
  selfAddress: string | null,
  network: ChatNetwork,
): PrivateAttachmentDescriptor {
  if (descriptor.network !== network) throw new Error('Attachment belongs to a different network.');
  if (descriptor.conversation.kind === 'group') {
    if (message.recipient || descriptor.conversation.groupId !== message.txGroupId) {
      throw new Error('Attachment does not belong to this group.');
    }
    return descriptor;
  }
  if (!selfAddress || !message.recipient ||
      (selfAddress !== message.sender && selfAddress !== message.recipient)) {
    throw new Error('Attachment does not belong to the selected account.');
  }
  if (descriptor.conversation.otherAddress !== message.recipient) {
    throw new Error('Attachment does not match the message recipient.');
  }
  return {
    ...descriptor,
    conversation: {
      kind: 'direct',
      otherAddress: selfAddress === message.sender ? message.recipient : message.sender,
    },
  };
}

const RASTER_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/bmp']);
const MAX_PREVIEW_BYTES = 1024 * 1024;

// Home sniffs the decrypted bytes. The QDN service describes the encrypted
// container, not the image inside it. Consume a fresh capability exactly once;
// retain only a bounded raster blob so the lightbox can reuse the preview.
export async function readPrivateImagePreview(url: string, signal: AbortSignal): Promise<Blob | null> {
  const response = await fetch(url, { signal, credentials: 'omit' });
  if (!response.ok) throw new Error(`Attachment preview returned HTTP ${response.status}.`);
  const mime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
  if (!RASTER_TYPES.has(mime)) {
    await response.body?.cancel();
    return null;
  }
  if (Number(response.headers.get('content-length')) > MAX_PREVIEW_BYTES) {
    await response.body?.cancel();
    throw new Error('Attachment preview exceeds the size limit.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Attachment preview is empty.');
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PREVIEW_BYTES) throw new Error('Attachment preview exceeds the size limit.');
      chunks.push(new Uint8Array(value));
    }
  } finally {
    await reader.cancel();
  }
  if (!size) throw new Error('Attachment preview is empty.');
  return new Blob(chunks, { type: mime });
}
