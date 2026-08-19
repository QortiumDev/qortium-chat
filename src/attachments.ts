// Outbound chat attachments (P4b). Home 2 rejects inline base64 uploads
// entirely (review/schemas-publish-attachments.md § 2) — the app never reads
// file bytes any more. Attaching a file opens Home's native picker
// (SELECT_QDN_PUBLISH_SOURCE), which hands back an opaque, short-lived
// sourceToken plus fileName/size/mimeType for display only. That token is
// staged here and redeemed at send time by publishQdnResource (open groups)
// or publishChatAttachment (private conversations) — see coreApi.ts's P4a
// wrappers and App.tsx's handleSendMessage.
//
// Consequence: there is no local Blob/File to compress, preview, or read, so
// the browser-File staging machinery this file used to hold (prepareAttachment,
// image compression, base64 encoding) has no consumer any more and is gone.
// Drag-drop and clipboard-paste can still detect that a file was offered
// (getFirstTransferFile), but can no longer stage it — the app has no way to
// hand those bytes to Home, so callers show a notice pointing at the attach
// button instead.

export const ATTACHMENT_FILE_MAX_BYTES = 25 * 1024 * 1024;
export const ATTACHMENT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

// Mirrors Home's own source-selection cap (review/schemas-publish-
// attachments.md § 1) — a courtesy client-side check so an oversized pick
// fails with an immediate, specific message instead of round-tripping to
// PUBLISH_QDN_RESOURCE/PUBLISH_CHAT_ATTACHMENT first.
export const QDN_PUBLISH_SOURCE_MAX_BYTES = 100 * 1024 * 1024;

// A Home-issued publish source token expires 30 minutes after selection
// (review/schemas-publish-attachments.md § 1). Chat treats a staged
// attachment as stale at that point rather than waiting for Home to reject
// it, so the "select the file again" notice can appear immediately.
export const SOURCE_TOKEN_EXPIRY_MS = 30 * 60 * 1000;

export type AttachmentService = 'ATTACHMENT' | 'IMAGE';

// A file selected through Home's native picker and staged for the next send.
// `selectedAt` is a local Date.now() snapshot (not part of Home's response)
// used only for the client-side staleness check above.
export type StagedSourceAttachment = {
  fileName: string;
  mimeType: string | null;
  selectedAt: number;
  size: number;
  sourceToken: string;
};

type TransferFileItem = {
  getAsFile(): File | null;
  kind: string;
};

type TransferFileSource = {
  files?: ArrayLike<File> | null;
  items?: ArrayLike<TransferFileItem> | null;
};

/**
 * Browser clipboard implementations do not agree on whether a copied
 * screenshot appears in DataTransfer.files, DataTransfer.items, or both.
 * Prefer the direct FileList, then fall back to file-kind items. This also
 * deliberately ignores text/HTML clipboard entries so ordinary text paste
 * remains the textarea's job.
 *
 * Still used to *detect* that a drop/paste offered a file — the app cannot
 * read its bytes any more (see module doc), so callers only use this to
 * decide whether to show the "use the attach button" notice.
 */
export function getFirstTransferFile(source: TransferFileSource | null | undefined): File | null {
  const directFile = source?.files?.[0];

  if (directFile) {
    return directFile;
  }

  for (const item of Array.from(source?.items ?? [])) {
    if (item.kind !== 'file') {
      continue;
    }

    const file = item.getAsFile();

    if (file) {
      return file;
    }
  }

  return null;
}

// Home's picker never reports a mimeType on desktop (always null) and only a
// native-picker hint on Android (review/schemas-publish-attachments.md § 1).
// A null/unrecognized mimeType defaults to ATTACHMENT rather than guessing —
// the inline image-preview pipeline is raster-only, so guessing IMAGE for an
// unknown type risks a broken preview.
export function getAttachmentServiceFromMime(mimeType: string | null): AttachmentService {
  return !!mimeType && mimeType.startsWith('image/') && mimeType !== 'image/svg+xml' ? 'IMAGE' : 'ATTACHMENT';
}

export function getAttachmentMaxBytes(service: AttachmentService) {
  return service === 'IMAGE' ? ATTACHMENT_IMAGE_MAX_BYTES : ATTACHMENT_FILE_MAX_BYTES;
}

export function buildAttachmentIdentifier(groupId: number, timestamp: number) {
  // Qortium-chat's own scheme — distinct from Hub's legacy grp-q-manager_…
  // prefix — greppable per group, and timestamp+random keeps it well under
  // QDN's 64-char identifier cap with no realistic collision.
  const random = Math.random().toString(36).slice(2, 8);

  return `qtm-chat_group_${groupId}_${timestamp.toString(36)}-${random}`;
}

export function buildAttachmentLink(service: AttachmentService, name: string, identifier: string) {
  // Segments are percent-encoded (registered names can contain spaces); the
  // message-link parser decodes each segment.
  return `qdn://${service}/${encodeURIComponent(name)}/${encodeURIComponent(identifier)}`;
}

export function formatAttachmentSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// True once `now` is past the token's 30-minute Home-side expiry. Pure and
// unit-testable so the send-time staleness check does not depend on a live
// clock in tests.
export function isSourceAttachmentExpired(staged: Pick<StagedSourceAttachment, 'selectedAt'>, now: number) {
  return now - staged.selectedAt >= SOURCE_TOKEN_EXPIRY_MS;
}
