import { describe, expect, it } from 'vitest';
import { buildQdnResourceShareLink, getImageQdnResources, getMessageQdnResources } from './messageLinks';

describe('buildQdnResourceShareLink', () => {
  it('builds the qdn:// form for Qortium conversations, percent-encoding segments', () => {
    expect(buildQdnResourceShareLink('qortium', { identifier: 'pic-1', name: 'Some Name', service: 'IMAGE' })).toBe(
      'qdn://IMAGE/Some%20Name/pic-1',
    );
    expect(buildQdnResourceShareLink('qortium', { name: 'site', service: 'WEBSITE' })).toBe('qdn://WEBSITE/site');
  });

  it("builds Hub's use-embed form for Qortal conversations when values are Hub-safe", () => {
    expect(buildQdnResourceShareLink('qortal', { identifier: 'pic-1', name: 'alice', service: 'IMAGE' })).toBe(
      'qortal://use-embed/IMAGE?name=alice&service=IMAGE&identifier=pic-1',
    );
    expect(buildQdnResourceShareLink('qortal', { identifier: 'v1', name: 'bob', service: 'VIDEO' })).toBe(
      'qortal://use-embed/VIDEO?name=bob&service=VIDEO&identifier=v1',
    );
    // Non-image/video services embed as ATTACHMENT.
    expect(buildQdnResourceShareLink('qortal', { identifier: 'f1', name: 'bob', service: 'DOCUMENT' })).toBe(
      'qortal://use-embed/ATTACHMENT?name=bob&service=DOCUMENT&identifier=f1',
    );
  });

  it('falls back to the plain Qortal link form when a value would break Hub parsing', () => {
    // Hub neither encodes nor decodes query values, so a space cannot ride use-embed.
    expect(buildQdnResourceShareLink('qortal', { identifier: 'pic-1', name: 'Some Name', service: 'IMAGE' })).toBe(
      'qortal://IMAGE/Some%20Name?identifier=pic-1',
    );
  });

  it('round-trips: every emitted form parses back to the same coordinate in Chat', () => {
    const cases = [
      { network: 'qortium' as const, resource: { identifier: 'pic-1', name: 'Some Name', service: 'IMAGE' } },
      { network: 'qortal' as const, resource: { identifier: 'pic-1', name: 'alice', service: 'IMAGE' } },
      { network: 'qortal' as const, resource: { identifier: 'pic-1', name: 'Some Name', service: 'IMAGE' } },
    ];

    for (const { network, resource } of cases) {
      const link = buildQdnResourceShareLink(network, resource);
      const [parsed] = getMessageQdnResources(`look: ${link} !`, network);

      expect(parsed, link).toBeDefined();
      expect(parsed).toMatchObject({
        identifier: resource.identifier,
        name: resource.name,
        network,
        service: resource.service,
      });
    }
  });
});

describe('use-embed parsing', () => {
  it("parses a real Hub-emitted embed link (Hub's own utils/chat.ts shape)", () => {
    const link =
      'qortal://use-embed/IMAGE?name=alice&identifier=grp-q-manager_1_group_5_abc123&service=IMAGE&mimeType=image%2Fpng&timestamp=123';
    const [image] = getImageQdnResources(`hi ${link}`, 'qortal');

    expect(image).toMatchObject({
      identifier: 'grp-q-manager_1_group_5_abc123',
      name: 'alice',
      network: 'qortal',
      service: 'IMAGE',
    });
  });

  it('treats ATTACHMENT embeds as documents, not images', () => {
    const link = 'qortal://use-embed/ATTACHMENT?name=bob&service=ATTACHMENT&identifier=file-1';

    expect(getImageQdnResources(link, 'qortal')).toHaveLength(0);
    expect(getMessageQdnResources(link, 'qortal')).toHaveLength(1);
  });

  it('rejects POLL and malformed embeds', () => {
    for (const link of [
      'qortal://use-embed/POLL?name=p1',
      'qortal://use-embed/IMAGE?service=IMAGE', // no name
      'qortal://use-embed/IMAGE?name=..&service=IMAGE',
      // (the link scanner stops at whitespace, so a spaced value never reaches
      // the parser as one address — a hyphen does and fails the service regex)
      'qortal://use-embed/IMAGE?name=a&service=bad-service',
      `qortal://use-embed/IMAGE?name=a&service=IMAGE&identifier=${'x'.repeat(65)}`,
    ]) {
      expect(getMessageQdnResources(link, 'qortal'), link).toHaveLength(0);
    }
  });

  it('keeps default identifiers empty and ignores use-embed on the qdn:// scheme', () => {
    const [parsed] = getMessageQdnResources('qortal://use-embed/IMAGE?name=a&service=IMAGE&identifier=default', 'qortal');

    expect(parsed?.identifier).toBeUndefined();
    expect(getMessageQdnResources('qdn://use-embed/IMAGE?name=a&service=IMAGE', 'qortium')).toHaveLength(0);
  });
});
