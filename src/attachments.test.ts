import { describe, expect, it } from 'vitest';
import { getDocumentQdnResources, getImageQdnResources } from './messageLinks';
import {
  ATTACHMENT_FILE_MAX_BYTES,
  ATTACHMENT_IMAGE_MAX_BYTES,
  buildAttachmentIdentifier,
  buildAttachmentLink,
  formatAttachmentSize,
  getAttachmentMaxBytes,
  getFirstTransferFile,
  getAttachmentService,
} from './attachments';

describe('attachment helpers', () => {
  it('prefers a direct clipboard file and falls back to a file-kind clipboard item', () => {
    const direct = { name: 'direct.png' } as File;
    const fallback = { name: 'clipboard.png' } as File;

    expect(
      getFirstTransferFile({
        files: { 0: direct, length: 1 },
        items: { 0: { getAsFile: () => fallback, kind: 'file' }, length: 1 },
      }),
    ).toBe(direct);
    expect(
      getFirstTransferFile({
        files: { length: 0 },
        items: { 0: { getAsFile: () => fallback, kind: 'file' }, length: 1 },
      }),
    ).toBe(fallback);
  });

  it('does not intercept ordinary text clipboard data', () => {
    expect(
      getFirstTransferFile({
        files: { length: 0 },
        items: { 0: { getAsFile: () => null, kind: 'string' }, length: 1 },
      }),
    ).toBeNull();
  });

  it('routes raster images to IMAGE and everything else to ATTACHMENT', () => {
    expect(getAttachmentService({ type: 'image/png' })).toBe('IMAGE');
    expect(getAttachmentService({ type: 'image/webp' })).toBe('IMAGE');
    expect(getAttachmentService({ type: 'image/gif' })).toBe('IMAGE');
    // SVG is deliberately a plain file: the inline preview pipeline is
    // raster-only (script-bearing SVG), so IMAGE would render broken.
    expect(getAttachmentService({ type: 'image/svg+xml' })).toBe('ATTACHMENT');
    expect(getAttachmentService({ type: 'application/pdf' })).toBe('ATTACHMENT');
    expect(getAttachmentService({ type: '' })).toBe('ATTACHMENT');
  });

  it('maps each service to its size cap', () => {
    expect(getAttachmentMaxBytes('IMAGE')).toBe(ATTACHMENT_IMAGE_MAX_BYTES);
    expect(getAttachmentMaxBytes('ATTACHMENT')).toBe(ATTACHMENT_FILE_MAX_BYTES);
  });

  it('builds group-scoped identifiers under the QDN 64-char cap', () => {
    const identifier = buildAttachmentIdentifier(2147483647, 1782950000000);

    expect(identifier).toMatch(/^qtm-chat_group_2147483647_[0-9a-z]+-[0-9a-z]{6}$/);
    expect(identifier.length).toBeLessThanOrEqual(64);
    // The random suffix keeps two same-millisecond publishes distinct.
    expect(buildAttachmentIdentifier(1, 1782950000000)).not.toBe(buildAttachmentIdentifier(1, 1782950000000));
  });

  it('percent-encodes link segments so spaced names survive the link parser', () => {
    expect(buildAttachmentLink('IMAGE', 'Quick Mythril', 'qtm-chat_group_1_x-y')).toBe(
      'qdn://IMAGE/Quick%20Mythril/qtm-chat_group_1_x-y',
    );
    expect(buildAttachmentLink('ATTACHMENT', 'plain', 'id')).toBe('qdn://ATTACHMENT/plain/id');
  });

  it('round-trips a built link through the inbound message-link parser', () => {
    const imageLink = buildAttachmentLink('IMAGE', 'Quick Mythril', 'qtm-chat_group_1_ab-cdef01');
    const [image] = getImageQdnResources(`look at this ${imageLink} !`);

    expect(image).toMatchObject({
      identifier: 'qtm-chat_group_1_ab-cdef01',
      name: 'Quick Mythril',
      service: 'IMAGE',
    });

    const fileLink = buildAttachmentLink('ATTACHMENT', 'QuickMythril', 'qtm-chat_group_7_zz-a1b2c3');
    const [document] = getDocumentQdnResources(fileLink);

    expect(document).toMatchObject({
      identifier: 'qtm-chat_group_7_zz-a1b2c3',
      name: 'QuickMythril',
      service: 'ATTACHMENT',
    });
  });

  it('formats sizes at a human scale', () => {
    expect(formatAttachmentSize(512)).toBe('512 B');
    expect(formatAttachmentSize(2048)).toBe('2 KB');
    expect(formatAttachmentSize(3 * 1024 * 1024 + 200 * 1024)).toBe('3.2 MB');
  });
});
