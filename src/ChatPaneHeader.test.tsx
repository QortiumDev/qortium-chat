import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ChatPaneHeader } from './ChatPaneHeader';

describe('ChatPaneHeader', () => {
  it('offers the avatar lightbox only after a loaded image is available', () => {
    const loaded = renderToStaticMarkup(
      <ChatPaneHeader
        avatar={{ fallback: 'QC', name: 'Qortium Chat', src: 'blob:group-avatar' }}
        backLabel="Back"
        onBack={() => {}}
        onOpenAvatar={() => {}}
        openAvatarLabel="Open avatar image"
        title="Qortium Chat"
      />,
    );
    const fallback = renderToStaticMarkup(
      <ChatPaneHeader
        avatar={{ fallback: 'QC', name: 'Qortium Chat', src: null }}
        backLabel="Back"
        onBack={() => {}}
        onOpenAvatar={() => {}}
        openAvatarLabel="Open avatar image"
        title="Qortium Chat"
      />,
    );

    expect(loaded).toContain('aria-label="Open avatar image"');
    expect(loaded).toContain('src="blob:group-avatar"');
    expect(fallback).not.toContain('aria-label="Open avatar image"');
    expect(fallback).toContain('>QC<');
  });

  it('keeps the private lock distinct from host-level unavailability', () => {
    const markup = renderToStaticMarkup(
      <ChatPaneHeader
        backLabel="Back"
        closedLabel="Private group"
        isClosed
        onBack={() => {}}
        title="Closed group"
        unavailableLabel="Private chat unavailable in this host"
      />,
    );

    expect(markup).toContain('class="chat-pane__title-lock"');
    expect(markup).toContain('class="chat-pane__title-unavailable"');
    expect(markup).toContain('aria-label="Private chat unavailable in this host"');
  });

  it('shows the group id before the network and CHAT chips', () => {
    const markup = renderToStaticMarkup(
      <ChatPaneHeader backLabel="Back" groupId={4} network="qortium" onBack={() => {}} title="Private group" />,
    );

    expect(markup.indexOf('>#4</span>')).toBeLessThan(markup.indexOf('>Qortium</span>'));
    expect(markup.indexOf('>Qortium</span>')).toBeLessThan(markup.indexOf('>CHAT</span>'));
  });
});
