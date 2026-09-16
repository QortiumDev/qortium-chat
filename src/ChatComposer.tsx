import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type ClipboardEventHandler,
  type RefObject,
  type SubmitEvent,
} from 'react';
import type { EmojiClickData, EmojiStyle, Theme } from 'emoji-picker-react';

import { formatAttachmentSize, type StagedAttachment } from './attachments';
import {
  COMPOSER_MARK_TOKENS,
  completeMention,
  filterMentionCandidates,
  findMentionQuery,
  wrapSelection,
  type ComposerMark,
  type MentionCandidate,
} from './composerFormatting';
import { CloseIcon } from './icons';

// Order and glyphs of the formatting buttons (G1); titles come from props.
const COMPOSER_MARKS: ReadonlyArray<{ glyph: string; mark: ComposerMark }> = [
  { glyph: 'B', mark: 'bold' },
  { glyph: 'I', mark: 'italic' },
  { glyph: 'S', mark: 'strike' },
  { glyph: '</>', mark: 'code' },
];

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
  inlineImage = null,
  inlineImageLabels = null,
  onAttachInlineImageInstead,
  onClearInlineImage,
  attachmentError,
  attachmentInputRef,
  canAttach,
  canLinkResource,
  canCompose,
  canSubmit,
  cancelLabel,
  context,
  draft,
  emojiLabel,
  emojiOpen,
  formatLabels,
  mentionCandidates,
  mentionSuggestionsLabel,
  loadingLabel,
  messageLabel,
  messagePlaceholder,
  onAttachClick,
  onAttachmentSelected,
  onLinkResourceClick,
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
  linkResourceLabel,
  processingLabel,
  removeAttachmentLabel,
  searchLabel,
  sendLabel,
  sendPending,
  sendPendingLabel,
  sendPendingNotice = null,
  sendTitle,
  showAttachment,
  textareaRef,
}: {
  attachLabel: string;
  attachTitle: string;
  attachment: ComposerAttachment | null;
  /** 2.0.26 (D-G): a tiny image about to travel inside the message itself. */
  inlineImage?: { bytes: number; height: number; src: string; width: number } | null;
  inlineImageLabels?: { attachInstead: string; remove: string; size: string } | null;
  onAttachInlineImageInstead?: (() => void) | null;
  onClearInlineImage?: (() => void) | null;
  attachmentError: string;
  /** Hidden <input type="file"> the bytes path opens; App clicks it from onAttachClick. */
  attachmentInputRef: RefObject<HTMLInputElement | null>;
  canAttach: boolean;
  /** Insert a link to an already-published QDN resource (A3) — no publish. */
  canLinkResource: boolean;
  canCompose: boolean;
  canSubmit: boolean;
  cancelLabel: string;
  context: ComposerContext | null;
  draft: string;
  emojiLabel: string;
  emojiOpen: boolean;
  /** Titles for the formatting buttons, keyed by mark (2.0.19, G1). */
  formatLabels: Readonly<Record<ComposerMark, string>>;
  /** Members (or the DM peer) offered by the `@` autocomplete (G1b). */
  mentionCandidates: readonly MentionCandidate[];
  mentionSuggestionsLabel: string;
  loadingLabel: string;
  messageLabel: string;
  messagePlaceholder: string;
  onAttachClick: () => void;
  /** A local File chosen through the hidden input (bytes path only). */
  onAttachmentSelected: (file: File) => void;
  onLinkResourceClick: () => void;
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
  linkResourceLabel: string;
  processingLabel: string;
  removeAttachmentLabel: string;
  searchLabel: string;
  sendLabel: string;
  sendPending: boolean;
  sendPendingLabel: string;
  /** Shown under the composer while a send waits on Home (staging, approval). */
  sendPendingNotice?: string | null;
  sendTitle: string;
  showAttachment: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  // `@` autocomplete: the query is re-derived from the draft + caret on every
  // change; the popover shows while a query is open and something matches.
  const [mentionCaret, setMentionCaret] = useState<number | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionQuery = mentionCaret === null ? null : findMentionQuery(draft, mentionCaret);
  const mentionMatches = useMemo(
    () => (mentionQuery ? filterMentionCandidates(mentionCandidates, mentionQuery.query) : []),
    [mentionCandidates, mentionQuery?.query],
  );
  const mentionOpen = mentionMatches.length > 0;

  useEffect(() => {
    setMentionIndex(0);
  }, [mentionQuery?.query, mentionQuery?.start]);

  function applyEdit(edit: { end: number; start: number; value: string }) {
    onDraftChange(edit.value);
    requestAnimationFrame(() => {
      const element = textareaRef.current;

      if (element) {
        element.focus();
        element.setSelectionRange(edit.start, edit.end);
      }
    });
  }

  function applyMark(mark: ComposerMark) {
    const element = textareaRef.current;
    const start = element?.selectionStart ?? draft.length;
    const end = element?.selectionEnd ?? draft.length;

    applyEdit(wrapSelection(draft, start, end, mark));
  }

  function chooseMention(candidate: MentionCandidate) {
    if (mentionCaret === null) return;
    const edit = completeMention(draft, mentionCaret, candidate);

    setMentionCaret(null);
    if (edit) applyEdit(edit);
  }

  function syncMentionCaret(element: HTMLTextAreaElement) {
    setMentionCaret(element.selectionStart === element.selectionEnd ? element.selectionStart : null);
  }

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
      {inlineImage ? (
        <div className="composer__attachment composer__inline-image">
          <img alt="" className="composer__inline-image-preview" height={inlineImage.height} src={inlineImage.src} width={inlineImage.width} />
          <span className="composer__attachment-name">{inlineImageLabels?.size ?? `${inlineImage.bytes} B`}</span>
          {onAttachInlineImageInstead ? (
            <button className="button button--secondary composer__inline-image-attach" onClick={onAttachInlineImageInstead} type="button">
              {inlineImageLabels?.attachInstead ?? 'Attach instead'}
            </button>
          ) : null}
          <button
            aria-label={inlineImageLabels?.remove ?? removeAttachmentLabel}
            className="icon-button composer__attachment-remove"
            onClick={onClearInlineImage ?? undefined}
            type="button"
          >
            <CloseIcon />
          </button>
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
      {sendPending && sendPendingNotice ? (
        <p aria-live="polite" className="muted composer__send-notice" role="status">
          {sendPendingNotice}
        </p>
      ) : null}
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
      {mentionOpen ? (
        <ul aria-label={mentionSuggestionsLabel} className="composer__mentions" role="listbox">
          {mentionMatches.map((candidate, index) => (
            <li
              aria-selected={index === mentionIndex}
              className={index === mentionIndex ? 'composer__mention composer__mention--active' : 'composer__mention'}
              key={`${candidate.name}:${candidate.address ?? ''}`}
              onMouseDown={(event) => {
                // mousedown, so the textarea keeps focus and the caret survives.
                event.preventDefault();
                chooseMention(candidate);
              }}
              role="option"
            >
              <span className="composer__mention-name">@{candidate.name}</span>
              {candidate.address ? <span className="composer__mention-address">{candidate.address}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <textarea
        aria-activedescendant={undefined}
        aria-autocomplete={mentionCandidates.length > 0 ? 'list' : undefined}
        aria-expanded={mentionCandidates.length > 0 ? mentionOpen : undefined}
        aria-label={messageLabel}
        disabled={!canCompose}
        maxLength={4000}
        onBlur={() => setMentionCaret(null)}
        onChange={(event) => {
          onDraftChange(event.target.value);
          syncMentionCaret(event.target);
        }}
        onClick={(event) => syncMentionCaret(event.currentTarget)}
        onKeyDown={(event) => {
          if (mentionOpen) {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setMentionIndex((current) => (current + (event.key === 'ArrowDown' ? 1 : mentionMatches.length - 1)) % mentionMatches.length);
              return;
            }
            if (event.key === 'Enter' || event.key === 'Tab') {
              event.preventDefault();
              chooseMention(mentionMatches[mentionIndex] ?? mentionMatches[0]!);
              return;
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              setMentionCaret(null);
              return;
            }
          }
          if ((event.ctrlKey || event.metaKey) && !event.altKey) {
            const mark = event.key === 'b' ? 'bold' : event.key === 'i' ? 'italic' : event.key === 'e' ? 'code' : null;

            if (mark) {
              event.preventDefault();
              applyMark(mark);
              return;
            }
          }
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
        onKeyUp={(event) => {
          if (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End') syncMentionCaret(event.currentTarget);
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
        {showAttachment ? (
          <button
            aria-label={linkResourceLabel}
            className="icon-button composer__link-resource"
            disabled={!canLinkResource || sendPending}
            onClick={onLinkResourceClick}
            title={linkResourceLabel}
            type="button"
          >
            <span aria-hidden="true">🔗</span>
          </button>
        ) : null}
        {COMPOSER_MARKS.map(({ glyph, mark }) => (
          <button
            aria-label={formatLabels[mark]}
            className={`icon-button composer__format composer__format--${mark}`}
            disabled={!canCompose}
            key={mark}
            onMouseDown={(event) => {
              // Keep the textarea selection: a click must not move focus first.
              event.preventDefault();
              applyMark(mark);
            }}
            title={`${formatLabels[mark]} (${COMPOSER_MARK_TOKENS[mark]})`}
            type="button"
          >
            <span aria-hidden="true">{glyph}</span>
          </button>
        ))}
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
