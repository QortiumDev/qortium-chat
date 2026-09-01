import {
  lazy,
  Suspense,
  type ClipboardEventHandler,
  type RefObject,
  type SubmitEvent,
} from 'react';
import type { EmojiClickData, EmojiStyle, Theme } from 'emoji-picker-react';

import { formatAttachmentSize, type StagedAttachment } from './attachments';
import { CloseIcon } from './icons';

const EmojiPicker = lazy(() => import('emoji-picker-react'));

// 'selecting' covers the round trip to Home's native file picker
// (SELECT_QDN_PUBLISH_SOURCE); 'processing' covers reading/compressing a
// local File on the bytes path (attachments.ts prepareLocalAttachment).
// 'ready' holds either staged shape — see attachmentCapabilities.ts.
export type ComposerAttachment =
  | { phase: 'selecting' }
  | { fileName: string; phase: 'processing' }
  | ({ phase: 'ready' } & StagedAttachment);

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
  onAttachClick,
  onAttachmentSelected,
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
  /** Hidden <input type="file"> the bytes path opens; App clicks it from onAttachClick. */
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
  onAttachClick: () => void;
  /** A local File chosen through the hidden input (bytes path only). */
  onAttachmentSelected: (file: File) => void;
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
  /** Shown in the composer chip while a local file is being read/compressed. */
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
          {attachment.phase === 'selecting' ? (
            <span className="composer__attachment-name">{selectingLabel}</span>
          ) : attachment.phase === 'processing' ? (
            <>
              <span className="composer__attachment-name">{attachment.fileName}</span>
              <span className="composer__attachment-size">{processingLabel}</span>
            </>
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
      {showAttachment ? (
        <input
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];

            if (file) {
              onAttachmentSelected(file);
            }

            // Reset so re-selecting the same file fires change again.
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
            disabled={
              !canAttach || sendPending || attachment?.phase === 'selecting' || attachment?.phase === 'processing'
            }
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
