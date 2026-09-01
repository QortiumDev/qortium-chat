// Outbound chat attachments.
//
// Two staging shapes exist, chosen per host by attachmentCapabilities.ts:
//
// - StagedSourceAttachment (P4b, Home 2 / Home 1.3+): attaching opens Home's
//   native picker (SELECT_QDN_PUBLISH_SOURCE), which hands back an opaque,
//   short-lived sourceToken plus fileName/size/mimeType for display only. The
//   token is redeemed at send time by publishQdnResource (open groups) or
//   publishChatAttachment (private conversations). The app never sees bytes.
// - StagedLocalAttachment (attachments-matrix A1, Home 1.x / Home 2 Android /
//   Qortal Hub): the app reads a browser File itself — from the paperclip's
//   <input type="file">, a clipboard paste, or a drag-drop — compresses images
//   to WebP (Hub's parameters: max width 1200, quality 0.6), base64-encodes,
//   and publishes inline through publishQdnResourceBytes. This is the pre-P4
//   flow kept as the fallback for every host that still accepts inline bytes,
//   and the only way paste/drop can stage anything. Open groups only.
//
// Either way the message carries a qdn:// link: the inbound pipeline already
// inline-previews IMAGE links and offers viewer/save for ATTACHMENT links, and
// older clients degrade to a clickable link.

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

const IMAGE_COMPRESSION_MAX_WIDTH = 1200;
const IMAGE_COMPRESSION_QUALITY = 0.6;

export type AttachmentService = 'ATTACHMENT' | 'IMAGE';

// A file selected through Home's native picker and staged for the next send.
// `selectedAt` is a local Date.now() snapshot (not part of Home's response)
// used only for the client-side staleness check above.
export type StagedSourceAttachment = {
  fileName: string;
  kind: 'source';
  mimeType: string | null;
  selectedAt: number;
  size: number;
  sourceToken: string;
};

// A browser File the app prepared itself (bytes path — see module doc).
// `size` is the prepared payload's size (after any image compression), which
// is what the per-service cap is checked against.
export type StagedLocalAttachment = {
  dataBase64: string;
  fileName: string;
  kind: 'local';
  mimeType: string | null;
  service: AttachmentService;
  size: number;
};

export type StagedAttachment = StagedLocalAttachment | StagedSourceAttachment;

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
 * On a bytes-capable host the returned File is staged directly
 * (prepareLocalAttachment); on a token-only host callers only use it to
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

export function getAttachmentServiceFromFile(file: Pick<File, 'type'>): AttachmentService {
  return getAttachmentServiceFromMime(file.type || null);
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

function fileToBase64(payload: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const dataUrl = String(reader.result);
      const separator = dataUrl.indexOf(',');

      if (separator === -1) {
        reject(new Error('Unable to read the file.'));
        return;
      }

      resolve(dataUrl.slice(separator + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read the file.'));
    reader.readAsDataURL(payload);
  });
}

// Best-effort canvas re-encode to WebP (this also drops EXIF/metadata, as
// Hub's own chat-image pipeline does). Returns null whenever the original
// bytes should be published instead: GIFs (a canvas would freeze the
// animation), undecodable images, environments without WebP encoding, or a
// "compressed" result that came out larger than the source.
async function compressImage(file: File): Promise<Blob | null> {
  if (file.type === 'image/gif') {
    return null;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, IMAGE_COMPRESSION_MAX_WIDTH / bitmap.width);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');

    if (!context) {
      return null;
    }

    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', IMAGE_COMPRESSION_QUALITY),
    );

    return blob && blob.type === 'image/webp' && blob.size < file.size ? blob : null;
  } catch {
    return null;
  }
}

// Bytes path: route to IMAGE/ATTACHMENT, compress images, base64-encode.
// The caller checks the returned `size` against getAttachmentMaxBytes.
export async function prepareLocalAttachment(file: File): Promise<StagedLocalAttachment> {
  const service = getAttachmentServiceFromFile(file);
  let payload: Blob = file;
  let fileName = file.name || 'attachment';
  let mimeType: string | null = file.type || null;

  if (service === 'IMAGE') {
    const compressed = await compressImage(file);

    if (compressed) {
      payload = compressed;
      fileName = `${fileName.replace(/\.[^.]+$/, '') || 'image'}.webp`;
      mimeType = 'image/webp';
    }
  }

  return {
    dataBase64: await fileToBase64(payload),
    fileName,
    kind: 'local',
    mimeType,
    service,
    size: payload.size,
  };
}

// True once `now` is past the token's 30-minute Home-side expiry. Pure and
// unit-testable so the send-time staleness check does not depend on a live
// clock in tests.
export function isSourceAttachmentExpired(staged: Pick<StagedSourceAttachment, 'selectedAt'>, now: number) {
  return now - staged.selectedAt >= SOURCE_TOKEN_EXPIRY_MS;
}

// P6b identity-isolation audit: a staged source token is bound to the
// Qortium account that requested it (Home's SELECT_QDN_PUBLISH_SOURCE picker
// scopes it to account+tab+route — review/schemas-publish-attachments.md
// § 1). App.tsx's chat-switch effect already drops the stage on a
// conversation change, and its account-reset effect drops it on a Qortium
// account SWITCH — but LOCKING the very same account (address unchanged,
// only isUnlocked flipping false) triggers neither. This is the decision for
// a third effect that watches exactly that transition: only fires while a
// Qortium chat is selected (a Qortal chat's stage is unaffected by the
// Qortium account's lock state — Qortal has no lock concept of its own in
// this app) and only when there is actually something staged to drop.
export function shouldClearStagedAttachmentOnAccountLock(input: {
  hasStagedAttachment: boolean;
  isAccountUnlocked: boolean;
  selectedChatIsQortal: boolean;
}): boolean {
  return input.hasStagedAttachment && !input.isAccountUnlocked && !input.selectedChatIsQortal;
}
