import { formatInlineImageMarkup } from './richText';

// 2.0.26 (D-G): an image pasted or dropped into a Qortium chat is carried
// INSIDE the message when the image AS GIVEN fits under the CHAT payload
// cap, and takes the QDN attachment path otherwise. The whole message —
// text, markup, envelope — must stay under 4 000 bytes, so only a genuinely
// tiny image (an icon, a small sticker) ever qualifies. Chat never resizes or
// re-encodes what the user dropped: 2.0.26–2.0.29 downscaled anything to a
// ~100 px preview until it fit, which sent a thumbnail INSTEAD of the image
// (owner report 2026-09-16, a 1.9 MB PNG "expanded" to nothing). Qortium
// only: Chat is the only Qortium client, so the markup is its own; on Qortal
// the attachment path stays the answer (Hub carries images as QDN resources).

/** Core's CHAT data cap (bytes of the UTF-8 message). */
export const CHAT_MESSAGE_MAX_BYTES = 4000;
/** Room kept for the composer text plus Chat's own reply/markup overhead. */
export const INLINE_IMAGE_RESERVED_BYTES = 200;

/** Inline markup carries only these encodings (richText.ts INLINE_IMAGE_LINE). */
const INLINE_TYPES = new Set(['image/webp', 'image/jpeg', 'image/png']);

export type InlineImageResult = {
  /** Markup line to append to the message. */
  markup: string;
  /** Rendered preview width/height in CSS px. */
  height: number;
  width: number;
  /** Byte length of the markup line (UTF-8 = ASCII here). */
  bytes: number;
  /** The data: URI, for the composer preview. */
  src: string;
};

export function isInlineImageCandidate(file: { type?: string } | null | undefined) {
  return !!file && typeof file.type === 'string' && /^image\/(png|jpeg|webp|gif|bmp)$/i.test(file.type);
}

/**
 * How many bytes a markup line may take in one message whose cap is `max`
 * and whose envelope already measures `used` bytes (the composer's own
 * estimate, so replies and Qortal wrappers are counted the same way the
 * send path counts them).
 */
export function inlineImageBudget(max: number, used: number, reserved = INLINE_IMAGE_RESERVED_BYTES) {
  return max - used - reserved;
}

async function loadImage(file: Blob): Promise<HTMLImageElement | ImageBitmap> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall through to the <img> decoder (older WebViews, odd containers).
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('The image could not be decoded.'));
      image.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function dimensionsOf(source: HTMLImageElement | ImageBitmap) {
  return 'naturalWidth' in source
    ? { height: source.naturalHeight, width: source.naturalWidth }
    : { height: source.height, width: source.width };
}

/** Base64 length of `bytes` raw bytes. */
function base64Length(bytes: number) {
  return Math.ceil(bytes / 3) * 4;
}

/**
 * The dropped bytes, unchanged, as an inline markup line — or null when the
 * image does not already fit `budgetBytes` (the caller then takes the QDN
 * attachment path). The size test runs on the file length alone, before any
 * decoding, so a large image costs nothing here. Decoding happens only to
 * measure the preview; the pixels are never redrawn or re-encoded. Never
 * throws for a non-image: callers check isInlineImageCandidate first, and a
 * decode failure resolves to null too.
 */
export async function encodeInlineImage(file: Blob, budgetBytes: number, alt = 'image'): Promise<InlineImageResult | null> {
  if (budgetBytes < 200) return null;
  const type = (file.type || '').toLowerCase();
  if (!INLINE_TYPES.has(type)) return null;
  const prefixLength = formatInlineImageMarkup(`data:${type};base64,`, alt).length;
  if (prefixLength + base64Length(file.size) > budgetBytes) return null;

  let source: HTMLImageElement | ImageBitmap;
  try {
    source = await loadImage(file);
  } catch {
    return null;
  }
  try {
    const { height, width } = dimensionsOf(source);
    if (!width || !height) return null;
    const src = `data:${type};base64,${await blobToBase64(file)}`;
    const markup = formatInlineImageMarkup(src, alt);
    const bytes = markup.length;
    return bytes <= budgetBytes ? { bytes, height, markup, src, width } : null;
  } finally {
    if ('close' in source) source.close();
  }
}

async function blobToBase64(file: Blob) {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let index = 0; index < buffer.length; index += 0x8000) {
    binary += String.fromCharCode(...buffer.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}
