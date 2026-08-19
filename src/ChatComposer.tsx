import {
  lazy,
  Suspense,
  type ClipboardEventHandler,
  type RefObject,
  type SubmitEvent,
} from 'react';
import type { EmojiClickData, EmojiStyle, Theme } from 'emoji-picker-react';

import { formatAttachmentSize, type StagedSourceAttachment } from './attachments';
import { CloseIcon } from './icons';

const EmojiPicker = lazy(() => import('emoji-picker-react'));

// 'selecting' covers the round trip to Home's native file picker
// (SELECT_QDN_PUBLISH_SOURCE) — there is no local file to process any more,
// only a wait for the user's choice and Home's response.
export type ComposerAttachment = { phase: 'selecting' } | ({ phase: 'ready' } & StagedSourceAttachment);

export type ComposerContext = {
  label: string;
  snippet: string;
};

export function ChatComposer({
  attachLabel,
  attachTitle,
  attachment,
  attachmentError,
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
  onAttachClick,
  onCancelContext,
  onClearAttachment,
  onDraftChange,
  onEmojiSelected,
  onPaste,
  onSubmit,
  onToggleEmoji,
  selectingLabel,
  remainingBytesLabel,
  remainingBytesOverLimit,
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
  onAttachClick: () => void;
  onCancelContext: () => void;
  onClearAttachment: () => void;
  onDraftChange: (value: string) => void;
  onEmojiSelected: (emoji: string) => void;
  onPaste: ClipboardEventHandler<HTMLTextAreaElement>;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
  onToggleEmoji: () => void;
  /** Shown in the composer chip while awaiting Home's native picker. */
  selectingLabel: string;
  /** A closed group's live byte-remaining counter (e.g. "1801 of 2225
   * bytes"), or null for any other chat — see App.tsx's
   * selectedGroupPrivatePlaintextMaxBytes. Advisory only: the actual cap is
   * enforced by coreApi's send wrappers and by Home/Core server-side. */
  remainingBytesLabel?: string | null;
  /** True once the drafted text's UTF-8 byte length exceeds the cap the
   * counter above reports — styles the counter as an error and (via
   * App.tsx's canSubmitMessage) disables submit. */
  remainingBytesOverLimit?: boolean;
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
          {attachment.phase === 'selecting' ? (
            <span className="composer__attachment-name">{selectingLabel}</span>
          ) : (
            <>
              <span className="composer__attachment-name">{attachment.fileName}</span>
              <span className="composer__attachment-size">{formatAttachmentSize(attachment.size)}</span>
            </>
          )}
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
      {remainingBytesLabel ? (
        <p aria-live="polite" className={remainingBytesOverLimit ? 'composer__byte-counter composer__byte-counter--over' : 'composer__byte-counter'}>
          {remainingBytesLabel}
        </p>
      ) : null}
      <div className="composer__toolbar">
        {showAttachment ? (
          <button
            aria-label={attachLabel}
            className="icon-button composer__attach"
            disabled={!canAttach || sendPending || attachment?.phase === 'selecting'}
            onClick={onAttachClick}
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
