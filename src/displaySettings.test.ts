import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getDisplaySettingsUpdateFromMessage,
  getInitialDisplaySettings,
  normalizeLanguage,
  normalizeTextSize,
  normalizeTheme,
  type QdnDisplaySettings,
} from './displaySettings';

const current: QdnDisplaySettings = {
  language: 'en',
  textSize: 'medium',
  theme: 'light',
};

describe('display settings helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalizes supported display values', () => {
    expect(normalizeTheme('DARK')).toBe('dark');
    expect(normalizeLanguage('en_US')).toBe('en-US');
    expect(normalizeTextSize('extra-large')).toBe('extra-large');
  });

  it('rejects unsupported display values', () => {
    expect(normalizeTheme('sepia')).toBeNull();
    expect(normalizeLanguage('../en')).toBeNull();
    expect(normalizeTextSize('huge')).toBeNull();
  });

  it('reads initial QDN globals from Core/Home', () => {
    vi.stubGlobal('window', {
      _qdnLang: 'en-US',
      _qdnTextSize: 'large',
      _qdnTheme: 'dark',
    });

    expect(getInitialDisplaySettings()).toEqual({
      language: 'en-US',
      textSize: 'large',
      theme: 'dark',
    });
  });

  it('updates individual settings from Home messages', () => {
    expect(getDisplaySettingsUpdateFromMessage({ action: 'THEME_CHANGED', theme: 'dark' }, current)).toEqual({
      ...current,
      theme: 'dark',
    });
    expect(getDisplaySettingsUpdateFromMessage({ action: 'LANGUAGE_CHANGED', language: 'en-US' }, current)).toEqual({
      ...current,
      language: 'en-US',
    });
    expect(getDisplaySettingsUpdateFromMessage({ action: 'TEXT_SIZE_CHANGED', textSize: 'extra-large' }, current)).toEqual({
      ...current,
      textSize: 'extra-large',
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
        },
        current,
      ),
    ).toEqual({
      language: 'en',
      textSize: 'small',
      theme: 'dark',
    });
    expect(getDisplaySettingsUpdateFromMessage({ action: 'TEXT_SIZE_CHANGED', textSize: 'huge' }, current)).toBeNull();
    expect(getDisplaySettingsUpdateFromMessage({ action: 'UNKNOWN' }, current)).toBeNull();
  });
});
