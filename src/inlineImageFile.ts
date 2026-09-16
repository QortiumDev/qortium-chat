// An inline message image (`![alt](data:image/…;base64,…)`, richText.ts) as
// the bytes + name Home's SAVE_FILE_BYTES takes. The URI shape was validated
// by the parser (webp/jpeg/png, base64), so this only splits it apart and
// derives a file name from the alt text; null for anything else.
const DATA_IMAGE = /^data:(image\/(webp|jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/;

export type InlineImageFile = {
  bytesBase64: string;
  fileName: string;
  mimeType: string;
};

export function inlineImageToFile(src: string, alt: string): InlineImageFile | null {
  const match = DATA_IMAGE.exec(src);

  if (!match) {
    return null;
  }

  const extension = match[2] === 'jpeg' ? 'jpg' : match[2];
  const stem =
    alt
      .trim()
      .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '_')
      .replace(/\.[a-z0-9]{1,5}$/i, '')
      .replace(/[. ]+$/g, '')
      .slice(0, 60) || 'image';

  return { bytesBase64: match[3], fileName: `${stem}.${extension}`, mimeType: match[1] };
}
