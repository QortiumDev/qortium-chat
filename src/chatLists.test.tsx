import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { GroupList } from './chatLists';
import { createGroupConversationSummary } from './conversationModel';
import { createTranslator } from './i18n';

const privateConversation = createGroupConversationSummary({
  access: 'interactive',
  group: { groupId: 12, groupName: 'Private builders', isOpen: false },
  membership: 'joined',
  network: 'qortal',
  title: 'Private builders',
});

function renderPrivateGroup(status: 'available' | 'unavailable') {
  return renderToStaticMarkup(
    <GroupList
      conversations={[privateConversation]}
      groupAvatarProfiles={new Map()}
      onSelect={() => {}}
      privateGroupCapabilityStatus={status}
      privateGroupUnavailableLabel="Private chat unavailable in this host"
      selectedConversationKey={null}
      t={createTranslator('en')}
      now={0}
    />,
  );
}

describe('GroupList private-group capability badges', () => {
  it('shows both privacy and host-unavailable semantics when the bridge lacks the private family', () => {
    const markup = renderPrivateGroup('unavailable');

    expect(markup).toContain('class="group-row__lock"');
    expect(markup).toContain('class="group-row__unavailable"');
    expect(markup).toContain('aria-label="Private chat unavailable in this host"');
  });

  it('keeps only the privacy lock when private chat is supported', () => {
    const markup = renderPrivateGroup('available');

    expect(markup).toContain('class="group-row__lock"');
    expect(markup).not.toContain('group-row__unavailable');
  });
});
