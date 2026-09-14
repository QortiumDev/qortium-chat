import { formatInlineImageMarkup } from './richText';

// 2.0.26 (D-G): an image pasted or dropped into a Qortium chat is carried
// INSIDE the message when a small preview of it fits under the CHAT payload
// cap, and offered as a QDN attachment otherwise. The whole message — text,
// markup, envelope — must stay under 4 000 bytes, so the preview is tiny by
// construction (typically 96–128 px WebP at low quality, ~2–3 KB). Qortium
// only: Chat is the only Qortium client, so the markup is its own; on Qortal
// the attachment path stays the answer (Hub carries images as QDN resources).

/** Core's CHAT data cap (bytes of the UTF-8 message). */
export const CHAT_MESSAGE_MAX_BYTES = 4000;
/** Room kept for the composer text plus Chat's own reply/markup overhead. */
export const INLINE_IMAGE_RESERVED_BYTES = 200;

const SIZES = [160, 128, 96, 80, 64, 48] as const;
const QUALITIES = [0.6, 0.45, 0.32, 0.22, 0.15] as const;

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

/**
 * Downscales and re-encodes until the markup line fits `budgetBytes`, or
 * returns null when even the smallest preview does not. Never throws for a
 * non-image: callers check isInlineImageCandidate first, and decode failures
 * resolve to null too.
 */
export async function encodeInlineImage(file: Blob, budgetBytes: number, alt = 'image'): Promise<InlineImageResult | null> {
  if (budgetBytes < 200) return null;
  let source: HTMLImageElement | ImageBitmap;
  try {
    source = await loadImage(file);
  } catch {
    return null;
  }
  const { height: sourceHeight, width: sourceWidth } = dimensionsOf(source);
  if (!sourceWidth || !sourceHeight) return null;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return null;

  try {
    for (const size of SIZES) {
      const scale = Math.min(1, size / Math.max(sourceWidth, sourceHeight));
      const width = Math.max(1, Math.round(sourceWidth * scale));
      const height = Math.max(1, Math.round(sourceHeight * scale));
      canvas.width = width;
      canvas.height = height;
      context.clearRect(0, 0, width, height);
      context.drawImage(source, 0, 0, width, height);
      for (const type of ['image/webp', 'image/jpeg'] as const) {
        for (const quality of QUALITIES) {
          const src = canvas.toDataURL(type, quality);
          // A browser without WebP support answers with a PNG data URI.
          if (!src.startsWith(`data:${type};base64,`)) break;
          const markup = formatInlineImageMarkup(src, alt);
          const bytes = markup.length;
          if (bytes <= budgetBytes) return { bytes, height, markup, src, width };
        }
      }
    }
    return null;
  } finally {
    if ('close' in source) source.close();
  }
}
