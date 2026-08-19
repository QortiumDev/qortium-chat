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
    ar: ['status.bridge.accountLocked', 'status.bridge.generic', 'status.bridge.missingGroupKey', 'status.bridge.missingRecipientPublicKey', 'status.bridge.nodeCapabilityMissing', 'status.bridge.notGroupMember', 'status.bridge.pendingJournalNotice', 'status.bridge.pendingReconciliationRequired', 'status.bridge.routeUnavailable', 'status.bridge.staleContext', 'status.bridge.validationFailed'],
    he: ['status.bridge.accountLocked', 'status.bridge.generic', 'status.bridge.missingGroupKey', 'status.bridge.missingRecipientPublicKey', 'status.bridge.nodeCapabilityMissing', 'status.bridge.notGroupMember', 'status.bridge.pendingJournalNotice', 'status.bridge.pendingReconciliationRequired', 'status.bridge.routeUnavailable', 'status.bridge.staleContext', 'status.bridge.validationFailed'],
    ja: ['status.bridge.accountLocked', 'status.bridge.generic', 'status.bridge.missingGroupKey', 'status.bridge.missingRecipientPublicKey', 'status.bridge.nodeCapabilityMissing', 'status.bridge.notGroupMember', 'status.bridge.pendingJournalNotice', 'status.bridge.pendingReconciliationRequired', 'status.bridge.routeUnavailable', 'status.bridge.staleContext', 'status.bridge.validationFailed'],
    ko: ['status.bridge.accountLocked', 'status.bridge.generic', 'status.bridge.missingGroupKey', 'status.bridge.missingRecipientPublicKey', 'status.bridge.nodeCapabilityMissing', 'status.bridge.notGroupMember', 'status.bridge.pendingJournalNotice', 'status.bridge.pendingReconciliationRequired', 'status.bridge.routeUnavailable', 'status.bridge.staleContext', 'status.bridge.validationFailed'],
    ru: ['status.bridge.accountLocked', 'status.bridge.generic', 'status.bridge.missingGroupKey', 'status.bridge.missingRecipientPublicKey', 'status.bridge.nodeCapabilityMissing', 'status.bridge.notGroupMember', 'status.bridge.pendingJournalNotice', 'status.bridge.pendingReconciliationRequired', 'status.bridge.routeUnavailable', 'status.bridge.staleContext', 'status.bridge.validationFailed'],
    'zh-CN': ['status.bridge.accountLocked', 'status.bridge.generic', 'status.bridge.missingGroupKey', 'status.bridge.missingRecipientPublicKey', 'status.bridge.nodeCapabilityMissing', 'status.bridge.notGroupMember', 'status.bridge.pendingJournalNotice', 'status.bridge.pendingReconciliationRequired', 'status.bridge.routeUnavailable', 'status.bridge.staleContext', 'status.bridge.validationFailed'],
    'zh-TW': ['status.bridge.accountLocked', 'status.bridge.generic', 'status.bridge.missingGroupKey', 'status.bridge.missingRecipientPublicKey', 'status.bridge.nodeCapabilityMissing', 'status.bridge.notGroupMember', 'status.bridge.pendingJournalNotice', 'status.bridge.pendingReconciliationRequired', 'status.bridge.routeUnavailable', 'status.bridge.staleContext', 'status.bridge.validationFailed'],
    de: ['aria.navigation', 'label.approval.block', 'label.approval.windowEta', 'label.common.navigation', 'label.composer.emoji', 'label.group.admin', 'label.group.global', 'label.member.online', 'status.bridge.accountLocked', 'status.bridge.generic', 'status.bridge.missingGroupKey', 'status.bridge.missingRecipientPublicKey', 'status.bridge.nodeCapabilityMissing', 'status.bridge.notGroupMember', 'status.bridge.pendingJournalNotice', 'status.bridge.pendingReconciliationRequired', 'status.bridge.routeUnavailable', 'status.bridge.staleContext', 'status.bridge.validationFailed'],
    el: ['app.title', 'label.composer.emoji', 'status.bridge.accountLocked', 'status.bridge.generic', 'status.bridge.missingGroupKey', 'status.bridge.missingRecipientPublicKey', 'status.bridge.nodeCapabilityMissing', 'status.bridge.notGroupMember', 'status.bridge.pendingJournalNotice', 'status.bridge.pendingReconciliationRequired', 'status.bridge.routeUnavailable', 'status.bridge.staleContext', 'status.bridge.validationFailed'],
    es: ['label.approval.eta.hours', 'label.approval.eta.minutes', 'label.composer.emoji', 'label.error', 'label.group.global', 'message.error', 'status.bridge.accountLocked', 'status.bridge.generic', 'status.bridge.missingGroupKey', 'status.bridge.missingRecipientPublicKey', 'status.bridge.nodeCapabilityMissing', 'status.bridge.notGroupMember', 'status.bridge.pendingJournalNotice', 'status.bridge.pendingReconciliationRequired', 'status.bridge.routeUnavailable', 'status.bridge.staleContext', 'status.bridge.validationFailed'],
    et: ['label.approval.eta.hours', 'label.approval.eta.minutes', 'label.composer.emoji', 'status.bridge.accountLocked', 'status.bridge.generic', 'status.bridge.missingGroupKey', 'status.bridge.missingRecipientPublicKey', 'status.bridge.nodeCapabilityMissing', 'status.bridge.notGroupMember', 'status.bridge.pendingJournalNotice', 'status.bridge.pendingReconciliationRequired', 'status.bridge.routeUnavailable', 'status.bridge.staleContext', 'status.bridge.validationFailed'],
    fi: ['label.approval.eta.minutes', 'label.composer.emoji', 'status.bridge.accountLocked', 'status.bridge.generic', 'status.bridge.missingGroupKey', 'status.bridge.missingRecipientPublicKey', 'status.bridge.nodeCapabilityMissing', 'status.bridge.notGroupMember', 'status.bridge.pendingJournalNotice', 'status.bridge.pendingReconciliationRequired', 'status.bridge.routeUnavailable', 'status.bridge.staleContext', 'status.bridge.validationFailed'],
    fr: ['aria.navigation', 'button.mention', 'label.approval.eta.hours', 'label.approval.eta.minutes', 'label.approval.signature', 'label.approval.type.unknown', 'label.common.direct', 'label.common.message', 'label.common.navigation', 'label.group.admin', 'label.group.global', 'label.invites', 'label.message', 'placeholder.message', 'status.bridge.accountLocked', 'status.bridge.generic', 'status.bridge.missingGroupKey', 'status.bridge.missingRecipientPublicKey', 'status.bridge.nodeCapabilityMissing', 'status.bridge.notGroupMember', 'status.bridge.pendingJournalNotice', 'status.bridge.pendingReconciliationRequired', 'status.bridge.routeUnavailable', 'status.bridge.staleContext', 'status.bridge.validationFailed', 'title.directPanel'],
    hi: ['app.title', 'status.bridge.accountLocked', 'status.bridge.generic', 'status.bridge.missingGroupKey', 'status.bridge.missingRecipientPublicKey', 'status.bridge.nodeCapabilityMissing', 'status.bridge.notGroupMember', 'status.bridge.pendingJournalNotice', 'status.bridge.pendingReconciliationRequired', 'status.bridge.routeUnavailable', 'status.bridge.staleContext', 'status.bridge.validationFailed'],
    hu: ['label.composer.emoji', 'label.group.admin', 'status.bridge.accountLocked', 'status.bridge.generic', 'status.bridge.missingGroupKey', 'status.bridge.missingRecipientPublicKey', 'status.bridge.nodeCapabilityMissing', 'status.bridge.notGroupMember', 'status.bridge.pendingJournalNotice', 'status.bridge.pendingReconciliationRequired', 'status.bridge.routeUnavailable', 'status.bridge.staleContext', 'status.bridge.validationFailed'],
    it: ['label.approval.eta.hours', 'label.approval.eta.minutes', 'label.composer.emoji', 'label.group.admin', 'label.member.online', 'status.bridge.accountLocked', 'status.bridge.generic', 'status.bridge.missingGroupKey', 'status.bridge.missingRecipientPublicKey', 'status.bridge.nodeCapabilityMissing', 'status.bridge.notGroupMember', 'status.bridge.pendingJournalNotice', 'status.bridge.pendingReconciliationRequired', 'status.bridge.routeUnavailable', 'status.bridge.staleContext', 'status.bridge.validationFailed'],
    nb: ['app.title', 'button.send', 'button.startMinting', 'group.status.minting.minting', 'label.approval.eta.minutes', 'label.composer.emoji', 'label.group.admin', 'label.group.global', 'status.bridge.accountLocked', 'status.bridge.generic', 'status.bridge.missingGroupKey', 'status.bridge.missingRecipientPublicKey', 'status.bridge.nodeCapabilityMissing', 'status.bridge.notGroupMember', 'status.bridge.pendingJournalNotice', 'status.bridge.pendingReconciliationRequired', 'status.bridge.routeUnavailable', 'status.bridge.staleContext', 'status.bridge.validationFailed'],
    nl: ['label.approval.eta.minutes', 'label.common.direct', 'label.composer.emoji', 'label.group.open', 'label.member.online', 'status.bridge.accountLocked', 'status.bridge.generic', 'status.bridge.missingGroupKey', 'status.bridge.missingRecipientPublicKey', 'status.bridge.nodeCapabilityMissing', 'status.bridge.notGroupMember', 'status.bridge.pendingJournalNotice', 'status.bridge.pendingReconciliationRequired', 'status.bridge.routeUnavailable', 'status.bridge.staleContext', 'status.bridge.validationFailed', 'title.directPanel'],
    pl: ['label.approval.eta.minutes', 'label.composer.emoji', 'label.member.online', 'status.bridge.accountLocked', 'status.bridge.generic', 'status.bridge.missingGroupKey', 'status.bridge.missingRecipientPublicKey', 'status.bridge.nodeCapabilityMissing', 'status.bridge.notGroupMember', 'status.bridge.pendingJournalNotice', 'status.bridge.pendingReconciliationRequired', 'status.bridge.routeUnavailable', 'status.bridge.staleContext', 'status.bridge.validationFailed'],
    pt: ['label.approval.eta.hours', 'label.approval.eta.minutes', 'label.composer.emoji', 'label.group.global', 'label.member.online', 'status.bridge.accountLocked', 'status.bridge.generic', 'status.bridge.missingGroupKey', 'status.bridge.missingRecipientPublicKey', 'status.bridge.nodeCapabilityMissing', 'status.bridge.notGroupMember', 'status.bridge.pendingJournalNotice', 'status.bridge.pendingReconciliationRequired', 'status.bridge.routeUnavailable', 'status.bridge.staleContext', 'status.bridge.validationFailed'],
    ro: ['label.approval.eta.hours', 'label.approval.eta.minutes', 'label.common.direct', 'label.composer.emoji', 'label.group.global', 'label.member.online', 'status.bridge.accountLocked', 'status.bridge.generic', 'status.bridge.missingGroupKey', 'status.bridge.missingRecipientPublicKey', 'status.bridge.nodeCapabilityMissing', 'status.bridge.notGroupMember', 'status.bridge.pendingJournalNotice', 'status.bridge.pendingReconciliationRequired', 'status.bridge.routeUnavailable', 'status.bridge.staleContext', 'status.bridge.validationFailed', 'title.directPanel'],
    sv: ['label.approval.block', 'label.approval.eta.hours', 'label.approval.eta.minutes', 'label.approval.windowEta', 'label.composer.emoji', 'label.group.global', 'label.member.online', 'status.bridge.accountLocked', 'status.bridge.generic', 'status.bridge.missingGroupKey', 'status.bridge.missingRecipientPublicKey', 'status.bridge.nodeCapabilityMissing', 'status.bridge.notGroupMember', 'status.bridge.pendingJournalNotice', 'status.bridge.pendingReconciliationRequired', 'status.bridge.routeUnavailable', 'status.bridge.staleContext', 'status.bridge.validationFailed'],
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
