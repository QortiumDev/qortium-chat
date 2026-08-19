import type { Dispatch, RefObject, SetStateAction } from 'react';

import { getAvatarView, getShortAddress, UserAvatar, type AvatarProfilesByAddress } from './accountDisplay';
import type { AvatarLightboxImage } from './AvatarLightbox';
import { BellIcon, BrandMark } from './icons';
import type { TranslateFunction } from './i18n';
import type { ChatNotificationPreferences } from './notifications';
import type { AvatarProfile } from './avatarProfiles';
import type { QdnSelectedAccount } from './types';

function getAccountMessage(error: string, isHomeBridge: boolean, t: TranslateFunction) {
  if (error.includes('No account is selected')) {
    return t('label.account.required.select');
  }

  if (error.includes('Account access was not shared')) {
    return t('action.account.notShared');
  }

  return isHomeBridge
    ? t('action.account.notShared')
    : t('action.noAccountUse');
}

function AccountSummary({
  account,
  error,
  isHomeBridge,
  isGateway,
  onConnect,
  onOpenAvatar,
  profile,
  t,
}: {
  account: QdnSelectedAccount | null;
  error: string;
  isHomeBridge: boolean;
  isGateway: boolean;
  onConnect: () => void;
  onOpenAvatar: (image: AvatarLightboxImage) => void;
  profile?: AvatarProfile;
  t: TranslateFunction;
}) {
  if (account) {
    const { avatarSrc, name } = getAvatarView(profile, account.name);
    const label = name || getShortAddress(account.address);

    return (
      <div className="account-summary">
        <UserAvatar
          className="account-summary__avatar"
          name={name}
          onOpen={onOpenAvatar}
          openLabel={t('action.openAvatarImage')}
          src={avatarSrc}
        />
        <div className="account-summary__text">
          <div className="account-summary__primary">
            <strong>{label}</strong>
            <span
              className={`account-summary__status account-summary__status--${account.isUnlocked ? 'unlocked' : 'locked'}`}
            >
              {account.isUnlocked ? t('status.account.unlocked') : t('status.account.locked')}
            </span>
          </div>
          <span className="account-summary__address">{account.address}</span>
        </div>
      </div>
    );
  }

  if (isGateway) {
    return (
      <div className="account-connect account-connect--gateway">
        <p className="muted">{t('status.gateway.readOnly')}</p>
      </div>
    );
  }

  return (
    <div className="account-connect">
      <p className="muted">{getAccountMessage(error, isHomeBridge, t)}</p>
      {isHomeBridge ? (
        <button className="button button--secondary" onClick={onConnect} type="button">
          {t('label.account.summary.useSelected')}
        </button>
      ) : null}
    </div>
  );
}

export function Topbar({
  account,
  accountError,
  appVersion,
  canControlChatNotifications,
  canManageNotifications,
  canShowNotifications,
  chatNotificationPreferences,
  chatNotificationSettingsRef,
  chatNotificationsBusy,
  chatNotificationsEnabled,
  chatNotificationsError,
  chatNotificationToggleRef,
  isChatNotificationMenuOpen,
  isGateway,
  isHomeBridge,
  isHomeV2AppTab,
  onOpenAvatar,
  onRequestAccountRefresh,
  qortiumAvatarProfiles,
  setChatNotificationMenuOpen,
  t,
  updateChatNotificationPreference,
}: {
  account: QdnSelectedAccount | null;
  accountError: string;
  appVersion: string;
  canControlChatNotifications: boolean;
  canManageNotifications: boolean;
  canShowNotifications: boolean;
  chatNotificationPreferences: ChatNotificationPreferences;
  chatNotificationSettingsRef: RefObject<HTMLDivElement | null>;
  chatNotificationsBusy: boolean;
  chatNotificationsEnabled: boolean;
  chatNotificationsError: string;
  chatNotificationToggleRef: RefObject<HTMLButtonElement | null>;
  isChatNotificationMenuOpen: boolean;
  isGateway: boolean;
  isHomeBridge: boolean;
  isHomeV2AppTab: boolean;
  onOpenAvatar: (image: AvatarLightboxImage) => void;
  onRequestAccountRefresh: () => void;
  qortiumAvatarProfiles: AvatarProfilesByAddress;
  setChatNotificationMenuOpen: Dispatch<SetStateAction<boolean>>;
  t: TranslateFunction;
  updateChatNotificationPreference: (
    key: Exclude<keyof ChatNotificationPreferences, 'version'>,
    enabled: boolean,
  ) => Promise<void> | void;
}) {
  return (
    <header className="topbar">
      <div className="topbar__title">
        {isHomeV2AppTab ? null : <BrandMark />}
        <h1>{isHomeV2AppTab ? 'Chat' : t('app.title')}</h1>
        {isHomeV2AppTab ? (
          <span className="topbar__host-context">Home</span>
        ) : (
          <span className="topbar__version">{appVersion}</span>
        )}
      </div>
      <div className="topbar__account">
        {canControlChatNotifications ? (
          <div className="notification-settings" ref={chatNotificationSettingsRef}>
            <button
              aria-controls="chat-notification-settings"
              aria-expanded={isChatNotificationMenuOpen}
              aria-haspopup="dialog"
              aria-label={t('action.notifications.settings')}
              aria-pressed={chatNotificationsEnabled}
              className="icon-button topbar__notification-toggle"
              onClick={() => setChatNotificationMenuOpen((open) => !open)}
              ref={chatNotificationToggleRef}
              title={chatNotificationsError || t('action.notifications.settings')}
              type="button"
            >
              <BellIcon />
            </button>
            {isChatNotificationMenuOpen ? (
              <div
                aria-label={t('action.notifications.settings')}
                className="notification-settings__popover"
                id="chat-notification-settings"
                role="dialog"
              >
                <strong className="notification-settings__title">
                  {t('action.notifications.settings')}
                </strong>
                <p className="notification-settings__scope">
                  {t(canManageNotifications ? 'notification.settings.scope' : 'notification.settings.scope.foreground')}
                </p>
                <fieldset className="notification-settings__choices" disabled={chatNotificationsBusy}>
                  <legend className="sr-only">{t('action.notifications.settings')}</legend>
                  <label className="notification-settings__choice">
                    <input
                      checked={chatNotificationPreferences.direct}
                      onChange={(event) => void updateChatNotificationPreference('direct', event.target.checked)}
                      type="checkbox"
                    />
                    <span>{t('notification.direct.title')}</span>
                  </label>
                  <label className="notification-settings__choice">
                    <input
                      checked={chatNotificationPreferences.mentions}
                      disabled={!canShowNotifications}
                      onChange={(event) => void updateChatNotificationPreference('mentions', event.target.checked)}
                      type="checkbox"
                    />
                    <span>{t('notification.mention.title')}</span>
                  </label>
                  <label className="notification-settings__choice">
                    <input
                      checked={chatNotificationPreferences.replies}
                      disabled={!canShowNotifications}
                      onChange={(event) => void updateChatNotificationPreference('replies', event.target.checked)}
                      type="checkbox"
                    />
                    <span>{t('notification.reply.title')}</span>
                  </label>
                </fieldset>
                {chatNotificationsError ? (
                  <p className="notification-settings__error" role="alert">{chatNotificationsError}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        <AccountSummary
          account={account}
          error={accountError}
          isHomeBridge={isHomeBridge}
          isGateway={isGateway}
          onConnect={onRequestAccountRefresh}
          onOpenAvatar={onOpenAvatar}
          profile={account ? qortiumAvatarProfiles.get(account.address) : undefined}
          t={t}
        />
      </div>
    </header>
  );
}
