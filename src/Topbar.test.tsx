import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { createTranslator } from './i18n';
import { DISABLED_CHAT_NOTIFICATION_PREFERENCES } from './notifications';
import { Topbar } from './Topbar';
import type { ChatView } from './deepLink';

function renderTopbar(workspaceView: ChatView, language = 'en') {
  return renderToStaticMarkup(
    <Topbar
      account={null}
      accountError=""
      appVersion="v2.0.14"
      canControlChatNotifications={false}
      canManageNotifications={false}
      canShowNotifications={false}
      chatNotificationPreferences={DISABLED_CHAT_NOTIFICATION_PREFERENCES}
      chatNotificationSettingsRef={{ current: null }}
      chatNotificationsBusy={false}
      chatNotificationsEnabled={false}
      chatNotificationsError=""
      chatNotificationToggleRef={{ current: null }}
      isChatNotificationMenuOpen={false}
      isGateway={false}
      isHomeBridge
      isHomeV2AppTab={false}
      onOpenAvatar={() => {}}
      onRequestAccountRefresh={() => {}}
      onSelectWorkspace={() => {}}
      qortiumAvatarProfiles={new Map()}
      setChatNotificationMenuOpen={() => {}}
      t={createTranslator(language)}
      updateChatNotificationPreference={() => {}}
      workspaceView={workspaceView}
    />,
  );
}

describe('Topbar workspace navigation', () => {
  it('marks the active workspace with aria-current and links both tabs as real routes', () => {
    const chat = renderTopbar('chat');
    expect(chat).toContain('aria-label="Workspaces" class="workspace-nav"');
    expect(chat).toContain('<a aria-current="page" class="workspace-nav__tab" href="/">Chat</a>');
    expect(chat).toContain('<a class="workspace-nav__tab" href="/?view=developers">Developers</a>');

    const developers = renderTopbar('developers');
    expect(developers).toContain('<a class="workspace-nav__tab" href="/">Chat</a>');
    expect(developers).toContain('<a aria-current="page" class="workspace-nav__tab" href="/?view=developers">Developers</a>');
    expect(developers.split('aria-current="page"')).toHaveLength(2);
  });

  it('localizes the tab labels while the route stays canonical', () => {
    const german = renderTopbar('developers', 'de');
    expect(german).toContain('aria-label="Arbeitsbereiche"');
    expect(german).toContain('href="/?view=developers">Entwickler</a>');

    const japanese = renderTopbar('chat', 'ja');
    expect(japanese).toContain('>チャット</a>');
    expect(japanese).toContain('href="/?view=developers">開発者</a>');
  });
});
