// Outbound chat attachments (v1). Conventions follow Qortal Hub's chat-image
// precedent where one exists, adapted to this app's bridge-only key model:
//
// - Open groups only. Qortium Home has no encrypt-on-publish capability and
//   this app holds no keys, so every attachment is PUBLIC QDN data — private
//   contexts (closed groups, directs) stay attachment-less until Home can
//   encrypt with the group key the way Qortal Hub does client-side.
// - Images publish as IMAGE (Core cap 10 MB) after client-side WebP
//   compression (max width 1200, quality 0.6 — Hub's parameters); everything
//   else publishes as ATTACHMENT (Core cap 50 MB, app cap 25 MB to be kind
//   to QDN hosting).
// - The message itself just carries the qdn:// link: the existing inbound
//   pipeline already inline-previews IMAGE links and offers viewer/save for
//   ATTACHMENT links, and older clients degrade to a clickable link.

export const ATTACHMENT_FILE_MAX_BYTES = 25 * 1024 * 1024;
export const ATTACHMENT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_COMPRESSION_MAX_WIDTH = 1200;
const IMAGE_COMPRESSION_QUALITY = 0.6;

export type AttachmentService = 'ATTACHMENT' | 'IMAGE';

export type PreparedAttachment = {
  dataBase64: string;
  filename: string;
  service: AttachmentService;
  size: number;
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

export function getAttachmentService(file: Pick<File, 'type'>): AttachmentService {
  // SVG deliberately ships as a plain file: the inline image-preview pipeline
  // is raster-only by design (script-bearing SVG), so publishing SVG as IMAGE
  // would only produce a broken preview.
  return file.type.startsWith('image/') && file.type !== 'image/svg+xml' ? 'IMAGE' : 'ATTACHMENT';
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

// Best-effort canvas re-encode to WebP. Returns null whenever the original
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

export async function prepareAttachment(file: File): Promise<PreparedAttachment> {
  const service = getAttachmentService(file);
  let payload: Blob = file;
  let filename = file.name || 'attachment';

  if (service === 'IMAGE') {
    const compressed = await compressImage(file);

    if (compressed) {
      payload = compressed;
      filename = `${filename.replace(/\.[^.]+$/, '') || 'image'}.webp`;
    }
  }

  return {
    dataBase64: await fileToBase64(payload),
    filename,
    service,
    size: payload.size,
  };
}
