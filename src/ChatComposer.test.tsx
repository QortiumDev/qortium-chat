import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatComposer } from './ChatComposer';

function render(overrides: { sendPending: boolean; sendPendingLabel?: string; sendPendingNotice?: string | null }) {
  return renderToStaticMarkup(
    <ChatComposer
      attachLabel="Attach"
      attachTitle="Attach"
      attachment={null}
      attachmentError=""
      attachmentInputRef={createRef<HTMLInputElement>()}
      canAttach
      canCompose
      canLinkResource={false}
      canSubmit
      cancelLabel="Cancel"
      context={null}
      draft="hello"
      emojiLabel="Emoji"
      emojiOpen={false}
      formatLabels={{ bold: 'Bold', code: 'Code', italic: 'Italic', strike: 'Strike' }}
      linkResourceLabel="Link"
      loadingLabel="Loading"
      mentionCandidates={[]}
      mentionSuggestionsLabel="Mentions"
      messageLabel="Message"
      messagePlaceholder="Type"
      onAttachClick={() => undefined}
      onAttachmentSelected={() => undefined}
      onCancelContext={() => undefined}
      onClearAttachment={() => undefined}
      onDraftChange={() => undefined}
      onEmojiSelected={() => undefined}
      onLinkResourceClick={() => undefined}
      onPaste={() => undefined}
      onSubmit={() => undefined}
      onToggleEmoji={() => undefined}
      processingLabel="Processing"
      remainingBytesLabel=""
      remainingBytesOverLimit={false}
      removeAttachmentLabel="Remove"
      searchLabel="Search"
      selectingLabel="Selecting"
      sendLabel="Send"
      sendPendingLabel={overrides.sendPendingLabel ?? 'Sending'}
      sendPendingNotice={overrides.sendPendingNotice}
      sendPending={overrides.sendPending}
      sendTitle="Send"
      showAttachment={false}
      textareaRef={createRef<HTMLTextAreaElement>()}
    />,
  );
}

describe('ChatComposer send phases (2.0.32)', () => {
  it('names the wait on the button and explains it under the composer', () => {
    const html = render({ sendPending: true, sendPendingLabel: 'Waiting for approval', sendPendingNotice: 'Waiting for you to approve the publish in Qortium Home.' });
    expect(html).toContain('>Waiting for approval</button>');
    expect(html).toContain('composer__send-notice');
    expect(html).toContain('Waiting for you to approve the publish in Qortium Home.');
  });

  it('shows no notice when idle or when the phase has nothing to say', () => {
    expect(render({ sendPending: false, sendPendingNotice: 'ignored while idle' })).not.toContain('composer__send-notice');
    expect(render({ sendPending: true, sendPendingNotice: null })).not.toContain('composer__send-notice');
    expect(render({ sendPending: true })).toContain('>Sending</button>');
  });
});
