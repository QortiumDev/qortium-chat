import { EN_STRINGS } from './locales/en';
import { STRINGS as AR_STRINGS } from './locales/ar';
import { STRINGS as DE_STRINGS } from './locales/de';
import { STRINGS as ES_STRINGS } from './locales/es';
import { STRINGS as ET_STRINGS } from './locales/et';
import { STRINGS as FI_STRINGS } from './locales/fi';
import { STRINGS as FR_STRINGS } from './locales/fr';
import { STRINGS as HE_STRINGS } from './locales/he';
import { STRINGS as HU_STRINGS } from './locales/hu';
import { STRINGS as IT_STRINGS } from './locales/it';
import { STRINGS as JA_STRINGS } from './locales/ja';
import { STRINGS as KO_STRINGS } from './locales/ko';
import { STRINGS as NL_STRINGS } from './locales/nl';
import { STRINGS as PL_STRINGS } from './locales/pl';
import { STRINGS as PT_STRINGS } from './locales/pt';
import { STRINGS as RO_STRINGS } from './locales/ro';
import { STRINGS as RU_STRINGS } from './locales/ru';
import { STRINGS as SV_STRINGS } from './locales/sv';
import { STRINGS as ZH_CN_STRINGS } from './locales/zh-CN';
import { STRINGS as ZH_TW_STRINGS } from './locales/zh-TW';

export type MessageValues = Record<string, string | number>;

export const SUPPORTED_LANGUAGES = [
  'ar',
  'de',
  'en',
  'es',
  'et',
  'fi',
  'fr',
  'he',
  'hu',
  'it',
  'ja',
  'ko',
  'nl',
  'pl',
  'pt',
  'ro',
  'ru',
  'sv',
  'zh-CN',
  'zh-TW',
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const SUPPORTED_LANGUAGE_SET = new Set<string>(SUPPORTED_LANGUAGES);
const DEFAULT_LANGUAGE: SupportedLanguage = 'en';
const RTL_LANGUAGES = new Set<string>(['ar', 'he']);

type MessageKey = keyof typeof EN_STRINGS;
type MessageCatalog = { [key in MessageKey]: string };

type Catalogs = {
  [locale in SupportedLanguage]?: Partial<MessageCatalog>;
};

export const OTHER_STRINGS: Catalogs = {
  ar: AR_STRINGS,
  de: DE_STRINGS,
  es: ES_STRINGS,
  et: ET_STRINGS,
  fi: FI_STRINGS,
  fr: FR_STRINGS,
  he: HE_STRINGS,
  hu: HU_STRINGS,
  it: IT_STRINGS,
  ja: JA_STRINGS,
  ko: KO_STRINGS,
  nl: NL_STRINGS,
  pl: PL_STRINGS,
  pt: PT_STRINGS,
  ro: RO_STRINGS,
  ru: RU_STRINGS,
  sv: SV_STRINGS,
  'zh-CN': ZH_CN_STRINGS,
  'zh-TW': ZH_TW_STRINGS,
};

function normalizeRawLanguage(language: string) {
  return language.trim().replace(/_/g, '-').toLowerCase();
}

function mapRawLanguage(language: string): SupportedLanguage | null {
  const normalized = normalizeRawLanguage(language);
  if (!normalized) {
    return null;
  }

  const explicit: Partial<Record<string, SupportedLanguage>> = {
    'en-us': 'en',
    'en-gb': 'en',
    'zh-hans': 'zh-CN',
    'zh-hant': 'zh-TW',
    'zh-cn': 'zh-CN',
    'zh-tw': 'zh-TW',
  };

  const mapped = explicit[normalized];
  if (mapped) {
    return mapped;
  }

  const [primary, ...rest] = normalized.split('-');

  if (primary && SUPPORTED_LANGUAGE_SET.has(primary)) {
    return primary as SupportedLanguage;
  }

  if (primary === 'zh') {
    if (rest.some((part) => part.includes('tw') || part.includes('hk') || part.includes('mo') || part.includes('hant'))) {
      return 'zh-TW';
    }

    return 'zh-CN';
  }

  return null;
}

export function normalizeLanguage(language: string | undefined): SupportedLanguage | null {
  if (!language) {
    return null;
  }

  return mapRawLanguage(language);
}

export function isRtlLanguage(language: SupportedLanguage) {
  return RTL_LANGUAGES.has(language);
}

function interpolate(message: string, values?: MessageValues) {
  if (!values) {
    return message;
  }

  return message.replace(/\{(\w+)\}/g, (match, key) => {
    const value = values[key as keyof MessageValues];

    return value === undefined ? match : String(value);
  });
}

export function createTranslator(language: string | undefined) {
  const locale = normalizeLanguage(language) ?? DEFAULT_LANGUAGE;
  const catalog: MessageCatalog = { ...EN_STRINGS, ...OTHER_STRINGS[locale] } as MessageCatalog;

  return function translate(key: MessageKey, values?: MessageValues) {
    const message = catalog[key] ?? EN_STRINGS[key];

    return interpolate(message, values);
  };
}

export type TranslateFunction = ReturnType<typeof createTranslator>;
export type { MessageKey };
