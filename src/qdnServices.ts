// Curated QDN service catalog for the link-resource dialog's type-to-filter
// suggestions (attachments-matrix A7-1; owner decision: a flat autocomplete
// over real service names, NOT categories — "FILE could be an image").
//
// Union of the PUBLIC (non-_PRIVATE) data services shared by qortium-core and
// Qortal Core Service enums as of 2026-09-01. _PRIVATE variants are omitted
// from suggestions — a private resource linked into a chat is undecryptable
// for the readers — but the input accepts any free-typed service name, so
// nothing is unreachable.
export const QDN_SERVICE_SUGGESTIONS = [
  'APP',
  'ARBITRARY_DATA',
  'ATTACHMENT',
  'AUDIO',
  'BLOG',
  'BLOG_COMMENT',
  'BLOG_POST',
  'CODE',
  'COUPON',
  'DOCUMENT',
  'FILE',
  'FILES',
  'GIF_REPOSITORY',
  'GIT_REPOSITORY',
  'IMAGE',
  'JSON',
  'LIST',
  'METADATA',
  'OFFER',
  'PLAYLIST',
  'PLUGIN',
  'PODCAST',
  'PRODUCT',
  'QCHAT_ATTACHMENT',
  'QCHAT_AUDIO',
  'QCHAT_IMAGE',
  'QCHAT_VOICE',
  'STORE',
  'THUMBNAIL',
  'VIDEO',
  'VOICE',
  'WEBSITE',
] as const;

const IMAGE_PREVIEW_SERVICES = new Set(['GIF_REPOSITORY', 'IMAGE', 'QCHAT_IMAGE', 'THUMBNAIL']);

/** Services whose search results can show an inline image preview (A7-4). */
export function isImagePreviewService(service: string): boolean {
  return IMAGE_PREVIEW_SERVICES.has(service.toUpperCase());
}
