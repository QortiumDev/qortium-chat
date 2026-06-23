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
});
