import {
  Fragment,
  lazy,
  memo,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { EmojiClickData, EmojiStyle, Theme } from 'emoji-picker-react';
import {
  DEFAULT_REACTION_OPTIONS,
  decodeChatMessage,
  formatTimeAgo,
  formatTimestamp,
  getMessageSnippet,
} from './chatText';
import {
  buildMessageThreads,
  getMessageKey,
  isThreadContinuation,
  type MessageThread,
} from './messageThreads';
import {
  buildMessageReactionIndex,
  getReactionPendingKey,
  type MessageReactionSummary,
} from './messageReactions';
import {
  fetchQdnImagePreviews,
  getDocumentQdnResources,
  getImageQdnResources,
  getMediaQdnResources,
  openQdnDocumentViewer,
  openQdnMediaPlayer,
  renderMessageTextWithAppLinks,
  saveQdnResource,
  type QdnDocumentResource,
  type QdnImagePreview,
  type QdnImageResource,
  type QdnMediaResource,
} from './messageLinks';
import {
  getMessageSenderLabel,
  MessageIdentity,
  type AccountInfoTarget,
  type AvatarProfilesByAddress,
} from './accountDisplay';
import { type AvatarLightboxImage } from './AvatarLightbox';
import { DownIcon, UpIcon } from './icons';
import { type TranslateFunction } from './i18n';
import { type ChatMessage, type ChatScrollPosition, type TrackedTransaction } from './types';

// Loaded on demand: the full picker only mounts after React → '+', and its
// bundle (~300 KB, a third of the app's JS) must not weigh down every app
// start. The type-only import above keeps the package out of the main chunk,
// so its enum values are passed as their literal strings at the use site.
const EmojiPicker = lazy(() => import('emoji-picker-react'));

function getReactionDetailsDomId(messageSignature: string, reaction: string) {
  const signaturePart = messageSignature.replace(/[^A-Za-z0-9_-]/g, '-');
  const reactionPart = Array.from(reaction)
    .map((character) => character.codePointAt(0)?.toString(16) ?? '0')
    .join('-') || 'reaction';

  return `reaction-details-${signaturePart}-${reactionPart}`;
}

type ImagePreviewState =
  | {
      phase: 'loading';
    }
  | {
      phase: 'ready';
      previews: QdnImagePreview[];
    }
  | {
      message: string;
      phase: 'error';
    };

function MessageImagePreview({
  onOpenImage,
  resource,
  t,
}: {
  onOpenImage: (image: AvatarLightboxImage) => void;
  resource: QdnImageResource;
  t: TranslateFunction;
}) {
  const [state, setState] = useState<ImagePreviewState>({ phase: 'loading' });

  useEffect(() => {
    let isDisposed = false;

    setState({ phase: 'loading' });

    void fetchQdnImagePreviews(resource)
      .then((previews) => {
        if (!isDisposed) {
          setState({ phase: 'ready', previews });
        }
      })
      .catch((error) => {
        if (!isDisposed) {
          setState({
            phase: 'error',
            message: error instanceof Error ? error.message : t('status.loadingError.imagePreview'),
          });
        }
      });

    return () => {
      isDisposed = true;
    };
  }, [resource.identifier, resource.name, resource.path, resource.qdnUrl, resource.service, t]);

  if (state.phase === 'loading') {
    return (
      <div className="message__image-preview message__image-preview--loading">
        {t('status.loading.imagePreview')}
      </div>
    );
  }

  if (state.phase === 'error') {
    return (
      <div className="message__image-preview message__image-preview--error">
        {state.message}
      </div>
    );
  }

  return (
    <>
      {state.previews.map((preview) => (
        <figure className="message__image-preview" key={preview.qdnUrl}>
          <button
            aria-label={`${t('button.viewImagePreview')}: ${preview.alt}`}
            className="message__image-preview-button"
            onClick={() => onOpenImage({ alt: preview.alt, name: preview.alt, src: preview.src })}
            title={preview.qdnUrl}
            type="button"
          >
            <img alt={preview.alt} src={preview.src} />
          </button>
          <figcaption>{preview.alt}</figcaption>
        </figure>
      ))}
    </>
  );
}

function MessageImagePreviews({
  onOpenImage,
  resources,
  t,
}: {
  onOpenImage: (image: AvatarLightboxImage) => void;
  resources: QdnImageResource[];
  t: TranslateFunction;
}) {
  return (
    <div className="message__image-previews">
      {resources.map((resource, index) => (
        <MessageImagePreview key={`${resource.qdnUrl}-${index}`} onOpenImage={onOpenImage} resource={resource} t={t} />
      ))}
    </div>
  );
}

function MessageReactionPicker({
  onReact,
  original,
  pendingReactionKey,
  reactions,
  t,
}: {
  onReact: (message: ChatMessage, reaction: string, contentState: boolean) => void;
  original: ChatMessage;
  pendingReactionKey: string;
  reactions: MessageReactionSummary[];
  t: TranslateFunction;
}) {
  const [fullPickerOpen, setFullPickerOpen] = useState(false);

  if (!original.signature) {
    return null;
  }

  const selectReaction = (reaction: string) => {
    const existingReaction = reactions.find((summary) => summary.content === reaction);

    onReact(original, reaction, !existingReaction?.reactedBySelf);
  };

  return (
    <div className="message__reaction-picker" aria-label={t('label.reactions')}>
      <div className="message__reaction-quick-row" role="toolbar" aria-label={t('label.reactions')}>
        {DEFAULT_REACTION_OPTIONS.map((reaction) => {
          const existingReaction = reactions.find((summary) => summary.content === reaction);
          const contentState = !existingReaction?.reactedBySelf;
          const pendingKey = getReactionPendingKey(original.signature ?? '', reaction);

          return (
            <button
              aria-label={contentState ? t('action.addReaction') : t('action.removeReaction')}
              aria-pressed={existingReaction?.reactedBySelf ?? false}
              disabled={pendingReactionKey === pendingKey}
              key={reaction}
              onClick={() => selectReaction(reaction)}
              title={contentState ? t('action.addReaction') : t('action.removeReaction')}
              type="button"
            >
              {reaction}
            </button>
          );
        })}
        <button
          aria-expanded={fullPickerOpen}
          aria-label={t('label.reactions')}
          className="message__reaction-more"
          onClick={() => setFullPickerOpen((current) => !current)}
          title={t('label.reactions')}
          type="button"
        >
          {fullPickerOpen ? '×' : '+'}
        </button>
      </div>
      {fullPickerOpen ? (
        <div className="message__emoji-picker-panel">
          <Suspense fallback={<p className="muted">{t('label.loading')}</p>}>
            <EmojiPicker
              allowExpandReactions
              autoFocusSearch={false}
              emojiStyle={'native' as EmojiStyle}
              height="min(360px, 60dvh)"
              lazyLoadEmojis
              onEmojiClick={(emoji: EmojiClickData) => selectReaction(emoji.emoji)}
              onReactionClick={(emoji: EmojiClickData) => selectReaction(emoji.emoji)}
              previewConfig={{ showPreview: false }}
              reactions={[...DEFAULT_REACTION_OPTIONS]}
              searchPlaceHolder={t('label.search')}
              theme={'auto' as Theme}
              width="100%"
            />
          </Suspense>
        </div>
      ) : null}
    </div>
  );
}

function MessageReactionDetails({
  avatarProfiles,
  canReact,
  now,
  onClose,
  onReact,
  original,
  pendingReactionKey,
  reaction,
  t,
}: {
  avatarProfiles: AvatarProfilesByAddress;
  canReact: boolean;
  now: number;
  onClose: () => void;
  onReact: (message: ChatMessage, reaction: string, contentState: boolean) => void;
  original: ChatMessage;
  pendingReactionKey: string;
  reaction: MessageReactionSummary;
  t: TranslateFunction;
}) {
  const contentState = !reaction.reactedBySelf;
  const pendingKey = getReactionPendingKey(original.signature ?? '', reaction.content);
  const actionLabel = contentState ? t('action.addReaction') : t('action.removeReaction');

  return (
    <section
      aria-label={t('label.reactionDetails')}
      className="message__reaction-details"
      id={getReactionDetailsDomId(original.signature ?? '', reaction.content)}
    >
      <header className="message__reaction-details-header">
        <span>
          {reaction.content} {t('label.reactions')}
        </span>
        <button
          aria-label={t('button.close')}
          className="message__reaction-details-close"
          onClick={onClose}
          title={t('button.close')}
          type="button"
        >
          X
        </button>
      </header>
      <ol className="message__reaction-reactors">
        {reaction.reactors.map((reactor) => {
          const profile = avatarProfiles.get(reactor.sender);
          const label = getMessageSenderLabel({ sender: reactor.sender, senderName: null }, profile);

          return (
            <li className="message__reaction-reactor" key={`${reactor.sender}-${reactor.timestamp}`}>
              <span className="message__reaction-reactor-name" title={reactor.sender}>
                {label}
              </span>
              <time
                className="message__reaction-reactor-time"
                dateTime={new Date(reactor.timestamp).toISOString()}
                title={formatTimestamp(reactor.timestamp, t.locale)}
              >
                {formatTimeAgo(reactor.timestamp, now, t.locale)}
              </time>
            </li>
          );
        })}
      </ol>
      <button
        className="button button--secondary message__reaction-details-action"
        disabled={!canReact || pendingReactionKey === pendingKey}
        onClick={() => {
          onClose();
          onReact(original, reaction.content, contentState);
        }}
        type="button"
      >
        {actionLabel}
      </button>
    </section>
  );
}

// Floating, viewport-anchored container for the reaction picker and the reaction
// details. It is rendered outside the message bubble so opening it never expands
// the message, and it grows upward (bottom pinned just above the trigger) rather
// than pushing content down. A transparent backdrop closes it on an outside tap.
function ReactionPopover({
  anchorRect,
  children,
  label,
  onClose,
  width,
}: {
  anchorRect: DOMRect;
  children: ReactNode;
  label: string;
  onClose: () => void;
  width: number;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  // Bumped by the keep-open resize path so the position math below re-reads
  // the (soft-keyboard-shrunken) viewport instead of going stale.
  const [, forceReposition] = useState(0);

  // Focus the popover on open and restore focus to the trigger on close. Mount
  // only, so a parent re-render (the 30s clock, a new message) cannot re-steal
  // focus out of the emoji search field while the user is typing in it.
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    cardRef.current?.focus();

    return () => {
      if (trigger && document.contains(trigger)) {
        trigger.focus({ preventScroll: true });
      }
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    function handleResize() {
      // A mobile soft keyboard fires resize; keep the popover open while its
      // search field is focused, else the stale anchor warrants a dismiss.
      if (cardRef.current?.contains(document.activeElement)) {
        // Recompute the position against the new viewport so the panel —
        // including the field being typed into — is not left hanging above
        // the visible area by a full keyboard height.
        forceReposition((tick) => tick + 1);
        return;
      }

      onClose();
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
    };
  }, [onClose]);

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const clampedWidth = Math.min(width, viewportWidth - 16);
  const left = Math.max(8, Math.min(anchorRect.left, viewportWidth - clampedWidth - 8));
  const spaceAbove = anchorRect.top - 16;
  const spaceBelow = viewportHeight - anchorRect.bottom - 16;
  // Open upward (the requested behaviour) whenever there is room; only flip down
  // for a near-top trigger with little room above and more below, so the panel is
  // never clipped off the top of the viewport. maxHeight caps it to the space on
  // the chosen side and the content scrolls if it does not fit.
  const openUp = spaceAbove >= 240 || spaceAbove >= spaceBelow;
  const position = openUp
    ? { bottom: viewportHeight - anchorRect.top + 8, maxHeight: Math.max(40, spaceAbove) }
    : { top: anchorRect.bottom + 8, maxHeight: Math.max(40, spaceBelow) };

  return (
    <>
      <button
        aria-hidden="true"
        className="reaction-popover__backdrop"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <div
        aria-label={label}
        className="reaction-popover"
        ref={cardRef}
        role="dialog"
        style={{ left, width: clampedWidth, ...position }}
        tabIndex={-1}
      >
        {children}
      </div>
    </>
  );
}

function MessageReactionChips({
  onToggleReactionDetails,
  openReactionDetailsKey,
  original,
  pendingReactionKey,
  reactions,
  t,
}: {
  onToggleReactionDetails: (detailsKey: string, anchor: HTMLElement) => void;
  openReactionDetailsKey: string;
  original: ChatMessage;
  pendingReactionKey: string;
  reactions: MessageReactionSummary[];
  t: TranslateFunction;
}) {
  if (!original.signature || reactions.length === 0) {
    return null;
  }

  return (
    <div className="message__reaction-block">
      <div className="message__reactions" aria-label={t('label.reactions')}>
        {reactions.map((reaction) => {
          const pendingKey = getReactionPendingKey(original.signature ?? '', reaction.content);
          const isOpen = openReactionDetailsKey === pendingKey;
          const label = t('action.viewReactionDetails', { reaction: reaction.content });

          return (
            <button
              aria-expanded={isOpen}
              aria-label={label}
              aria-haspopup="dialog"
              className={`message__reaction-chip${reaction.reactedBySelf ? ' message__reaction-chip--active' : ''}`}
              disabled={pendingReactionKey === pendingKey}
              key={reaction.content}
              onClick={(event) => onToggleReactionDetails(pendingKey, event.currentTarget)}
              title={label}
              type="button"
            >
              <span>{reaction.content}</span>
              <span>{reaction.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export const MessageList = memo(function MessageList({
  avatarProfiles,
  canCompose,
  canOpenDocumentViewer,
  canOpenMediaPlayer,
  canSaveQdnResource,
  initialScrollPosition,
  messages,
  olderMessagesError,
  olderMessagesLoading,
  olderMessagesReachedStart,
  onDelete,
  onEdit,
  onLoadOlder,
  onOpenAccount,
  onOpenAvatar,
  onOpenImage,
  onReact,
  onReply,
  onScrollPositionChange,
  pendingReactionKey,
  scrollChatKey,
  selfAddress,
  selfName,
  sentMessageNonce,
  systemMessages,
  t,
  unreadDividerCeiling,
  unreadDividerTimestamp,
  now,
}: {
  avatarProfiles: AvatarProfilesByAddress;
  canCompose: boolean;
  canOpenDocumentViewer: boolean;
  canOpenMediaPlayer: boolean;
  canSaveQdnResource: boolean;
  initialScrollPosition: ChatScrollPosition | undefined;
  messages: ChatMessage[];
  olderMessagesError: string;
  olderMessagesLoading: boolean;
  olderMessagesReachedStart: boolean;
  onDelete: (thread: MessageThread) => void;
  onEdit: (thread: MessageThread) => void;
  onLoadOlder: () => void;
  onOpenAccount: (target: AccountInfoTarget) => void;
  onOpenAvatar: (image: AvatarLightboxImage) => void;
  onOpenImage: (image: AvatarLightboxImage) => void;
  onReact: (message: ChatMessage, reaction: string, contentState: boolean) => void;
  onReply: (message: ChatMessage) => void;
  onScrollPositionChange: (chatKey: string, position: ChatScrollPosition) => void;
  pendingReactionKey: string;
  scrollChatKey: string;
  selfAddress: string | null;
  selfName: string | null;
  sentMessageNonce: number;
  systemMessages: TrackedTransaction[];
  t: TranslateFunction;
  unreadDividerCeiling: number | null;
  unreadDividerTimestamp: number | null;
  now: number;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const stickToBottomRef = useRef(true);
  // Highlights rows that @mention the account's registered name. Anchored so
  // "@alice" does not also match a mention of "@alicezz"; senders mention via
  // the account dialog's Mention button, which inserts `@Name `.
  const mentionPattern = useMemo(() => {
    if (!selfName) {
      return null;
    }

    const escapedName = selfName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    return new RegExp(`@${escapedName}(?![\\w-])`, 'i');
  }, [selfName]);
  // Set when the user sends, so the message that lands a moment later scrolls into
  // view even if their scroll position was not at the bottom.
  const forceBottomRef = useRef(false);
  // Restores the reading position when returning to a chat: false until the saved
  // (or default-bottom) scroll position has been applied for the current chat.
  const didRestoreScrollRef = useRef(false);
  // Captured before older history is prepended so we can restore the viewport to
  // the same message instead of jumping when scrollHeight grows.
  const olderScrollAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  // Pending rAF id for the scroll settle loop, so a new pin cancels an in-flight
  // one and unmount can cancel it.
  const scrollSettleRafRef = useRef(0);
  // True while a settle loop is programmatically driving scrollTop, so the
  // onScroll handler does not persist those transient positions over the user's.
  const programmaticScrollRef = useRef(false);
  // True briefly around genuine user scroll input (wheel/touch/keys). Only such
  // input may CLEAR the stick-to-bottom intent — programmatic repositions (settle
  // loop, image-load re-pin, older-history anchor restore) must never flip intent
  // off just because they momentarily moved the viewport off the bottom.
  const userScrollRef = useRef(false);
  const userScrollClearRef = useRef(0);
  // While restoring a saved bookmark we page older history in until the target
  // message loads. restoringRef suppresses position-saving during that seek so
  // the in-progress scroll doesn't overwrite the bookmark we're chasing.
  const pendingBookmarkRef = useRef<
    { anchorKey: string; anchorOffset: number; anchorTimestamp: number; attempts: number } | null
  >(null);
  const restoringRef = useRef(false);
  // Last position applied or saved for the current chat. When the pane loses
  // layout (narrow-mode display:none swaps list/chat views) the browser drops
  // its scroll state entirely; on regaining layout this is re-applied.
  const lastPositionRef = useRef<ChatScrollPosition | null>(null);
  // True while the list pane has zero layout; a true→false transition (observed
  // by the ResizeObserver below) triggers the re-apply.
  const wasHiddenRef = useRef(false);
  const itemsRef = useRef(new Map<string, HTMLLIElement>());
  // The "new messages" divider element, so the jump-to-unread control can scroll
  // it into view and so its viewport position drives whether that control shows.
  const dividerRef = useRef<HTMLLIElement>(null);
  const highlightTimeoutRef = useRef(0);
  const expandedTimeTimeoutRef = useRef(0);
  const [openHistories, setOpenHistories] = useState<ReadonlySet<string>>(new Set());
  const [openImagePreviews, setOpenImagePreviews] = useState<ReadonlySet<string>>(new Set());
  const [openReactionPickerKey, setOpenReactionPickerKey] = useState('');
  const [openReactionDetailsKey, setOpenReactionDetailsKey] = useState('');
  // Viewport rect of the trigger (React button / reaction chip) that opened the
  // floating reaction popover, so it can be anchored above that element.
  const [reactionAnchorRect, setReactionAnchorRect] = useState<DOMRect | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  // Shown while the unread divider is scrolled above the viewport, offering a
  // jump up to where reading left off (the chat opens pinned to the bottom).
  const [unreadJumpVisible, setUnreadJumpVisible] = useState(false);
  const [highlightedKey, setHighlightedKey] = useState('');
  const [expandedTimeKey, setExpandedTimeKey] = useState('');
  const threads = useMemo(() => buildMessageThreads(messages), [messages]);
  // Index of the first thread newer than the user's read watermark; the "new
  // messages" divider is drawn just above it. Only shown when at least one read
  // message sits above the boundary, so it reads as a separator (not a top edge).
  const unreadDividerIndex = useMemo(() => {
    if (unreadDividerTimestamp === null || unreadDividerCeiling === null) {
      return -1;
    }

    // The divider marks the backlog that was unread when the chat was opened:
    // newer than the read watermark, but no newer than the open moment. Messages
    // sent or received while reading (including the user's own) sit past the
    // ceiling, so they never spawn or move the divider.
    const index = threads.findIndex(
      (thread) =>
        thread.original.timestamp > unreadDividerTimestamp && thread.original.timestamp <= unreadDividerCeiling,
    );

    if (index > 0) {
      return index;
    }

    // Every loaded message is newer than the watermark: anchor the marker at the
    // top while older (read) history can still page in, so it shows from open
    // instead of popping in mid-feed on scroll-up. If the start is already loaded
    // there is no read context to separate, so suppress it.
    return index === 0 && !olderMessagesReachedStart ? 0 : -1;
  }, [threads, unreadDividerTimestamp, unreadDividerCeiling, olderMessagesReachedStart]);
  // Count of messages in the unread-on-open backlog (the contiguous run from the
  // divider up to the open moment), shown on the jump-to-unread control.
  const unreadCount = useMemo(() => {
    if (unreadDividerIndex < 0 || unreadDividerCeiling === null) {
      return 0;
    }

    let count = 0;

    for (let index = unreadDividerIndex; index < threads.length; index += 1) {
      if (threads[index].original.timestamp <= unreadDividerCeiling) {
        count += 1;
      }
    }

    return count;
  }, [threads, unreadDividerIndex, unreadDividerCeiling]);
  const reactionsBySignature = useMemo(
    () => buildMessageReactionIndex(messages, selfAddress),
    [messages, selfAddress],
  );
  const renderedThreads = useMemo(
    () => threads.map((thread, index) => ({ key: getMessageKey(thread.original, index), thread })),
    [threads],
  );
  const threadTargetsBySignature = useMemo(() => {
    const bySignature = new Map<string, { key: string; thread: MessageThread }>();

    for (const { key, thread } of renderedThreads) {
      if (thread.original.signature) {
        bySignature.set(thread.original.signature, { key, thread });
      }

      for (const revision of thread.revisions) {
        if (revision.signature) {
          bySignature.set(revision.signature, { key, thread });
        }
      }
    }

    return bySignature;
  }, [renderedThreads]);
  const threadByKey = useMemo(() => {
    const byKey = new Map<string, MessageThread>();

    for (const { key, thread } of renderedThreads) {
      byKey.set(key, thread);
    }

    return byKey;
  }, [renderedThreads]);
  // Resolve which message/reaction the open popover belongs to. Looked up live
  // (not snapshotted) so reaction counts stay current while it is open.
  const reactionPopoverContent = useMemo(() => {
    const pickerThread = openReactionPickerKey ? threadByKey.get(openReactionPickerKey) : undefined;
    const pickerSignature = pickerThread?.original.signature ?? '';
    const pickerReactions = pickerSignature ? reactionsBySignature.get(pickerSignature) ?? [] : [];

    let detailsThread: MessageThread | undefined;
    let detailsReaction: MessageReactionSummary | undefined;

    if (openReactionDetailsKey) {
      for (const thread of threadByKey.values()) {
        const signature = thread.original.signature;

        if (!signature) {
          continue;
        }

        const match = (reactionsBySignature.get(signature) ?? []).find(
          (reaction) => getReactionPendingKey(signature, reaction.content) === openReactionDetailsKey,
        );

        if (match) {
          detailsThread = thread;
          detailsReaction = match;
          break;
        }
      }
    }

    return { detailsReaction, detailsThread, pickerReactions, pickerThread };
  }, [openReactionDetailsKey, openReactionPickerKey, reactionsBySignature, threadByKey]);
  // If a live update removes the message/reaction the open popover points at, the
  // lookup fails; close so the keys + anchor cannot linger or spontaneously reopen.
  useEffect(() => {
    if (
      (openReactionPickerKey && !reactionPopoverContent.pickerThread) ||
      (openReactionDetailsKey && !reactionPopoverContent.detailsReaction)
    ) {
      closeReactionPopover();
    }
  }, [openReactionDetailsKey, openReactionPickerKey, reactionPopoverContent]);
  const lastThread = threads[threads.length - 1] ?? null;
  const lastMessageKey = lastThread !== null ? getMessageKey(lastThread.latest, threads.length - 1) : '';
  const firstMessageKey = messages.length > 0 ? getMessageKey(messages[0], 0) : '';

  function captureScrollAnchor() {
    const list = listRef.current;

    if (list) {
      olderScrollAnchorRef.current = { scrollHeight: list.scrollHeight, scrollTop: list.scrollTop };
    }
  }

  function updateBottomState(list: HTMLOListElement) {
    // A hidden pane (display:none) measures 0/0/0, which reads as "at bottom"
    // and would corrupt the stick intent and hide the scroll-to-bottom button.
    if (list.clientHeight === 0) {
      return;
    }

    const isAtBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 48;

    // stickToBottomRef is the INTENT to stay pinned to the bottom, not merely
    // "currently at the bottom". Only genuine user scroll input may turn the
    // intent OFF (the user deliberately scrolled up). Programmatic repositions
    // — settle loop, image-load re-pin, older-history anchor restore, window
    // re-renders — must never clear it just because async growth momentarily
    // left the viewport short of the new bottom; otherwise the feed gets
    // stranded part-way and the scroll-to-bottom button reappears.
    if (userScrollRef.current) {
      stickToBottomRef.current = isAtBottom;
    } else if (isAtBottom) {
      stickToBottomRef.current = true;
    }

    const sticking = stickToBottomRef.current;
    setShowScrollToBottom(!isAtBottom && !sticking);

    const dividerEl = dividerRef.current;

    if (dividerEl && !isAtBottom && !sticking) {
      // Offer the jump only while the divider is scrolled above the visible area
      // AND the user is away from the bottom. Reaching the bottom means the newest
      // messages are in view — i.e. read — so the prompt is dismissed there too,
      // instead of lingering after the new messages have been seen.
      const listRect = list.getBoundingClientRect();
      const dividerRect = dividerEl.getBoundingClientRect();

      setUnreadJumpVisible(dividerRect.bottom < listRect.top + 8);
    } else {
      setUnreadJumpVisible(false);
    }
  }

  // Bring the unread divider just below the top edge so the last read message
  // above it gives context for where new messages begin.
  function scrollToUnread() {
    const dividerEl = dividerRef.current;
    const list = listRef.current;

    if (!dividerEl || !list) {
      return;
    }

    const listRect = list.getBoundingClientRect();
    const dividerRect = dividerEl.getBoundingClientRect();

    list.scrollTop += dividerRect.top - listRect.top - 12;
    updateBottomState(list);
  }

  // Re-apply a scroll target across frames until it stops moving. `applyStep`
  // re-pins the desired position each frame and returns false to abort (e.g. the
  // list/anchor went away). This absorbs late layout (async images, web-font
  // metrics, line-wrap reflow, a quiet-poll append) that would otherwise leave a
  // single pin short — that is why one click of the down arrow used to only go
  // part of the way. Stops once scrollTop holds for two frames, or after a ~1s
  // safety cap so a perpetually growing feed can never spin forever.
  function runScrollSettle(applyStep: (list: HTMLOListElement) => boolean) {
    const list = listRef.current;

    if (!list || !applyStep(list)) {
      return;
    }

    updateBottomState(list);

    if (typeof requestAnimationFrame !== 'function') {
      return;
    }

    if (scrollSettleRafRef.current && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(scrollSettleRafRef.current);
    }

    programmaticScrollRef.current = true;

    let lastTop = list.scrollTop;
    let stableFrames = 0;
    let attempts = 0;

    const settle = () => {
      const nextList = listRef.current;

      if (!nextList || !applyStep(nextList)) {
        programmaticScrollRef.current = false;
        scrollSettleRafRef.current = 0;
        return;
      }

      const top = nextList.scrollTop;

      if (top === lastTop) {
        stableFrames += 1;
      } else {
        stableFrames = 0;
        lastTop = top;
      }

      attempts += 1;

      if (stableFrames >= 2 || attempts >= 60) {
        updateBottomState(nextList);
        programmaticScrollRef.current = false;
        scrollSettleRafRef.current = 0;
        savePosition(nextList);
        return;
      }

      scrollSettleRafRef.current = requestAnimationFrame(settle);
    };

    scrollSettleRafRef.current = requestAnimationFrame(settle);
  }

  // Mark that the imminent scroll event(s) are user-driven, so updateBottomState
  // may update the stick intent from the resulting position. Kept set briefly to
  // cover inertial/momentum scrolling after the input gesture ends.
  function noteUserScroll() {
    userScrollRef.current = true;
    window.clearTimeout(userScrollClearRef.current);
    userScrollClearRef.current = window.setTimeout(() => {
      userScrollRef.current = false;
    }, 200);
  }

  // One-shot pin to the bottom (no settle loop). Used to maintain the bottom as
  // the feed height changes (image loads, message re-renders/merges) while the
  // stick-to-bottom intent is active.
  function pinToBottom() {
    const list = listRef.current;

    // Never write scrollTop while the pane has no layout: scrollHeight is 0
    // then, so the write would zero the position the browser may still restore.
    if (!list || list.clientHeight === 0) {
      return;
    }

    list.scrollTop = list.scrollHeight;
    updateBottomState(list);
  }

  // The down-arrow button: riding it to the bottom overrides an in-flight
  // bookmark seek — cancel the seek so its scrollToAnchor cannot later yank the
  // view back up, and lift the save suppression so the landing gets persisted.
  function handleScrollToBottomClick() {
    pendingBookmarkRef.current = null;
    restoringRef.current = false;
    scrollToBottom();
  }

  function scrollToBottom() {
    stickToBottomRef.current = true;

    const list = listRef.current;

    if (!list) {
      return;
    }

    list.scrollTop = list.scrollHeight;
    updateBottomState(list);

    if (typeof requestAnimationFrame !== 'function') {
      return;
    }

    if (scrollSettleRafRef.current && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(scrollSettleRafRef.current);
    }

    // Re-pin to the bottom EVERY frame until we've genuinely held the bottom for
    // ~0.8s, or the user scrolls away, or a ~6s cap. Re-pinning every frame (not
    // stopping on transient scrollTop stability) is what survives the feed's
    // multi-second height churn — async image previews, quiet-poll merges, and
    // older-history loads — that previously stranded a single pin part-way.
    programmaticScrollRef.current = true;
    let atBottomFrames = 0;
    let attempts = 0;

    const tick = () => {
      const nextList = listRef.current;

      // Stop if the list is gone or the user scrolled away (intent cleared).
      if (!nextList || !stickToBottomRef.current) {
        programmaticScrollRef.current = false;
        scrollSettleRafRef.current = 0;
        if (nextList) updateBottomState(nextList);
        return;
      }

      nextList.scrollTop = nextList.scrollHeight;
      const distance = nextList.scrollHeight - nextList.scrollTop - nextList.clientHeight;
      atBottomFrames = distance < 4 ? atBottomFrames + 1 : 0;
      attempts += 1;

      if (atBottomFrames >= 48 || attempts >= 360) {
        updateBottomState(nextList);
        programmaticScrollRef.current = false;
        scrollSettleRafRef.current = 0;
        savePosition(nextList);
        return;
      }

      scrollSettleRafRef.current = requestAnimationFrame(tick);
    };

    scrollSettleRafRef.current = requestAnimationFrame(tick);
  }

  // Position a specific message so its top sits `anchorOffset` px below the
  // viewport top, and keep re-pinning while the feed settles. Aborts (falling
  // back to the bottom) if the anchored message is not in the loaded window.
  function scrollToAnchor(anchorKey: string, anchorOffset: number) {
    if (!itemsRef.current.get(anchorKey)) {
      scrollToBottom();
      return;
    }

    // Restoring a mid-feed position means the reader was NOT at the bottom, so
    // clear the stick intent (it defaults to true on a fresh mount). Otherwise
    // the post-mount "keep newest in view" effect would immediately pin to the
    // bottom and the saved position would never be seen.
    stickToBottomRef.current = false;

    runScrollSettle((list) => {
      const element = itemsRef.current.get(anchorKey);

      if (!element) {
        return false;
      }

      const listTop = list.getBoundingClientRect().top;
      const elementTop = element.getBoundingClientRect().top;

      list.scrollTop += elementTop - listTop - anchorOffset;
      return true;
    });
  }

  function restoreScrollPosition(position: ChatScrollPosition | undefined) {
    lastPositionRef.current = position ?? { atBottom: true };

    if (!position || position.atBottom) {
      scrollToBottom();
      return;
    }

    // Restoring a bookmark: not at the bottom, so drop the stick intent and
    // suppress position-saving until it resolves (paging back must not overwrite
    // the bookmark we're chasing). Then seek to the message, paging older history
    // in if it isn't in the freshly-loaded window.
    stickToBottomRef.current = false;
    restoringRef.current = true;
    pendingBookmarkRef.current = {
      anchorKey: position.anchorKey,
      anchorOffset: position.anchorOffset,
      anchorTimestamp: position.anchorTimestamp,
      attempts: 0,
    };
    attemptBookmarkRestore();
  }

  function finishBookmarkRestore() {
    pendingBookmarkRef.current = null;
    // Re-enable saving once the restore scroll has settled, then record where
    // the restore actually landed (scroll input during the suppression window
    // would otherwise leave the stored bookmark pointing somewhere stale).
    window.setTimeout(() => {
      restoringRef.current = false;

      const list = listRef.current;

      if (list) {
        savePosition(list);
      }
    }, 500);
  }

  function attemptBookmarkRestore() {
    const pending = pendingBookmarkRef.current;

    if (!pending) {
      return;
    }

    // The bookmarked message is loaded: anchor to it and we're done.
    if (itemsRef.current.get(pending.anchorKey)) {
      scrollToAnchor(pending.anchorKey, pending.anchorOffset);
      finishBookmarkRestore();
      return;
    }

    // Not loaded yet: page backward until the oldest loaded message is at/before
    // the bookmark's timestamp (or history is exhausted, or a safety cap). Each
    // new page re-fires the seek effect, which calls back into here.
    const oldest = messages[0];
    const canPageToBookmark =
      !olderMessagesReachedStart && (!oldest || oldest.timestamp > pending.anchorTimestamp);

    if (canPageToBookmark && pending.attempts < 30) {
      pending.attempts += 1;

      if (!olderMessagesLoading) {
        onLoadOlder();
      }

      return;
    }

    // Paged as far as needed but the exact message is gone (edited/deleted) or
    // unreachable: land on the nearest loaded message at/after the bookmark.
    let nearestKey = '';

    for (const [key] of itemsRef.current) {
      if ((threadByKey.get(key)?.original.timestamp ?? 0) >= pending.anchorTimestamp) {
        nearestKey = key;
        break;
      }
    }

    if (nearestKey) {
      scrollToAnchor(nearestKey, pending.anchorOffset);
    } else {
      scrollToBottom();
    }

    finishBookmarkRestore();
  }

  // Capture the current reading position as a message bookmark: the topmost
  // message still visible at the viewport top, with its timestamp so it can be
  // paged back to later, even across a restart or beyond the live tail. "At the
  // bottom" (by actual position — not just the stick intent, so a scrollbar drag
  // counts too) saves a bottom pin so new messages keep it stuck there.
  function computeScrollPosition(list: HTMLOListElement): ChatScrollPosition {
    const isAtBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 48;

    if (isAtBottom) {
      return { atBottom: true };
    }

    const listTop = list.getBoundingClientRect().top;

    // itemsRef preserves insertion (render) order, top to bottom, so the first
    // message whose bottom is past the viewport top is the topmost visible one.
    // Rows are in document order, so their rect bottoms are monotonic — binary
    // search keeps this at O(log n) rect reads per scroll event instead of
    // walking every row above the viewport (this runs on the scroll hot path,
    // and paged-in history makes the list arbitrarily long).
    const items = [...itemsRef.current];
    let low = 0;
    let high = items.length;

    while (low < high) {
      const middle = (low + high) >> 1;

      if (items[middle][1].getBoundingClientRect().bottom > listTop + 1) {
        high = middle;
      } else {
        low = middle + 1;
      }
    }

    const anchor = items[low];

    if (anchor) {
      const [key, element] = anchor;
      const rect = element.getBoundingClientRect();

      return {
        anchorKey: key,
        anchorOffset: rect.top - listTop,
        anchorTimestamp: threadByKey.get(key)?.original.timestamp ?? 0,
        atBottom: false,
      };
    }

    return { atBottom: true };
  }

  // Persist the current reading position so returning to this chat restores it.
  // Guarded so transient states never clobber a real bookmark: only after the
  // initial restore has been applied, never mid-seek, and never while the pane
  // has no layout (a hidden list measures as "at bottom"). Called from user
  // scroll events AND from programmatic-scroll completions — the settle loops
  // suppress per-frame saves, so without a completion save, riding the down
  // arrow to the bottom would leave the stale pre-scroll bookmark behind.
  function savePosition(list: HTMLOListElement) {
    if (
      !didRestoreScrollRef.current ||
      restoringRef.current ||
      programmaticScrollRef.current ||
      list.clientHeight === 0
    ) {
      return;
    }

    const position = computeScrollPosition(list);

    lastPositionRef.current = position;
    onScrollPositionChange(scrollChatKey, position);
  }

  // Manual retry after an error — bypasses the auto-trigger's error guard.
  function handleLoadOlder() {
    captureScrollAnchor();
    onLoadOlder();
  }

  // Auto-trigger when the user scrolls near the top. Skips while a fetch is in
  // flight, once history is exhausted, or after an error (so it does not loop).
  function maybeLoadOlder(list: HTMLOListElement) {
    if (list.scrollTop > 80 || olderMessagesLoading || olderMessagesReachedStart || olderMessagesError) {
      return;
    }

    captureScrollAnchor();
    onLoadOlder();
  }

  // System messages (transaction status) trail the feed, so a new or updated one
  // should also scroll the feed when the user is stuck to the bottom.
  const systemMessagesKey = systemMessages.map((entry) => `${entry.id}:${entry.phase}`).join('|');

  // Reset restoration when switching chats so the next chat's saved position (or
  // bottom) is applied instead of the previous chat's, and drop any open popover.
  useEffect(() => {
    didRestoreScrollRef.current = false;
    pendingBookmarkRef.current = null;
    restoringRef.current = false;
    lastPositionRef.current = null;
    wasHiddenRef.current = false;
    closeReactionPopover();
  }, [scrollChatKey]);

  // Restore the saved reading position (or default to the bottom) once the chat's
  // messages have rendered. Runs before the stick-to-bottom effect below so a
  // restored mid-feed position is not immediately yanked to the bottom.
  useLayoutEffect(() => {
    const list = listRef.current;

    if (!list || didRestoreScrollRef.current || messages.length === 0) {
      return;
    }

    // In narrow/mobile mode the chat pane can be display:none (zero height) while
    // the list view is showing; restoring then would measure a 0-height list and
    // land wrong. Defer until it has real layout (the observer below re-triggers).
    if (list.clientHeight === 0) {
      return;
    }

    didRestoreScrollRef.current = true;
    restoreScrollPosition(initialScrollPosition);
  }, [initialScrollPosition, messages.length, scrollChatKey]);

  // Re-attempt the restore once the list actually has layout — covers the mobile
  // case where the pane was hidden (0 height) when messages first arrived. Also
  // watches for the pane LOSING layout after the restore (narrow-mode view swap
  // sets it display:none): the browser drops the scroll state with the layout,
  // so on becoming visible again the last known position is re-applied instead
  // of leaving the reader stranded at the top.
  useEffect(() => {
    const list = listRef.current;

    if (!list || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      if (list.clientHeight === 0) {
        if (didRestoreScrollRef.current) {
          wasHiddenRef.current = true;
        }

        return;
      }

      if (!didRestoreScrollRef.current) {
        if (messages.length > 0) {
          didRestoreScrollRef.current = true;
          restoreScrollPosition(initialScrollPosition);
        }

        return;
      }

      if (wasHiddenRef.current) {
        wasHiddenRef.current = false;
        restoreScrollPosition(lastPositionRef.current ?? initialScrollPosition);
      }
    });

    observer.observe(list);

    return () => observer.disconnect();
  }, [initialScrollPosition, messages.length, scrollChatKey]);

  // While a bookmark restore is seeking, re-attempt each time a newly paged-in
  // page renders (firstMessageKey changes) or pagination state settles, until the
  // bookmarked message is loaded or history is exhausted.
  useLayoutEffect(() => {
    if (pendingBookmarkRef.current) {
      attemptBookmarkRestore();
    }
  }, [firstMessageKey, messages.length, olderMessagesReachedStart, olderMessagesLoading]);

  // Keep the newest content in view when the user is reading at the bottom (or a
  // send just landed); if they have scrolled up, their position is left untouched.
  // A layout effect so it measures the committed DOM (incl. the new message's
  // height) before paint, avoiding a flash of unscrolled content.
  useLayoutEffect(() => {
    if (!didRestoreScrollRef.current) {
      return;
    }

    if (forceBottomRef.current) {
      forceBottomRef.current = false;
      scrollToBottom();
      return;
    }

    // Re-pin whenever the rendered messages change (new message, but also a quiet
    // poll merge / edit that changes the feed height) so a stuck-to-bottom reader
    // is not left short when scrollHeight shifts without a new last message.
    if (stickToBottomRef.current) {
      pinToBottom();
      return;
    }

    // Not pinned: the feed's geometry changed without any scroll input (restore
    // landed mid-feed, a bookmark seek is paging history in, new messages grew
    // the feed below), so recompute the scroll-to-bottom button's visibility —
    // it must appear without requiring the user to move the scroll first.
    const list = listRef.current;

    if (list) {
      updateBottomState(list);
    }
  }, [lastMessageKey, systemMessagesKey, messages]);

  // Sending a message always returns the user to the bottom so their own message
  // is in view, regardless of where they had scrolled. forceBottomRef survives
  // until the sent message lands (it arrives a tick after the nonce bumps), so the
  // landing scroll fires even if an intervening scroll cleared stickToBottom.
  // Guarding on the nonce value (not a mount ref) keeps this firing on every send.
  useLayoutEffect(() => {
    if (sentMessageNonce === 0) {
      return;
    }

    stickToBottomRef.current = true;
    forceBottomRef.current = true;

    if (didRestoreScrollRef.current) {
      scrollToBottom();
    }
  }, [sentMessageNonce]);

  // After older history is prepended the list grows upward; restore the viewport
  // so the message the user was reading stays put instead of jumping.
  useLayoutEffect(() => {
    const list = listRef.current;
    const anchor = olderScrollAnchorRef.current;

    if (!list || !anchor) {
      return;
    }

    olderScrollAnchorRef.current = null;

    // If the reader has asked to be at the bottom (e.g. tapped the down arrow
    // while an older-history fetch was still in flight), honor that instead of
    // restoring the pre-prepend anchor — restoring would yank them back up and
    // strand the scroll-to-bottom part-way.
    if (stickToBottomRef.current || forceBottomRef.current) {
      pinToBottom();
      return;
    }

    list.scrollTop = list.scrollHeight - anchor.scrollHeight + anchor.scrollTop;
    updateBottomState(list);
  }, [firstMessageKey]);

  useEffect(() => {
    return () => {
      window.clearTimeout(highlightTimeoutRef.current);
      window.clearTimeout(expandedTimeTimeoutRef.current);
      window.clearTimeout(userScrollClearRef.current);

      if (scrollSettleRafRef.current && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(scrollSettleRafRef.current);
      }
    };
  }, []);

  function toggleTimeDisplay(threadKey: string) {
    window.clearTimeout(expandedTimeTimeoutRef.current);

    if (expandedTimeKey === threadKey) {
      setExpandedTimeKey('');
      return;
    }

    setExpandedTimeKey(threadKey);
    expandedTimeTimeoutRef.current = window.setTimeout(() => setExpandedTimeKey(''), 5000);
  }

  function syncReplyJumpScrollState() {
    const list = listRef.current;

    if (!list || list.clientHeight === 0) {
      return;
    }

    const isAtBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 48;

    if (isAtBottom) {
      return;
    }

    updateBottomState(list);
    savePosition(list);
  }

  function scrollToThread(threadKey: string) {
    const item = itemsRef.current.get(threadKey);
    const list = listRef.current;

    if (!item || !list || list.clientHeight === 0) {
      return;
    }

    if (scrollSettleRafRef.current && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(scrollSettleRafRef.current);
      scrollSettleRafRef.current = 0;
    }

    // A reply-preview click is an explicit reader jump away from the newest
    // messages, so it must drop bottom-stick intent just like a manual scroll.
    pendingBookmarkRef.current = null;
    restoringRef.current = false;
    stickToBottomRef.current = false;
    programmaticScrollRef.current = true;

    const listRect = list.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    const centerOffset = Math.max(12, (list.clientHeight - item.clientHeight) / 2);
    const maxScrollTop = Math.max(0, list.scrollHeight - list.clientHeight);
    const targetScrollTop = list.scrollTop + itemRect.top - listRect.top - centerOffset;

    list.scrollTop = Math.min(Math.max(0, targetScrollTop), maxScrollTop);

    window.requestAnimationFrame(() => {
      programmaticScrollRef.current = false;
      syncReplyJumpScrollState();
    });
    setHighlightedKey(threadKey);
    window.clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = window.setTimeout(() => setHighlightedKey(''), 1800);
  }

  function toggleHistory(threadKey: string) {
    setOpenHistories((current) => {
      const next = new Set(current);

      if (next.has(threadKey)) {
        next.delete(threadKey);
      } else {
        next.add(threadKey);
      }

      return next;
    });
  }

  function toggleImagePreview(threadKey: string) {
    setOpenImagePreviews((current) => {
      const next = new Set(current);

      if (next.has(threadKey)) {
        next.delete(threadKey);
      } else {
        next.add(threadKey);
      }

      return next;
    });
  }

  function closeReactionPopover() {
    setOpenReactionPickerKey('');
    setOpenReactionDetailsKey('');
    setReactionAnchorRect(null);
  }

  function toggleReactionPicker(threadKey: string, anchor: HTMLElement) {
    const willOpen = openReactionPickerKey !== threadKey;

    setOpenReactionDetailsKey('');
    setOpenReactionPickerKey(willOpen ? threadKey : '');
    setReactionAnchorRect(willOpen ? anchor.getBoundingClientRect() : null);
  }

  function toggleReactionDetails(detailsKey: string, anchor: HTMLElement) {
    const willOpen = openReactionDetailsKey !== detailsKey;

    setOpenReactionPickerKey('');
    setOpenReactionDetailsKey(willOpen ? detailsKey : '');
    setReactionAnchorRect(willOpen ? anchor.getBoundingClientRect() : null);
  }

  function playMedia(resource: QdnMediaResource) {
    void openQdnMediaPlayer(resource).catch((error) => {
      console.warn('Unable to open QDN media player.', error);
    });
  }

  function openDocument(resource: QdnDocumentResource) {
    void openQdnDocumentViewer(resource).catch((error) => {
      console.warn('Unable to open QDN document viewer.', error);
    });
  }

  function saveResource(resource: QdnDocumentResource) {
    void saveQdnResource(resource).catch((error) => {
      console.warn('Unable to save QDN resource.', error);
    });
  }

  if (messages.length === 0 && systemMessages.length === 0) {
    return <p className="empty">{t('hint.noMessages')}</p>;
  }

  const { detailsReaction, detailsThread, pickerReactions, pickerThread } = reactionPopoverContent;

  return (
    <>
      <div className="message-feed">
        <ol
          className="message-list"
          onWheel={noteUserScroll}
          onTouchMove={noteUserScroll}
          onKeyDown={(event) => {
            // Keys that scroll the feed count as user-driven scrolling.
            if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) {
              noteUserScroll();
            }
          }}
          onLoadCapture={() => {
            // A QDN image/media preview finished loading and grew the feed. If the
            // reader is pinned to the bottom, keep them there — this is what carries
            // a scroll-to-bottom all the way down as async previews settle in.
            if (stickToBottomRef.current) {
              pinToBottom();
            }
          }}
          onScroll={(event) => {
            const list = event.currentTarget;

            // Scroll events on a zero-layout pane (narrow-mode display:none
            // swap, browser clamping scrollTop as layout collapses) carry no
            // usable position — acting on them corrupts stick intent and saves.
            if (list.clientHeight === 0) {
              return;
            }

            // Native scrollbar dragging fires `scroll` without wheel/touch/key
            // input events, so treat any non-settle-loop scroll as user intent.
            if (!programmaticScrollRef.current) {
              noteUserScroll();
            }

            updateBottomState(list);

            // The feed moving (e.g. a new message auto-scrolling) would leave a
            // viewport-anchored reaction popover misaligned, so dismiss it.
            if (openReactionPickerKey || openReactionDetailsKey) {
              closeReactionPopover();
            }

            // Remember where the user is reading so it can be restored on return.
            // Skipped while a settle loop is programmatically driving scrollTop
            // (so its frames don't clobber the user's anchor); savePosition adds
            // the restore-state guards. Saved as a message anchor — see
            // computeScrollPosition.
            if (!programmaticScrollRef.current) {
              savePosition(list);
            }

            if (!programmaticScrollRef.current) {
              maybeLoadOlder(list);
            }
          }}
          ref={listRef}
        >
          {olderMessagesLoading || olderMessagesError ? (
            <li className="message-list__history-control">
              {olderMessagesLoading ? (
                <span className="muted">{t('status.loadingOlderMessages')}</span>
              ) : (
                <>
                  <span className="error">{olderMessagesError}</span>
                  <button className="button button--secondary" onClick={handleLoadOlder} type="button">
                    {t('button.retry')}
                  </button>
                </>
              )}
            </li>
          ) : null}
          {olderMessagesReachedStart && !olderMessagesLoading && !olderMessagesError && messages.length > 0 ? (
            <li className="message-list__history-note">
              <span className="muted">{t('hint.olderMessagesExpired')}</span>
            </li>
          ) : null}
          {renderedThreads.map(({ key: threadKey, thread }, index) => {
            const { latest, original, revisions } = thread;
            const decoded = decodeChatMessage(latest, t);
            const isOwn = selfAddress !== null && original.sender === selfAddress;
            const isEdited = revisions.length > 0;
            const isHistoryOpen = isEdited && openHistories.has(threadKey);
            const previousVersions = isHistoryOpen ? [original, ...revisions.slice(0, -1)] : [];
            const repliedTarget = decoded.repliedTo ? threadTargetsBySignature.get(decoded.repliedTo) : undefined;
            const repliedThread = repliedTarget?.thread;
            const isHighlighted = highlightedKey === threadKey;
            const isContinuation = isThreadContinuation(threads[index - 1], thread);
            const canEdit = isOwn && decoded.kind === 'text';
            // A deleted message is a thread whose accepted revisions end in an
            // empty body. Edit stays available on it (re-editing restores the
            // message); Delete disappears (already deleted).
            const isThreadDeleted = thread.revisions.length > 0 && decoded.kind === 'text' && !decoded.body;
            const isTimeExpanded = expandedTimeKey === threadKey;
            const imageResources = decoded.kind === 'text' ? getImageQdnResources(decoded.body) : [];
            const mediaResources = decoded.kind === 'text' ? getMediaQdnResources(decoded.body) : [];
            const documentResources = decoded.kind === 'text' ? getDocumentQdnResources(decoded.body) : [];
            const hasImagePreviews = imageResources.length > 0;
            const hasMediaActions = canOpenMediaPlayer && mediaResources.length > 0;
            const hasDocumentResources = documentResources.length > 0;
            const hasDocumentViewerActions = canOpenDocumentViewer && hasDocumentResources;
            const hasDocumentSaveActions = canSaveQdnResource && hasDocumentResources;
            const areImagePreviewsOpen = openImagePreviews.has(threadKey);
            const canReplyOrEdit = canCompose && !!original.signature;
            const canReact = canReplyOrEdit;
            const isReactionPickerOpen = openReactionPickerKey === threadKey;
            const reactions = original.signature ? reactionsBySignature.get(original.signature) ?? [] : [];
            const senderProfile = avatarProfiles.get(original.sender);
            const actionButtons =
              canReplyOrEdit ||
              canReact ||
              hasImagePreviews ||
              hasMediaActions ||
              hasDocumentViewerActions ||
              hasDocumentSaveActions ? (
                <div className="message__actions">
                  {hasImagePreviews ? (
                    <button aria-expanded={areImagePreviewsOpen} onClick={() => toggleImagePreview(threadKey)} type="button">
                      {areImagePreviewsOpen ? t('button.hideImagePreview') : t('button.viewImagePreview')}
                    </button>
                  ) : null}
                  {hasMediaActions
                    ? mediaResources.map((resource, resourceIndex) => (
                        <button
                          aria-label={t('action.openMediaPlayer')}
                          key={`${resource.qdnUrl}-${resourceIndex}`}
                          onClick={() => playMedia(resource)}
                          title={resource.qdnUrl}
                          type="button"
                        >
                          {t('button.playMedia')}
                        </button>
                      ))
                    : null}
                  {hasDocumentViewerActions
                    ? documentResources.map((resource, resourceIndex) => (
                        <button
                          key={`view-${resource.qdnUrl}-${resourceIndex}`}
                          onClick={() => openDocument(resource)}
                          title={resource.qdnUrl}
                          type="button"
                        >
                          {t('button.open')}
                        </button>
                      ))
                    : null}
                  {hasDocumentSaveActions
                    ? documentResources.map((resource, resourceIndex) => (
                        <button
                          key={`save-${resource.qdnUrl}-${resourceIndex}`}
                          onClick={() => saveResource(resource)}
                          title={resource.qdnUrl}
                          type="button"
                        >
                          {t('button.save')}
                        </button>
                      ))
                    : null}
                  {canReplyOrEdit ? (
                    <button onClick={() => onReply(original)} type="button">
                      {t('button.reply')}
                    </button>
                  ) : null}
                  {canReact ? (
                    <button
                      aria-expanded={isReactionPickerOpen}
                      aria-haspopup="dialog"
                      onClick={(event) => toggleReactionPicker(threadKey, event.currentTarget)}
                      type="button"
                    >
                      {t('button.react')}
                    </button>
                  ) : null}
                  {canReplyOrEdit && canEdit ? (
                    <button onClick={() => onEdit(thread)} type="button">
                      {t('button.edit')}
                    </button>
                  ) : null}
                  {canReplyOrEdit && canEdit && !isThreadDeleted ? (
                    <button onClick={() => onDelete(thread)} type="button">
                      {t('button.delete')}
                    </button>
                  ) : null}
                </div>
              ) : null;

            return (
              <Fragment key={threadKey}>
                {unreadDividerIndex === index ? (
                  <li className="message-list__unread-divider" ref={dividerRef} role="separator">
                    <span>{t('label.newMessages')}</span>
                  </li>
                ) : null}
              <li
                className={`message message--${decoded.kind}${isOwn ? ' message--own' : ''}${isHighlighted ? ' message--highlight' : ''}${isContinuation ? ' message--continuation' : ''}${!isOwn && mentionPattern?.test(decoded.body) ? ' message--mention' : ''}`}
                ref={(element) => {
                  if (element) {
                    itemsRef.current.set(threadKey, element);
                  } else {
                    itemsRef.current.delete(threadKey);
                  }
                }}
              >
                {isContinuation ? null : (
                  <div className="message__meta">
                    <MessageIdentity
                      message={original}
                      onOpenAccount={onOpenAccount}
                      onOpenAvatar={onOpenAvatar}
                      openAvatarLabel={t('action.openAvatarImage')}
                      profile={senderProfile}
                      t={t}
                    />
                    {actionButtons}
                  </div>
                )}
                {decoded.repliedTo ? (
                  repliedThread ? (
                    <button
                      className="message__reply-preview"
                      onClick={() => scrollToThread(repliedTarget.key)}
                      title={t('action.goToOriginal')}
                      type="button"
                    >
                      <strong>
                        {getMessageSenderLabel(
                          repliedThread.original,
                          avatarProfiles.get(repliedThread.original.sender),
                        )}
                      </strong>
                      <span>{getMessageSnippet(repliedThread.latest, t)}</span>
                    </button>
                  ) : (
                    <span className="message__reply-preview message__reply-preview--missing">
                      {t('message.replyUnavailable')}
                    </span>
                  )
                ) : null}
                <div className="message__body">
                  {decoded.body ? (
                    renderMessageTextWithAppLinks(decoded.body, t)
                  ) : (
                    <span className="message__body-placeholder">
                      {isThreadDeleted ? t('message.deleted') : t('message.empty')}
                    </span>
                  )}
                </div>
                {areImagePreviewsOpen ? (
                  <MessageImagePreviews onOpenImage={onOpenImage} resources={imageResources} t={t} />
                ) : null}
                <MessageReactionChips
                  onToggleReactionDetails={toggleReactionDetails}
                  openReactionDetailsKey={openReactionDetailsKey}
                  original={original}
                  pendingReactionKey={pendingReactionKey}
                  reactions={reactions}
                  t={t}
                />
                <div className="message__footer">
                  <button
                    className="message__time"
                    onClick={() => toggleTimeDisplay(threadKey)}
                    title={formatTimestamp(original.timestamp, t.locale)}
                    type="button"
                  >
                    {isTimeExpanded ? formatTimestamp(original.timestamp, t.locale) : formatTimeAgo(original.timestamp, now, t.locale)}
                  </button>
                  {isEdited ? (
                    <button
                      aria-expanded={isHistoryOpen}
                      className="message__edited"
                      onClick={() => toggleHistory(threadKey)}
                      title={t('action.toggleEditHistory')}
                      type="button"
                    >
                      {t('label.message.edited')} · {formatTimeAgo(latest.timestamp, now)}
                    </button>
                  ) : null}
                  {isContinuation ? actionButtons : null}
                </div>
                {isHistoryOpen ? (
                  <ol className="message__history" aria-label={t('label.editHistory')}>
                    {previousVersions.map((version, versionIndex) => {
                      const versionBody = decodeChatMessage(version, t).body;

                      return (
                        <li key={getMessageKey(version, versionIndex)}>
                          <span className="message__history-meta">
                            {versionIndex === 0 ? `${t('label.message.original')} · ` : ''}
                            {formatTimestamp(version.timestamp, t.locale)}
                          </span>
                          <span className="message__history-body">
                            {versionBody ? renderMessageTextWithAppLinks(versionBody, t) : t('message.empty')}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                ) : null}
              </li>
              </Fragment>
            );
          })}
          {systemMessages.map((transaction) => (
            <li className={`tx-status tx-status--${transaction.phase}`} key={transaction.id}>
              <strong>
                {transaction.phase === 'confirmed'
                  ? t('status.transaction.confirmed')
                  : transaction.phase === 'failed'
                    ? t('status.transaction.failed')
                    : t('status.transaction.pending')}
              </strong>
              <span>{transaction.message}</span>
              {transaction.signature ? <small>{transaction.signature}</small> : null}
            </li>
          ))}
        </ol>
        {unreadJumpVisible && unreadCount > 0 ? (
          <button
            aria-label={t('aria.jumpToUnread')}
            className="message-feed__jump-unread"
            onClick={scrollToUnread}
            type="button"
          >
            <UpIcon />
            <span>{t('label.newMessagesCount', { count: unreadCount })}</span>
          </button>
        ) : null}
        {showScrollToBottom ? (
          <button aria-label={t('aria.scrollToBottom')} className="message-feed__scroll-bottom" onClick={handleScrollToBottomClick} type="button">
            <DownIcon />
          </button>
        ) : null}
      </div>
    {reactionAnchorRect && pickerThread ? (
      <ReactionPopover
        anchorRect={reactionAnchorRect}
        label={t('label.reactions')}
        onClose={closeReactionPopover}
        width={360}
      >
        <MessageReactionPicker
          onReact={(message, reaction, contentState) => {
            closeReactionPopover();
            onReact(message, reaction, contentState);
          }}
          original={pickerThread.original}
          pendingReactionKey={pendingReactionKey}
          reactions={pickerReactions}
          t={t}
        />
      </ReactionPopover>
    ) : null}
    {reactionAnchorRect && detailsThread && detailsReaction ? (
      <ReactionPopover
        anchorRect={reactionAnchorRect}
        label={t('label.reactionDetails')}
        onClose={closeReactionPopover}
        width={300}
      >
        <MessageReactionDetails
          avatarProfiles={avatarProfiles}
          canReact={canCompose && !!detailsThread.original.signature}
          now={now}
          onClose={closeReactionPopover}
          onReact={onReact}
          original={detailsThread.original}
          pendingReactionKey={pendingReactionKey}
          reaction={detailsReaction}
          t={t}
        />
      </ReactionPopover>
    ) : null}
    </>
  );
});
