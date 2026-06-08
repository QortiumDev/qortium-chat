export const TEXT_SIZE_VALUES = ['extra-small', 'small', 'medium', 'large', 'extra-large'] as const;

export type QdnTheme = 'dark' | 'light';
export type QdnTextSize = typeof TEXT_SIZE_VALUES[number];

export type QdnDisplaySettings = {
  language: string;
  textSize: QdnTextSize;
  theme: QdnTheme;
};

type QdnHostWindow = Window & {
  _qdnLang?: unknown;
  _qdnTextSize?: unknown;
  _qdnTheme?: unknown;
};

const DEFAULT_DISPLAY_SETTINGS: QdnDisplaySettings = {
  language: 'en',
  textSize: 'medium',
  theme: 'light',
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

export function normalizeLanguage(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().replace(/_/g, '-');

  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(normalized)) {
    return null;
  }

  return normalized;
}

export function normalizeTextSize(value: unknown): QdnTextSize | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return TEXT_SIZE_VALUES.includes(normalized as QdnTextSize) ? normalized as QdnTextSize : null;
}

export function getInitialDisplaySettings(): QdnDisplaySettings {
  const hostWindow = typeof window === 'undefined' ? null : window as QdnHostWindow;

  return {
    language: normalizeLanguage(hostWindow?._qdnLang) ?? DEFAULT_DISPLAY_SETTINGS.language,
    textSize: normalizeTextSize(hostWindow?._qdnTextSize) ?? DEFAULT_DISPLAY_SETTINGS.textSize,
    theme: normalizeTheme(hostWindow?._qdnTheme) ?? DEFAULT_DISPLAY_SETTINGS.theme,
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

    case 'DISPLAY_SETTINGS_CHANGED': {
      const theme = normalizeTheme(data.theme ?? data.qdnTheme) ?? current.theme;
      const language = normalizeLanguage(data.language ?? data.lang ?? data.qdnLang) ?? current.language;
      const textSize = normalizeTextSize(data.textSize ?? data.qdnTextSize) ?? current.textSize;

      return { language, textSize, theme };
    }

    default:
      return null;
  }
}
