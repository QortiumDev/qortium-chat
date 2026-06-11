import { isRtlLanguage, normalizeLanguage as normalizeSupportedLanguage, type SupportedLanguage } from './i18n';

export const TEXT_SIZE_VALUES = ['extra-small', 'small', 'medium', 'large', 'extra-large', 'huge'] as const;
export const ACCENT_OPTIONS = ['green', 'blue', 'orange', 'purple', 'red', 'teal', 'cyan', 'pink', 'yellow'] as const;

export type QdnTheme = 'dark' | 'light';
export type QdnTextSize = typeof TEXT_SIZE_VALUES[number];
export type QdnAccent = typeof ACCENT_OPTIONS[number];

export type QdnDisplaySettings = {
  language: SupportedLanguage;
  textSize: QdnTextSize;
  theme: QdnTheme;
  accent: QdnAccent;
};

type QdnHostWindow = Window & {
  _qdnLang?: unknown;
  _qdnLanguage?: unknown;
  _qdnTextSize?: unknown;
  _qdnTheme?: unknown;
  _qdnAccent?: unknown;
};

const DEFAULT_DISPLAY_SETTINGS: QdnDisplaySettings = {
  language: 'en',
  textSize: 'medium',
  theme: 'light',
  accent: 'green',
};

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

export function normalizeTheme(value: unknown): QdnTheme | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return normalized === 'dark' || normalized === 'light' ? normalized : null;
}

export function normalizeLanguage(value: unknown): SupportedLanguage | null {
  if (typeof value !== 'string') {
    return null;
  }

  return normalizeSupportedLanguage(value);
}

export function normalizeTextSize(value: unknown): QdnTextSize | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return TEXT_SIZE_VALUES.includes(normalized as QdnTextSize) ? normalized as QdnTextSize : null;
}

export function normalizeAccent(value: unknown): QdnAccent | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return ACCENT_OPTIONS.includes(normalized as QdnAccent) ? normalized as QdnAccent : null;
}

export function getInitialDisplaySettings(): QdnDisplaySettings {
  const hostWindow = typeof window === 'undefined' ? null : window as QdnHostWindow;
  const query = typeof window === 'undefined' ? null : new URLSearchParams(window.location?.search ?? '');

  return {
    language: normalizeLanguage(query?.get('lang') ?? query?.get('language') ?? hostWindow?._qdnLang ?? hostWindow?._qdnLanguage) ??
      DEFAULT_DISPLAY_SETTINGS.language,
    textSize: normalizeTextSize(query?.get('textSize') ?? query?.get('text-size')) ??
      normalizeTextSize(hostWindow?._qdnTextSize) ??
      DEFAULT_DISPLAY_SETTINGS.textSize,
    theme: normalizeTheme(query?.get('theme') ?? hostWindow?._qdnTheme) ?? DEFAULT_DISPLAY_SETTINGS.theme,
    accent: normalizeAccent(query?.get('accent') ?? hostWindow?._qdnAccent) ?? DEFAULT_DISPLAY_SETTINGS.accent,
  };
}

export function applyDisplaySettings(settings: QdnDisplaySettings) {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;

  root.dataset.language = settings.language;
  root.dataset.textSize = settings.textSize;
  root.dataset.theme = settings.theme;
  root.dataset.accent = settings.accent;
  root.dir = isRtlLanguage(settings.language) ? 'rtl' : 'ltr';
  root.lang = settings.language;
  root.style.colorScheme = settings.theme;
}

export function getDisplaySettingsUpdateFromMessage(
  data: unknown,
  current: QdnDisplaySettings,
): QdnDisplaySettings | null {
  if (!isObject(data) || typeof data.action !== 'string') {
    return null;
  }

  switch (data.action) {
    case 'THEME_CHANGED': {
      const theme = normalizeTheme(data.theme ?? data.qdnTheme);

      return theme ? { ...current, theme } : null;
    }

    case 'LANGUAGE_CHANGED': {
      const language = normalizeLanguage(data.language ?? data.lang ?? data.qdnLang);

      return language ? { ...current, language } : null;
    }

    case 'TEXT_SIZE_CHANGED': {
      const textSize = normalizeTextSize(data.textSize ?? data.qdnTextSize);

      return textSize ? { ...current, textSize } : null;
    }

    case 'ACCENT_CHANGED': {
      const accent = normalizeAccent(data.accent ?? data.qdnAccent);

      return accent ? { ...current, accent } : null;
    }

    case 'DISPLAY_SETTINGS_CHANGED': {
      const theme = normalizeTheme(data.theme ?? data.qdnTheme) ?? current.theme;
      const language = normalizeLanguage(data.language ?? data.lang ?? data.qdnLang) ?? current.language;
      const textSize = normalizeTextSize(data.textSize ?? data.qdnTextSize) ?? current.textSize;
      const accent = normalizeAccent(data.accent ?? data.qdnAccent) ?? current.accent;

      return { language, textSize, theme, accent };
    }

    default:
      return null;
  }
}
