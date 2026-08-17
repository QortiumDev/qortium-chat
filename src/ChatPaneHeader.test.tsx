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
});
