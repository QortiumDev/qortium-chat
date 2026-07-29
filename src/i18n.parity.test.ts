import { describe, expect, it } from 'vitest';
import { EN_STRINGS } from './locales/en';
import { OTHER_STRINGS, SUPPORTED_LANGUAGES } from './i18n';

const EN_KEYS = Object.keys(EN_STRINGS).sort();

function placeholders(value: string) {
  return (value.match(/\{(\w+)\}/g) ?? []).sort();
}

const NON_EN = SUPPORTED_LANGUAGES.filter((language) => language !== 'en');

describe('i18n locale parity', () => {
  it('registers a catalog for every supported non-English language', () => {
    for (const language of NON_EN) {
      expect(OTHER_STRINGS[language], `missing catalog for ${language}`).toBeDefined();
    }
  });

  it.each(NON_EN)('locale "%s" has exactly the English key set', (language) => {
    const catalog = OTHER_STRINGS[language];
    expect(catalog, `missing catalog for ${language}`).toBeDefined();

    const keys = Object.keys(catalog ?? {}).sort();
    const missing = EN_KEYS.filter((key) => !(key in (catalog ?? {})));
    const extra = keys.filter((key) => !(key in EN_STRINGS));

    expect(missing, `${language} is missing keys`).toEqual([]);
    expect(extra, `${language} has unknown keys`).toEqual([]);
  });

  it.each(NON_EN)('locale "%s" preserves all {placeholder} tokens', (language) => {
    const catalog = OTHER_STRINGS[language] ?? {};

    for (const key of EN_KEYS) {
      const translated = (catalog as Record<string, string>)[key];
      if (translated === undefined) {
        continue;
      }

      expect(
        placeholders(translated),
        `${language} → ${key} placeholder mismatch`,
      ).toEqual(placeholders((EN_STRINGS as Record<string, string>)[key]));
    }
  });

  // Keys whose value legitimately matches English in a given locale: verified
  // cognates, loanwords, and shared abbreviations ("Navigation" in German,
  // "min"/"h", "Emoji", "Online", …). A value identical to English that is
  // NOT listed here is the classic signature of a key added without
  // translating it — add a real translation, or extend this list only after
  // confirming the English form is the correct native term.
  const IDENTICAL_TO_ENGLISH_ALLOWLIST: Record<string, string[]> = {
    de: ['aria.navigation', 'label.approval.block', 'label.approval.windowEta', 'label.common.navigation', 'label.composer.emoji', 'label.group.admin', 'label.group.global', 'label.member.online'],
    el: ['app.title', 'label.composer.emoji'],
    es: ['label.approval.eta.hours', 'label.approval.eta.minutes', 'label.composer.emoji', 'label.error', 'label.group.global', 'message.error'],
    et: ['label.approval.eta.hours', 'label.approval.eta.minutes', 'label.composer.emoji'],
    fi: ['label.approval.eta.minutes', 'label.composer.emoji'],
    fr: ['aria.navigation', 'button.mention', 'label.approval.eta.hours', 'label.approval.eta.minutes', 'label.approval.signature', 'label.approval.type.unknown', 'label.common.direct', 'label.common.message', 'label.common.navigation', 'label.group.admin', 'label.group.global', 'label.invites', 'label.message', 'placeholder.message', 'title.directPanel'],
    hi: ['app.title'],
    hu: ['label.composer.emoji', 'label.group.admin'],
    it: ['label.approval.eta.hours', 'label.approval.eta.minutes', 'label.composer.emoji', 'label.group.admin', 'label.member.online'],
    nb: ['app.title', 'button.send', 'button.startMinting', 'group.status.minting.minting', 'label.approval.eta.minutes', 'label.composer.emoji', 'label.group.admin', 'label.group.global'],
    nl: ['label.approval.eta.minutes', 'label.common.direct', 'label.composer.emoji', 'label.group.open', 'label.member.online', 'title.directPanel'],
    pl: ['label.approval.eta.minutes', 'label.composer.emoji', 'label.member.online'],
    pt: ['label.approval.eta.hours', 'label.approval.eta.minutes', 'label.composer.emoji', 'label.group.global', 'label.member.online'],
    ro: ['label.approval.eta.hours', 'label.approval.eta.minutes', 'label.common.direct', 'label.composer.emoji', 'label.group.global', 'label.member.online', 'title.directPanel'],
    sv: ['label.approval.block', 'label.approval.eta.hours', 'label.approval.eta.minutes', 'label.approval.windowEta', 'label.composer.emoji', 'label.group.global', 'label.member.online'],
  };

  it.each(NON_EN)('locale "%s" has no unexpected untranslated values', (language) => {
    const catalog = (OTHER_STRINGS[language] ?? {}) as Record<string, string>;
    const allowed = new Set(IDENTICAL_TO_ENGLISH_ALLOWLIST[language] ?? []);
    const unexpectedIdentical = EN_KEYS.filter(
      (key) =>
        catalog[key] !== undefined &&
        catalog[key] === (EN_STRINGS as Record<string, string>)[key] &&
        !allowed.has(key),
    );

    expect(
      unexpectedIdentical,
      `${language} has values identical to English that are not in the cognate allowlist — translate them (or allowlist a confirmed cognate)`,
    ).toEqual([]);
  });
});
