import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyDisplaySettings,
  getDisplaySettingsUpdateFromMessage,
  getInitialDisplaySettings,
  normalizeAccent,
  normalizeLanguage,
  normalizeTextSize,
  normalizeTheme,
  normalizeUiStyle,
  type QdnDisplaySettings,
} from './displaySettings';

const current: QdnDisplaySettings = {
  language: 'en',
  textSize: 'medium',
  theme: 'light',
  accent: 'green',
  uiStyle: 'classic',
};

describe('display settings helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalizes supported display values', () => {
    expect(normalizeTheme('DARK')).toBe('dark');
    expect(normalizeLanguage('en_US')).toBe('en');
    expect(normalizeTextSize('extra-large')).toBe('extra-large');
    expect(normalizeAccent('blue')).toBe('blue');
    expect(normalizeUiStyle('MODERN')).toBe('modern');
    expect(normalizeLanguage('zh-Hant')).toBe('zh-TW');
    expect(normalizeLanguage('zh_Hans')).toBe('zh-CN');
    expect(normalizeTextSize('huge')).toBe('huge');
  });

  it('rejects unsupported display values', () => {
    expect(normalizeTheme('sepia')).toBeNull();
    expect(normalizeLanguage('../en')).toBeNull();
    expect(normalizeTextSize('extra-huge')).toBeNull();
    expect(normalizeAccent('neon')).toBeNull();
    expect(normalizeUiStyle('retro')).toBeNull();
  });

  it('reads initial QDN globals from Core/Home', () => {
    vi.stubGlobal('window', {
      _qdnLang: 'en-US',
      _qdnTextSize: 'large',
      _qdnTheme: 'dark',
      _qdnAccent: 'blue',
      _qdnUiStyle: 'modern',
    });

    expect(getInitialDisplaySettings()).toEqual({
      language: 'en',
      textSize: 'large',
      theme: 'dark',
      accent: 'blue',
      uiStyle: 'modern',
    });
  });

  it('prefers Core/Home query params over global values', () => {
    vi.stubGlobal('window', {
      _qdnLang: 'en',
      _qdnTextSize: 'small',
      _qdnTheme: 'light',
      _qdnAccent: 'yellow',
      _qdnUiStyle: 'modern',
      location: {
        search: '?theme=dark&textSize=huge&lang=en-US&accent=red&uiStyle=classic',
      },
    });

    expect(getInitialDisplaySettings()).toEqual({
      language: 'en',
      textSize: 'huge',
      theme: 'dark',
      accent: 'red',
      uiStyle: 'classic',
    });
  });

  it('updates individual settings from Home messages', () => {
    expect(getDisplaySettingsUpdateFromMessage({ action: 'THEME_CHANGED', requestedHandler: 'UI', theme: 'dark' }, current)).toEqual({
      ...current,
      theme: 'dark',
    });
    expect(getDisplaySettingsUpdateFromMessage({ action: 'LANGUAGE_CHANGED', requestedHandler: 'UI', language: 'en-US' }, current)).toEqual({
      ...current,
      language: 'en',
    });
    expect(getDisplaySettingsUpdateFromMessage({ action: 'TEXT_SIZE_CHANGED', requestedHandler: 'UI', textSize: 'extra-large' }, current)).toEqual({
      ...current,
      textSize: 'extra-large',
    });
    expect(getDisplaySettingsUpdateFromMessage({ action: 'ACCENT_CHANGED', requestedHandler: 'UI', accent: 'blue' }, current)).toEqual({
      ...current,
      accent: 'blue',
    });
    expect(getDisplaySettingsUpdateFromMessage({ action: 'UI_STYLE_CHANGED', requestedHandler: 'UI', uiStyle: 'modern' }, current)).toEqual({
      ...current,
      uiStyle: 'modern',
    });
  });

  it('updates batched settings and ignores invalid messages', () => {
    expect(
      getDisplaySettingsUpdateFromMessage(
        {
          action: 'DISPLAY_SETTINGS_CHANGED',
          language: 'en',
          textSize: 'small',
          theme: 'dark',
          accent: 'red',
          uiStyle: 'modern',
        },
        current,
      ),
    ).toEqual({
      language: 'en',
      textSize: 'small',
      theme: 'dark',
      accent: 'red',
      uiStyle: 'modern',
    });
    expect(getDisplaySettingsUpdateFromMessage({ action: 'TEXT_SIZE_CHANGED', textSize: 'extra-huge' }, current)).toBeNull();
    expect(getDisplaySettingsUpdateFromMessage({ action: 'UI_STYLE_CHANGED', uiStyle: 'banana' }, current)).toBeNull();
    expect(getDisplaySettingsUpdateFromMessage({ action: 'UI_STYLE_CHANGED', requestedHandler: 'OTHER', uiStyle: 'modern' }, current)).toBeNull();
    expect(getDisplaySettingsUpdateFromMessage({ action: 'UNKNOWN' }, current)).toBeNull();
  });

  it('defaults unsupported or absent uiStyle to classic', () => {
    vi.stubGlobal('window', {
      location: {
        search: '?uiStyle=banana',
      },
    });

    expect(getInitialDisplaySettings()).toMatchObject({
      uiStyle: 'classic',
    });
  });

  it('applies display settings to the document root', () => {
    const root = {
      dataset: {} as Record<string, string>,
      dir: '',
      lang: '',
      style: {} as Record<string, string>,
    };

    vi.stubGlobal('document', {
      documentElement: root,
    });

    applyDisplaySettings({
      language: 'ar',
      textSize: 'huge',
      theme: 'dark',
      accent: 'purple',
      uiStyle: 'modern',
    });

    expect(root.dataset).toMatchObject({
      language: 'ar',
      textSize: 'huge',
      theme: 'dark',
      accent: 'purple',
      ui: 'modern',
    });
    expect(root.dir).toBe('rtl');
    expect(root.lang).toBe('ar');
    expect(root.style.colorScheme).toBe('dark');
  });
});
