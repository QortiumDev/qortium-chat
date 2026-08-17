import {
  lazy,
  Suspense,
  type ClipboardEventHandler,
  type RefObject,
  type SubmitEvent,
} from 'react';
import type { EmojiClickData, EmojiStyle, Theme } from 'emoji-picker-react';

import { formatAttachmentSize, type PreparedAttachment } from './attachments';
import { CloseIcon } from './icons';

const EmojiPicker = lazy(() => import('emoji-picker-react'));

export type ComposerAttachment =
  | { filename: string; phase: 'processing' }
  | ({ phase: 'ready' } & PreparedAttachment);

export type ComposerContext = {
  label: string;
  snippet: string;
};

export function ChatComposer({
  attachLabel,
  attachTitle,
  attachment,
  attachmentError,
  attachmentInputRef,
  canAttach,
  canCompose,
  canSubmit,
  cancelLabel,
  context,
  draft,
  emojiLabel,
  emojiOpen,
  loadingLabel,
  messageLabel,
  messagePlaceholder,
  onAttachmentSelected,
  onCancelContext,
  onClearAttachment,
  onDraftChange,
  onEmojiSelected,
  onPaste,
  onSubmit,
  onToggleEmoji,
  processingLabel,
  removeAttachmentLabel,
  searchLabel,
  sendLabel,
  sendPending,
  sendPendingLabel,
  sendTitle,
  showAttachment,
  textareaRef,
}: {
  attachLabel: string;
  attachTitle: string;
  attachment: ComposerAttachment | null;
  attachmentError: string;
  attachmentInputRef: RefObject<HTMLInputElement | null>;
  canAttach: boolean;
  canCompose: boolean;
  canSubmit: boolean;
  cancelLabel: string;
  context: ComposerContext | null;
  draft: string;
  emojiLabel: string;
  emojiOpen: boolean;
  loadingLabel: string;
  messageLabel: string;
  messagePlaceholder: string;
  onAttachmentSelected: (file: File) => void;
  onCancelContext: () => void;
  onClearAttachment: () => void;
  onDraftChange: (value: string) => void;
  onEmojiSelected: (emoji: string) => void;
  onPaste: ClipboardEventHandler<HTMLTextAreaElement>;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
  onToggleEmoji: () => void;
  processingLabel: string;
  removeAttachmentLabel: string;
  searchLabel: string;
  sendLabel: string;
  sendPending: boolean;
  sendPendingLabel: string;
  sendTitle: string;
  showAttachment: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  return (
    <form className="composer" onSubmit={onSubmit}>
      {emojiOpen ? (
        <div className="composer__emoji-panel">
          <Suspense fallback={<p className="muted">{loadingLabel}</p>}>
            <EmojiPicker
              autoFocusSearch={false}
              emojiStyle={'native' as EmojiStyle}
              height="min(320px, 50dvh)"
              lazyLoadEmojis
              onEmojiClick={(emoji: EmojiClickData) => onEmojiSelected(emoji.emoji)}
              previewConfig={{ showPreview: false }}
              searchPlaceHolder={searchLabel}
              theme={'auto' as Theme}
              width="100%"
            />
          </Suspense>
        </div>
      ) : null}
      {attachment ? (
        <div className="composer__attachment">
          <span aria-hidden="true">📎</span>
          <span className="composer__attachment-name">{attachment.filename}</span>
          <span className="composer__attachment-size">
            {attachment.phase === 'processing' ? processingLabel : formatAttachmentSize(attachment.size)}
          </span>
          <button
            aria-label={removeAttachmentLabel}
            className="icon-button composer__attachment-remove"
            onClick={onClearAttachment}
            type="button"
          >
            <CloseIcon />
          </button>
        </div>
      ) : null}
      {attachmentError ? <p className="error composer__attachment-error">{attachmentError}</p> : null}
      {context ? (
        <div className="composer__context">
          <div className="composer__context-text">
            <strong>{context.label}</strong>
            <span>{context.snippet}</span>
          </div>
          <button className="button button--secondary" onClick={onCancelContext} type="button">
            {cancelLabel}
          </button>
        </div>
      ) : null}
      <textarea
        aria-label={messageLabel}
        disabled={!canCompose}
        maxLength={4000}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
        onPaste={onPaste}
        placeholder={messagePlaceholder}
        ref={textareaRef}
        rows={1}
        value={draft}
      />
      {showAttachment ? (
        <input
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onAttachmentSelected(file);
            event.target.value = '';
          }}
          ref={attachmentInputRef}
          type="file"
        />
      ) : null}
      <div className="composer__toolbar">
        {showAttachment ? (
          <button
            aria-label={attachLabel}
            className="icon-button composer__attach"
            disabled={!canAttach || sendPending || attachment?.phase === 'processing'}
            onClick={() => attachmentInputRef.current?.click()}
            title={attachTitle}
            type="button"
          >
            <span aria-hidden="true">📎</span>
          </button>
        ) : null}
        <button
          aria-expanded={emojiOpen}
          aria-label={emojiLabel}
          className="icon-button composer__emoji-toggle"
          disabled={!canCompose}
          onClick={onToggleEmoji}
          title={emojiLabel}
          type="button"
        >
          <span aria-hidden="true">🙂</span>
        </button>
        <button className="button composer__send" disabled={!canSubmit} title={sendTitle} type="submit">
          {sendPending ? sendPendingLabel : sendLabel}
        </button>
      </div>
    </form>
  );
}
