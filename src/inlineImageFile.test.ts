import { describe, expect, it } from 'vitest';
import { inlineImageToFile } from './inlineImageFile';

const webp = 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=';

describe('inlineImageToFile', () => {
  it('splits a validated data: image into bytes, name and type', () => {
    expect(inlineImageToFile(webp, 'a cat')).toEqual({
      bytesBase64: 'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=',
      fileName: 'a cat.webp',
      mimeType: 'image/webp',
    });
    expect(inlineImageToFile('data:image/jpeg;base64,AAAA', 'photo.jpeg')?.fileName).toBe('photo.jpg');
    expect(inlineImageToFile('data:image/png;base64,AAAA', '')?.fileName).toBe('image.png');
  });

  it('keeps the name a leaf and bounded', () => {
    expect(inlineImageToFile('data:image/png;base64,AAAA', '../../etc/passwd')?.fileName).toBe('.._.._etc_passwd.png');
    expect(inlineImageToFile('data:image/png;base64,AAAA', 'x'.repeat(200))?.fileName).toBe(`${'x'.repeat(60)}.png`);
  });

  it('refuses anything that is not an inline image', () => {
    expect(inlineImageToFile('https://example.com/a.png', 'a')).toBeNull();
    expect(inlineImageToFile('data:text/html;base64,AAAA', 'a')).toBeNull();
    expect(inlineImageToFile('data:image/svg+xml;base64,AAAA', 'a')).toBeNull();
  });
});
