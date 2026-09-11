// Developers workspace: Chat's public contract, rendered from the same
// constants, builders and readers the app itself uses (no literal twins —
// reference.test.tsx binds every printed value to its implementation export).
// The body intentionally stays English and LTR so schema names, action names
// and examples read identically for every developer, whatever language Home
// applies to the rest of the shell.
import { useState, type ReactNode } from 'react';

import { ACCOUNT_UNLOCK_STATE_CHANGE_TIMEOUT_MS } from './accountUnlockTransition';
import {
  ATTACHMENT_FILE_MAX_BYTES,
  ATTACHMENT_IMAGE_MAX_BYTES,
  IMAGE_COMPRESSION_MAX_WIDTH,
  IMAGE_COMPRESSION_QUALITY,
  QDN_PUBLISH_SOURCE_MAX_BYTES,
  SOURCE_TOKEN_EXPIRY_MS,
} from './attachments';
import { AVATAR_MAX_BYTES } from './avatarProfiles';
import { BRIDGE_ERROR_CODES } from './bridgeErrors';
import {
  DEFAULT_REACTION_OPTIONS,
  MAX_ENVELOPE_CANDIDATES,
  MAX_ENVELOPE_DEPTH,
  MAX_REACTION_CONTENT_LENGTH,
  QORTAL_HUB_IMAGE_IDENTIFIER_MAX_LENGTH,
  QORTAL_HUB_IMAGE_NAME_MAX_LENGTH,
  QORTAL_HUB_IMAGE_SERVICES,
} from './chatText';
import { copyTextToClipboard } from './clipboard';
import {
  DEFAULT_LIST_LIMIT,
  DEFAULT_MAX_BYTES,
  DIRECT_MESSAGE_MAX_BYTES,
  PRIVATE_ATTACHMENT_CODECS,
  PRIVATE_ATTACHMENT_MAX_CIPHERTEXT_BYTES,
  PRIVATE_ATTACHMENT_SERVICES,
  QDN_PUBLISH_CATEGORY_MAX_BYTES,
  QDN_PUBLISH_DESCRIPTION_MAX_BYTES,
  QDN_PUBLISH_IDENTIFIER_MAX_BYTES,
  QDN_PUBLISH_NAME_MAX_BYTES,
  QDN_PUBLISH_TAG_MAX_BYTES,
  QDN_PUBLISH_TAGS_MAX_COUNT,
  QDN_PUBLISH_TITLE_MAX_BYTES,
  QORTAL_PRIVATE_GROUP_MAX_PLAINTEXT_BYTES,
  RESOLVE_IDENTITIES_LIMIT,
} from './coreApi';
import { CHAT_ROUTE_QUERY_KEYS, DEVELOPERS_VIEW, DEVELOPERS_VIEW_ALIASES, VIEW_QUERY_PARAM } from './deepLink';
import { GENERAL_CHAT_GROUP_ID } from './generalChat';
import { LEGACY_HOME_PRE_BROADCAST_REFUSALS } from './legacyHome';
import { HUB_EMBED_SAFE_VALUE } from './messageLinks';
import { THREAD_CONTINUATION_WINDOW_MS } from './messageThreads';
import { POW_BUFFER_WORDS } from './memoryPow';
import {
  CHAT_APP_LINK,
  CHAT_NOTIFICATION_TEXT_MAX_LENGTH,
  CHAT_NOTIFICATION_TITLE_MAX_LENGTH,
  DIRECT_MESSAGE_NOTIFICATION_ID,
} from './notifications';
import { SEND_CONFIRMATION_TIMEOUT_MS } from './pendingSends';
import { DEFAULT_NODE_API_URL, LOCAL_READ_ACTIONS } from './qdnRequest';
import { QDN_SERVICE_SUGGESTIONS } from './qdnServices';
import {
  CHAT_NONCE_OFFSET,
  CHAT_POW_DIFFICULTY,
  CHAT_TRANSACTION_TYPE,
  MAX_MESSAGE_DATA_BYTES,
  MESSAGE_POW_DIFFICULTY,
  MESSAGE_TRANSACTION_TYPE,
  POW_TIMEOUT_MS,
  WRAPPER_FETCH_MAX_BYTES,
} from './qortalGeneralChat';
import { QORTAL_GROUP_SEARCH_LIMIT } from './qortalGroupDiscovery';
import {
  DEFAULT_NODE_API_URL as QORTAL_DEFAULT_NODE_API_URL,
  LEGACY_QORTAL_ACTIONS,
  QORTAL_PUBLIC_READ_ACTIONS,
} from './qortalRequest';
import { BRIDGE_ACTION_ROSTER, REFERENCE_SNIPPETS, type ReferenceSnippetName } from './referenceExamples';
import { REFERENCE_SECTIONS, ReferenceNavigation, type ReferenceSectionId } from './ReferenceNavigation';

export const QORTIUM_PUBLICATION = 'qdn://APP/Chat/Chat';
export const QORTAL_PUBLICATION = 'qortal://APP/xchat?identifier=default';

export function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024 && bytes % (1024 * 1024) === 0) {
    return `${bytes / (1024 * 1024)} MiB`;
  }

  if (bytes >= 1024 && bytes % 1024 === 0) {
    return `${bytes / 1024} KiB`;
  }

  return `${bytes} bytes`;
}

export function formatDuration(ms: number) {
  if (ms >= 60_000 && ms % 60_000 === 0) {
    return `${ms / 60_000} min`;
  }

  return `${ms / 1000} s`;
}

export type CopyResult = 'copied' | 'idle' | 'unavailable';

export function getCopyStatusText(result: CopyResult, label: string) {
  if (result === 'copied') {
    return `Copied ${label}.`;
  }

  if (result === 'unavailable') {
    return 'Clipboard unavailable. Select the code and copy it manually.';
  }

  return 'Code can be selected for manual copying.';
}

function CopyableCode({ label, snippet }: { label: string; snippet: ReferenceSnippetName }) {
  const [result, setResult] = useState<CopyResult>('idle');
  const code = REFERENCE_SNIPPETS[snippet];

  const copy = async (button: HTMLButtonElement) => {
    setResult('idle');
    setResult((await copyTextToClipboard(code)) ? 'copied' : 'unavailable');
    // Keep focus on the control that was activated (the clipboard fallback
    // briefly focuses a hidden textarea), without scrolling to reach it.
    button.focus({ preventScroll: true });
  };

  return (
    <div className="reference-code">
      <div className="reference-code__toolbar">
        <span>{label}</span>
        <button
          aria-label={`Copy ${label}`}
          className="reference-code__copy"
          onClick={(event) => {
            void copy(event.currentTarget);
          }}
          type="button"
        >
          {result === 'copied' ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p aria-live="polite" className="reference-copy-status" role="status">
        {getCopyStatusText(result, label)}
      </p>
      <pre aria-label={label} tabIndex={0}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

function ReferenceCard({ children, title, wide }: { children: ReactNode; title: string; wide?: boolean }) {
  return (
    <article className={`reference-card${wide ? ' reference-card--wide' : ''}`}>
      <h3>{title}</h3>
      {children}
    </article>
  );
}

function Section({
  children,
  id,
  lede,
  title,
}: {
  children: ReactNode;
  id: ReferenceSectionId;
  lede: ReactNode;
  title: string;
}) {
  const index = REFERENCE_SECTIONS.findIndex(([sectionId]) => sectionId === id) + 1;
  const kicker = REFERENCE_SECTIONS[index - 1][1];

  return (
    <section className="reference-section" id={id} tabIndex={-1}>
      <div className="reference-section__heading">
        <p className="reference-kicker">
          {String(index).padStart(2, '0')} · {kicker}
        </p>
        <h2>{title}</h2>
        <p>{lede}</p>
      </div>
      {children}
    </section>
  );
}

function LimitsTable({ rows }: { rows: ReadonlyArray<readonly [string, string, string]> }) {
  return (
    <div className="reference-table-wrap">
      <table className="reference-table">
        <thead>
          <tr>
            <th scope="col">Limit</th>
            <th scope="col">Value</th>
            <th scope="col">Enforced by</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([limit, value, where]) => (
            <tr key={limit}>
              <th scope="row">{limit}</th>
              <td>
                <code>{value}</code>
              </td>
              <td>{where}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const HUB_IMAGE_SERVICES = [...QORTAL_HUB_IMAGE_SERVICES].sort();

export default function Reference({ appVersion }: { appVersion: string }) {
  return (
    <div className="developer-reference" dir="ltr" lang="en">
      <header className="reference-hero">
        <p className="reference-eyebrow">Developer reference</p>
        <h1>Build with Qortium Chat</h1>
        <p>
          Chat is one bundle that runs in Qortium Home 2, Qortium Home 1.x and Qortal Hub. It publishes as{' '}
          <code>{QORTIUM_PUBLICATION}</code> on Qortium and as <code>{QORTAL_PUBLICATION}</code> on Qortal — the
          same files; chain-specific behaviour is decided at runtime from the injected bridge global, the
          host&apos;s <code>WHICH_UI</code> answer, Core&apos;s <code>_qdnContext</code> render flag and the advertised
          actions, never at build time. This reference describes version <code>{appVersion}</code> (QAVS:{' '}
          <code>X.Y</code> is the minimum platform level, <code>Z</code> the app counter).
        </p>
        <p className="reference-note">
          This page intentionally remains in English so schema names, action names and examples stay identical
          for every developer.
        </p>
      </header>

      <ReferenceNavigation />

      <Section
        id="envelope"
        lede="A chat message is a CHAT transaction whose BASE64 data decodes to UTF-8 text. Replies, attachments, deletes and reactions ride small JSON envelopes inside that text; revisions point at the original through chatReference."
        title="Chat envelope and message kinds"
      >
        <div className="reference-grid">
          <ReferenceCard title="On-chain row (both chains)">
            <p>
              Nodes and hosts return <code>ChatMessage</code> rows: <code>sender</code>, <code>senderName?</code>,{' '}
              <code>recipient?</code>, <code>recipientName?</code>, <code>txGroupId</code>, <code>timestamp</code>,{' '}
              <code>signature?</code>, <code>chatReference?</code>, <code>data?</code>, <code>encoding?</code> (
              <code>BASE64</code> or <code>BASE58</code>), <code>isText?</code>, <code>isEncrypted?</code>,{' '}
              <code>decryptionStatus?</code>, <code>status?</code>, <code>keyId?</code>, <code>epochId?</code>.
            </p>
            <ul>
              <li>
                Public group: <code>txGroupId</code> is the group id (General Chat is group{' '}
                <code>{GENERAL_CHAT_GROUP_ID}</code>), <code>recipient</code> is empty, <code>isEncrypted</code> is
                false.
              </li>
              <li>
                Private (closed) group: <code>isEncrypted</code> is true and the host decrypts; a row without{' '}
                <code>data</code>, or whose <code>status</code>/<code>decryptionStatus</code> is not{' '}
                <code>DECRYPTED</code>, renders as an encrypted placeholder (<code>MISSING_KEY</code> names the missing
                group key).
              </li>
              <li>
                Direct message: <code>recipient</code> is the other address; the host decrypts for either party.
              </li>
              <li>
                Decode order: encrypted placeholder → <code>!isText</code> is binary → empty <code>data</code> is empty →{' '}
                <code>encoding</code> other than <code>BASE64</code> is unsupported → otherwise base64 → UTF-8 →
                envelope unwrap.
              </li>
            </ul>
          </ReferenceCard>
          <ReferenceCard title="Chat's own text envelopes">
            <ul>
              <li>
                New message without reply or attachment: the raw text, no JSON.
              </li>
              <li>
                Reply and/or attachment: <code>{'{"message": text, "repliedTo"?: signature, "attachments"?: [descriptor…]}'}</code>.
              </li>
              <li>
                Delete: an empty revision <code>{'{"message": ""}'}</code> (plus <code>repliedTo</code> when the original
                was a reply). The original stays on chain until retention expires; the non-empty JSON keeps the CHAT
                payload non-empty.
              </li>
              <li>
                Reaction: <code>{'{"message": "", "type": "reaction", "content": emoji, "contentState": boolean}'}</code>.{' '}
                <code>content</code> is trimmed and must be 1–{MAX_REACTION_CONTENT_LENGTH} characters;{' '}
                <code>contentState</code> defaults to true unless literally false. Default picker:{' '}
                {DEFAULT_REACTION_OPTIONS.join(' ')}.
              </li>
              <li>
                Up to {MAX_ENVELOPE_DEPTH} nested JSON levels are unwrapped (a reply sent as a direct message can be
                wrapped twice); <code>attachments</code> are captured once from the outermost envelope, at most{' '}
                {MAX_ENVELOPE_CANDIDATES} plain objects, validated later by the descriptor check in Attachments.
              </li>
            </ul>
          </ReferenceCard>
          <ReferenceCard title="chatReference rules">
            <ul>
              <li>
                Edit, delete and reaction are new CHAT transactions whose <code>chatReference</code> equals the original
                message&apos;s <code>signature</code>. A root message has a <code>signature</code> and no{' '}
                <code>chatReference</code>.
              </li>
              <li>
                Revisions are honoured only from the original sender; the visible body is that sender&apos;s newest
                revision. A thread counts as deleted when its latest revision decodes to kind <code>text</code> with an
                empty body.
              </li>
              <li>
                Reactions are indexed per <code>chatReference</code> → <code>content</code> → sender in timestamp order;{' '}
                <code>contentState: false</code> removes that sender&apos;s entry.
              </li>
              <li>
                A revision whose root has aged out of the loaded window is shown as a coalesced orphan row per sender.
                Consecutive messages from one sender within {formatDuration(THREAD_CONTINUATION_WINDOW_MS)} group as a
                continuation.
              </li>
            </ul>
          </ReferenceCard>
        </div>
        <div className="reference-grid">
          <CopyableCode label="chat message row" snippet="chatMessageRow" />
          <CopyableCode label="reply envelope" snippet="replyEnvelope" />
          <CopyableCode label="delete envelope" snippet="deleteEnvelope" />
          <CopyableCode label="reaction envelope" snippet="reactionEnvelope" />
        </div>
      </Section>

      <Section
        id="machine-messages"
        lede="Other apps can carry app-to-app data through a chat group. Chat hides those rows from the feed, unread counts and notifications when — and only when — they match this predicate."
        title="Machine-message skip rule"
      >
        <div className="reference-grid">
          <ReferenceCard title="The exact predicate (depth 0 only)">
            <p>The decoded text is treated as a machine message when all three hold:</p>
            <ol>
              <li>
                it parses as a plain JSON object with a non-empty string <code>app</code> (the sending app&apos;s
                marker);
              </li>
              <li>
                it has <em>no</em> string <code>message</code> key;
              </li>
              <li>
                at least one other key holds a plain object payload.
              </li>
            </ol>
            <p>
              The rule runs at depth 0 of the unwrap only. A human reply that quotes an envelope is wrapped as{' '}
              <code>{'{"message": …, "repliedTo": …}'}</code>, so matching after an unwrap would hide the reply and lose{' '}
              <code>repliedTo</code>. A flat object of strings stays visible so a pasted manifest is not silently
              dropped. The decoded kind is <code>machine</code> with <code>machineApp</code> set to the marker.
            </p>
          </ReferenceCard>
          <CopyableCode label="machine message (hidden)" snippet="machineEnvelope" />
          <CopyableCode label="flat JSON (still visible)" snippet="flatJsonVisible" />
        </div>
      </Section>

      <Section
        id="chains"
        lede="Qortium hosts accept Chat's envelopes as written. Qortal hosts expect Qortal Hub's own group (v3) and direct (v2) shapes, so Chat converts at the bridge boundary and reads both."
        title="Qortium vs Qortal"
      >
        <div className="reference-grid">
          <ReferenceCard title="Qortal Hub group envelope (version 3)">
            <ul>
              <li>
                New: <code>{'{images: [], isEdited: false, messageText: Tiptap doc, repliedTo: "" | signature, specialId: uuid, type: "", version: 3}'}</code>
                . The Tiptap doc is one <code>paragraph</code> of <code>text</code>/<code>hardBreak</code> nodes; a plain
                string or legacy HTML <code>messageText</code> is also read.
              </li>
              <li>
                Edit: same shape with <code>isEdited: true</code>, <code>type: "edit"</code>, <code>images: []</code>.
              </li>
              <li>
                Delete marker: <code>messageText</code> is the literal string <code>&lt;p&gt;&lt;/p&gt;</code>,{' '}
                <code>repliedTo</code> cleared, no extra keys.
              </li>
              <li>
                Reaction: <code>{'{content, contentState, message: "", specialId, type: "reaction"}'}</code> (no{' '}
                <code>version</code>).
              </li>
              <li>
                <code>images[]</code>: at most {MAX_ENVELOPE_CANDIDATES} entries, service one of{' '}
                {HUB_IMAGE_SERVICES.join(', ')}, name ≤ {QORTAL_HUB_IMAGE_NAME_MAX_LENGTH} and identifier ≤{' '}
                {QORTAL_HUB_IMAGE_IDENTIFIER_MAX_LENGTH} characters, no control characters or slashes.
              </li>
            </ul>
          </ReferenceCard>
          <ReferenceCard title="Qortal direct envelope (version 2)">
            <ul>
              <li>
                New: <code>{'{message: paragraph HTML, version: 2, specialId, repliedTo: "" | signature, type: "", attachments?: [...]}'}</code>
                ; one HTML-escaped <code>&lt;p&gt;</code> per line. Empty text is rejected.
              </li>
              <li>
                Edit: <code>{'{isEdited: true, message, repliedTo, specialId, type: "edit", version: 2}'}</code>.
              </li>
              <li>
                Delete marker: exactly six keys, <code>message</code> is <code>&lt;p&gt;&lt;/p&gt;</code>.
              </li>
              <li>
                Reaction: the Hub reaction shape plus <code>version: 2</code>.
              </li>
              <li>
                A <code>version: 2</code> object is recognised on read only with a string <code>message</code>, a
                non-empty <code>specialId</code> and a string <code>type</code>.
              </li>
            </ul>
          </ReferenceCard>
          <ReferenceCard title="Where the conversion happens">
            <ul>
              <li>
                Only Chat&apos;s own <code>{'{message, repliedTo?, attachments?}'}</code> envelope is lifted into the Qortal
                builders; any other JSON a user types stays visible text.
              </li>
              <li>
                Generic <code>SEND_CHAT_MESSAGE</code> on the <code>qortalRequest</code> global is wrapped into v3 by
                Chat. Home 2&apos;s exact actions (<code>SEND_CHAT_EDIT/DELETE/REACTION</code>,{' '}
                <code>SEND_DIRECT_CHAT_*</code>) receive the envelopes above from Chat.
              </li>
              <li>
                Home 1.7&apos;s legacy Qortal adapter maps generic names to <code>*_QORTAL_*</code> actions and rejects any{' '}
                <code>chatReference</code>: {Object.entries(LEGACY_QORTAL_ACTIONS).map(([from, to]) => `${from} → ${to}`).join('; ')}.
              </li>
              <li>Qortal Hub shows no direct messages and has no private groups; Home 2 offers both on Qortal.</li>
            </ul>
          </ReferenceCard>
          <ReferenceCard title="Qortal General Chat (group 0)">
            <p>
              Qortal Core rejects a native group-{GENERAL_CHAT_GROUP_ID} CHAT, so on Qortal Hub Chat wraps a signed CHAT
              (transaction type {CHAT_TRANSACTION_TYPE}) inside an unconfirmable MESSAGE (type{' '}
              {MESSAGE_TRANSACTION_TYPE}):
            </p>
            <ul>
              <li>
                Read: <code>/transactions/unconfirmed?txType=MESSAGE&amp;limit=0&amp;reverse=true</code>, decode the
                wrapper (≤ {formatBytes(WRAPPER_FETCH_MAX_BYTES)} per fetch), dedupe by signature.
              </li>
              <li>
                Send: requires <code>WHICH_UI</code> of <code>HUB_ELECTRON</code> or <code>HUB_WEB</code> and a{' '}
                <code>GET_USER_ACCOUNT</code> answer with <code>publicKey</code>. Chat builds the unsigned CHAT bytes,
                runs Core-compatible MemoryPoW ({formatBytes(POW_BUFFER_WORDS * 8)} buffer, difficulty{' '}
                {CHAT_POW_DIFFICULTY} for the CHAT at byte offset {CHAT_NONCE_OFFSET}, {MESSAGE_POW_DIFFICULTY} for the
                wrapper, {formatDuration(POW_TIMEOUT_MS)} timeout), asks the host to{' '}
                <code>SIGN_TRANSACTION</code> (<code>process: false</code>), derives the wrapper keypair from the CHAT
                signature and posts the wrapper to <code>/transactions/process?apiVersion=2</code>.
              </li>
              <li>
                Data cap {MAX_MESSAGE_DATA_BYTES} bytes. The result signature is the inner CHAT signature.
              </li>
            </ul>
          </ReferenceCard>
        </div>
        <div className="reference-grid">
          <CopyableCode label="Hub group envelope" snippet="hubGroupEnvelope" />
          <CopyableCode label="Hub group delete" snippet="hubGroupDelete" />
          <CopyableCode label="Hub group reaction" snippet="hubGroupReaction" />
          <CopyableCode label="direct envelope (v2)" snippet="directV2Envelope" />
          <CopyableCode label="direct delete (v2)" snippet="directV2Delete" />
        </div>
      </Section>

      <Section
        id="limits"
        lede="Client-side caps Chat enforces before any bridge round trip, and the encodings it accepts. Hosts and Core apply their own caps on top."
        title="Limits and encoding"
      >
        <LimitsTable
          rows={[
            ['Direct message (both chains; Qortal measured on the built v2 envelope)', `${DIRECT_MESSAGE_MAX_BYTES} UTF-8 bytes`, 'Chat'],
            ['Qortal private-group plaintext', `${QORTAL_PRIVATE_GROUP_MAX_PLAINTEXT_BYTES} UTF-8 bytes`, 'Chat'],
            ['Qortium private-group plaintext', 'maxMessagePlaintextBytes', 'GET_PRIVATE_GROUP_CHAT_STATE (runtime; never blocks before it loads)'],
            ['Qortal General Chat data', `${MAX_MESSAGE_DATA_BYTES} bytes`, 'Chat (Hub only)'],
            ['Public group message', 'no client cap', 'Home enforces a UTF-8 length cap on the host side'],
            ['Reaction content', `1–${MAX_REACTION_CONTENT_LENGTH} characters`, 'Chat'],
            ['Hub images / attachment descriptor candidates per message', `${MAX_ENVELOPE_CANDIDATES}`, 'Chat (read side)'],
            ['Private attachment ciphertext', formatBytes(PRIVATE_ATTACHMENT_MAX_CIPHERTEXT_BYTES), 'Chat descriptor validation'],
            ['Attachment file / image', `${formatBytes(ATTACHMENT_FILE_MAX_BYTES)} / ${formatBytes(ATTACHMENT_IMAGE_MAX_BYTES)}`, 'Chat'],
            ['Publish source selection', formatBytes(QDN_PUBLISH_SOURCE_MAX_BYTES), 'Home (mirrored by Chat)'],
            ['Publish source token lifetime', formatDuration(SOURCE_TOKEN_EXPIRY_MS), 'Home (mirrored by Chat)'],
            ['Inline image re-encode (non-GIF)', `WebP, max width ${IMAGE_COMPRESSION_MAX_WIDTH}, quality ${IMAGE_COMPRESSION_QUALITY}`, 'Chat'],
            ['Publish name', `${QDN_PUBLISH_NAME_MAX_BYTES.qortium} bytes Qortium / ${QDN_PUBLISH_NAME_MAX_BYTES.qortal} bytes Qortal`, 'Chat'],
            ['Publish identifier / title / description / category', `${QDN_PUBLISH_IDENTIFIER_MAX_BYTES} / ${QDN_PUBLISH_TITLE_MAX_BYTES} / ${QDN_PUBLISH_DESCRIPTION_MAX_BYTES} / ${QDN_PUBLISH_CATEGORY_MAX_BYTES} bytes`, 'Chat'],
            ['Publish tags', `≤ ${QDN_PUBLISH_TAGS_MAX_COUNT} tags of ≤ ${QDN_PUBLISH_TAG_MAX_BYTES} bytes`, 'Chat'],
            ['FETCH_NODE_API response', formatBytes(DEFAULT_MAX_BYTES), 'Chat default maxBytes'],
            ['RESOLVE_IDENTITIES batch', `${RESOLVE_IDENTITIES_LIMIT} addresses`, 'Chat'],
            ['List page size', `${DEFAULT_LIST_LIMIT}`, 'Chat default limit'],
            ['SHOW_NOTIFICATION title / text', `${CHAT_NOTIFICATION_TITLE_MAX_LENGTH} / ${CHAT_NOTIFICATION_TEXT_MAX_LENGTH} characters`, 'Chat truncation; Home re-validates'],
            ['Avatar bytes', formatBytes(AVATAR_MAX_BYTES), 'Home / Chat'],
          ]}
        />
        <div className="reference-grid">
          <ReferenceCard title="Encoding">
            <ul>
              <li>
                <code>data</code> is the BASE64 encoding of UTF-8 text; a row whose <code>encoding</code> is present and
                not <code>BASE64</code> is shown as unsupported rather than decoded.
              </li>
              <li>Byte limits are measured on the UTF-8 encoding of the exact text (or envelope) handed to the host.</li>
              <li>
                The &quot;4 KB inline cap&quot; mentioned in project notes is the {DIRECT_MESSAGE_MAX_BYTES}/
                {MAX_MESSAGE_DATA_BYTES}-byte figures above; no separate inline-media limit exists.
              </li>
            </ul>
          </ReferenceCard>
        </div>
      </Section>

      <Section
        id="bridge"
        lede="Chat never sniffs host names or versions: it discovers what a host can do from its advertised actions and answers to a few read-only probes, then routes every network-aware call through one dispatcher per chain."
        title="Home bridge"
      >
        <div className="reference-grid">
          <ReferenceCard title="Globals and discovery">
            <ul>
              <li>
                Qortium: <code>window.qdnRequest</code>. Without it, a browser-development fallback answers only{' '}
                {LOCAL_READ_ACTIONS.join(', ')} against <code>{DEFAULT_NODE_API_URL}</code>.
              </li>
              <li>
                Qortal: a <code>qortalRequest</code> global — Home 2 sets a window property, Qortal Hub injects a lexical{' '}
                <code>const</code>; both are honoured. Fallback node <code>{QORTAL_DEFAULT_NODE_API_URL}</code>.
              </li>
              <li>
                Core-rendered public Qortal pages set <code>window._qdnContext</code> to <code>gateway</code> or{' '}
                <code>domainMap</code>; there the runtime answers only {QORTAL_PUBLIC_READ_ACTIONS.join(', ')} and
                reports <code>WHICH_UI</code> as <code>QORTAL_GATEWAY</code>/<code>QORTAL_DOMAIN_MAP</code>.
              </li>
              <li>
                Sequence per global: <code>SHOW_ACTIONS</code> → <code>WHICH_UI</code> → <code>IS_USING_PUBLIC_NODE</code>{' '}
                (informational; sends are not gated on it). Transport is <code>gateway</code> (<code>*_GATEWAY</code>),{' '}
                <code>home</code> or <code>browser-dev</code>; host is <code>home2</code>, <code>hub</code> (
                <code>HUB_ELECTRON</code>/<code>HUB_WEB</code>), <code>legacy-home</code>, <code>gateway</code> or{' '}
                <code>browser-dev</code>.
              </li>
              <li>
                <code>?homeV2Bridge=1</code> in the query marks a Home 2 app tab and only changes shell chrome.{' '}
                <code>GET_HOST_INFO</code> is never called. Unknown actions are never probed (Hub leaves them to a 30 s
                timeout).
              </li>
            </ul>
          </ReferenceCard>
          <ReferenceCard title="Account context and unlock tiers">
            <ul>
              <li>
                Home 2 (Qortium and Qortal): <code>GET_SELECTED_ACCOUNT</code> →{' '}
                <code>{'{address, avatarUrl, id?, isUnlocked, name, resourceUrl?}'}</code>; <code>UNLOCK_SELECTED_ACCOUNT</code>{' '}
                when advertised. The host message <code>{'{action: "SELECTED_ACCOUNT_CHANGED"}'}</code> (or{' '}
                <code>{'{type: "qortium:selected-account-changed"}'}</code>) is latched across the unlock round trip for{' '}
                {formatDuration(ACCOUNT_UNLOCK_STATE_CHANGE_TIMEOUT_MS)}; an <code>ACCOUNT_LOCKED</code> error on{' '}
                <code>UNLOCK_SELECTED_ACCOUNT</code> is the resolved-before-state-update race, not a refusal.
              </li>
              <li>
                Home 1.x: the same Qortium global with generic actions. A closed group is sent through generic{' '}
                <code>SEND_CHAT_MESSAGE</code> only when the host advertises the private read action and the generic
                send but not the exact private send — Home then encrypts host-side.
              </li>
              <li>
                Qortal Hub: <code>GET_USER_ACCOUNT</code> → <code>{'{address, publicKey?}'}</code> plus optional{' '}
                <code>GET_PRIMARY_NAME</code>; Home 2 recovers the Qortal identity from the shared account. Direct and
                closed-group reads need an account; Hub has neither.
              </li>
              <li>
                Keys, encryption, proof of work and signing belong to the host. <code>epochId</code> and{' '}
                <code>memberPublicKeys</code> are carried opaque.
              </li>
            </ul>
          </ReferenceCard>
          <ReferenceCard title="Capability rules">
            <ul>
              <li>
                Inline publish bytes accepted: <code>PUBLISH_QDN_RESOURCE ∧ ¬PUBLISH_CHAT_ATTACHMENT</code>. Picker:{' '}
                <code>PUBLISH_QDN_RESOURCE ∧ SELECT_QDN_PUBLISH_SOURCE</code>. App-held bytes staged:{' '}
                <code>STAGE_QDN_PUBLISH_SOURCE</code>. Private attachment source:{' '}
                <code>PUBLISH_CHAT_ATTACHMENT ∧ SELECT_QDN_PUBLISH_SOURCE</code>. Open-group publishing also needs a
                registered name.
              </li>
              <li>
                Private-group sends have no generic fallback: the exact <code>SEND_PRIVATE_GROUP_CHAT_*</code> action must
                be advertised (Home 1.x exception above). Direct sends use <code>SEND_DIRECT_CHAT_MESSAGE</code>, else
                Qortium-only generic <code>SEND_CHAT_MESSAGE {'{recipientAddress}'}</code>, never on Qortal.
              </li>
              <li>
                Notifications: manage = <code>NOTIFICATION_HAS_PERMISSION ∧ NOTIFICATION_ADD ∧ NOTIFICATION_REMOVE</code>{' '}
                (legacy subscription <code>{'{event: "CHAT_MESSAGE", filters: {recipient}, link, notificationId}'}</code>{' '}
                with link <code>{CHAT_APP_LINK}</code> and id <code>{DIRECT_MESSAGE_NOTIFICATION_ID}</code>); show ={' '}
                <code>SHOW_NOTIFICATION</code> (Home 2, foreground only) returning{' '}
                <code>{'{shown, reason?: disabled | focused | muted | rate-limited | revoked | unsupported}'}</code>.
              </li>
              <li>
                Qortal chat is available with <code>GET_USER_ACCOUNT</code> + <code>SEARCH_CHAT_MESSAGES</code> (+{' '}
                <code>GET_ACCOUNT_GROUPS</code> unless Hub); a gateway needs <code>FETCH_NODE_API</code> +{' '}
                <code>LIST_GROUPS</code> + <code>SEARCH_CHAT_MESSAGES</code>.
              </li>
              <li>
                Home 1.x refuses a protected action before signing when its managed Core is stopped:{' '}
                {LEGACY_HOME_PRE_BROADCAST_REFUSALS.map((pattern) => pattern.source).join(' | ')} — treated as a definite
                non-send.
              </li>
            </ul>
          </ReferenceCard>
          <ReferenceCard title="Host → app messages">
            <ul>
              <li>
                Display: <code>THEME_CHANGED</code>, <code>LANGUAGE_CHANGED</code>, <code>TEXT_SIZE_CHANGED</code>,{' '}
                <code>ACCENT_CHANGED</code>, <code>UI_STYLE_CHANGED</code>, <code>DISPLAY_SETTINGS_CHANGED</code> (
                <code>requestedHandler</code>, when present, must be <code>UI</code>).
              </li>
              <li>
                Navigation: <code>{'{action: "OPEN_APP_TARGET", requestedHandler: "UI", query: {address?, group?, network?}}'}</code>{' '}
                pushes a conversation and returns to the chat workspace.
              </li>
              <li>
                Account: <code>SELECTED_ACCOUNT_CHANGED</code> as above.
              </li>
            </ul>
          </ReferenceCard>
        </div>
        <ReferenceCard title="Every bridge action Chat sends" wide>
          <dl className="reference-roster">
            {Object.entries(BRIDGE_ACTION_ROSTER).map(([group, actions]) => (
              <div key={group}>
                <dt>{group}</dt>
                <dd>
                  {actions.map((action) => (
                    <code key={action}>{action}</code>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
          <p>
            <code>FETCH_NODE_API</code> is GET/HEAD only with a <code>/</code>-rooted path and a <code>maxBytes</code>{' '}
            cap. Generic <code>SEND_CHAT_MESSAGE</code> takes <code>{'{groupId, txGroupId, message, chatReference?}'}</code>{' '}
            or <code>{'{recipientAddress, message, chatReference?}'}</code>; <code>SEND_DIRECT_CHAT_MESSAGE</code> takes{' '}
            <code>{'{message, otherAddress}'}</code>; <code>PUBLISH_CHAT_ATTACHMENT</code> takes{' '}
            <code>{'{conversation, sourceToken}'}</code> and the attachment access trio take <code>{'{descriptor}'}</code>.
          </p>
        </ReferenceCard>
        <div className="reference-grid">
          <CopyableCode label="SEND_CHAT_MESSAGE request" snippet="sendChatMessageRequest" />
          <CopyableCode label="SEND_CHAT_EDIT request" snippet="sendChatEditRequest" />
          <CopyableCode label="SHOW_NOTIFICATION request" snippet="showNotificationRequest" />
        </div>
      </Section>

      <Section
        id="outcomes"
        lede="A send is only proven by a signature that later appears in the feed. Everything between is modelled explicitly so a retry can never duplicate a transaction that may already be on chain."
        title="Confirmations and outcomes"
      >
        <div className="reference-grid">
          <ReferenceCard title="Send results">
            <ul>
              <li>
                <code>ChatSendResult</code>:{' '}
                <code>{'{signature, timestamp, outcome?: "accepted-unsigned" | "ambiguous" | "not-submitted", error?, errorType?, stage?: "key-announcement"}'}</code>
                . The signature is read from <code>signature</code>, <code>transactionSignature</code>,{' '}
                <code>result.signature</code> or <code>messageSignature</code>.
              </li>
              <li>
                <code>errorType: VALIDATION_FAILED</code>, or <code>canceled</code> with reason <code>USER_CANCELLED</code>,
                is a definite non-send (retryable).
              </li>
              <li>
                <code>{'{accepted: true}'}</code> without a signature is <code>accepted-unsigned</code> (Home 1.x public
                sends); the signature is recovered from the feed by content within 5 min of the send.
              </li>
              <li>
                An explicit failure that still carries a signature is <code>ambiguous</code>, or{' '}
                <code>not-submitted</code> when only the automatic key announcement went out.
              </li>
            </ul>
          </ReferenceCard>
          <ReferenceCard title="Delivery phases and retry">
            <ul>
              <li>
                <code>pending → broadcast → confirmed | rejected | ambiguous | expired</code>. Retry is offered only from{' '}
                <code>rejected</code>.
              </li>
              <li>
                A duplicate is blocked while any non-rejected entry matches the same account, text,{' '}
                <code>chatReference</code> and target.
              </li>
              <li>
                Confirmation expiry: {formatDuration(SEND_CONFIRMATION_TIMEOUT_MS)} after broadcast the entry becomes{' '}
                <code>expired</code> — never retryable, because the transaction may be on chain or merely absent from
                the node serving reads.
              </li>
            </ul>
          </ReferenceCard>
          <ReferenceCard title="Structured bridge errors">
            <p>
              Codes: {BRIDGE_ERROR_CODES.join(', ')}. Fields: <code>code</code>, <code>network</code>,{' '}
              <code>action</code>, <code>retryable</code>, <code>outcome</code> (<code>rejected</code> or{' '}
              <code>unknown</code>).
            </p>
            <ul>
              <li>
                <code>outcome: unknown</code> and <code>PENDING_TRANSACTION_RECONCILIATION_REQUIRED</code> are never
                retryable.
              </li>
              <li>
                <code>outcome: rejected</code>, or a code from the definite pre-broadcast set (<code>ACCOUNT_LOCKED</code>,{' '}
                <code>NODE_CAPABILITY_MISSING</code>, <code>MISSING_GROUP_KEY</code>,{' '}
                <code>MISSING_RECIPIENT_PUBLIC_KEY</code>, <code>NOT_GROUP_MEMBER</code>, <code>ROUTE_UNAVAILABLE</code>,{' '}
                <code>STALE_CONTEXT</code>, <code>USER_CANCELLED</code>, <code>VALIDATION_FAILED</code>), proves nothing
                was broadcast.
              </li>
              <li>Plain transport errors and generic <code>HOME_BRIDGE_ERROR</code> stay ambiguous.</li>
            </ul>
          </ReferenceCard>
          <ReferenceCard title="Pending-transaction journal (Home 2)">
            <ul>
              <li>
                <code>GET_PENDING_TRANSACTIONS</code> → <code>{'{entries[], network, version: 1}'}</code>; an entry is{' '}
                <code>{'{action, createdAt, network, signature, stage?, target, timestamp}'}</code> with target kind{' '}
                <code>operation</code>, <code>group</code>, <code>direct</code> or <code>resource</code>. Only group and
                direct entries are attributed to conversations.
              </li>
              <li>
                Forget rule: <code>FORGET_PENDING_TRANSACTION</code> is sent only after the entry&apos;s signature has been
                observed in that network&apos;s messages — never because time passed.
              </li>
              <li>
                Publishes and attachment publishes report <code>accepted: true</code> or{' '}
                <code>{'{outcome: "unknown", errorType: "BROADCAST_UNKNOWN", transactionSignature}'}</code>, which callers
                reconcile by signature rather than treat as failure.
              </li>
            </ul>
          </ReferenceCard>
        </div>
        <div className="reference-grid">
          <CopyableCode label="signed send result" snippet="sendResultSigned" />
          <CopyableCode label="ambiguous send result" snippet="sendResultAmbiguous" />
          <CopyableCode label="structured bridge error" snippet="bridgeError" />
          <CopyableCode label="pending-transaction journal" snippet="journal" />
        </div>
      </Section>

      <Section
        id="discovery"
        lede="How Chat finds groups, messages, names and resources, how it links to them, and what a deep link into Chat looks like."
        title="Discovery and reads"
      >
        <div className="reference-grid">
          <ReferenceCard title="Core REST paths (via FETCH_NODE_API)">
            <p>Each read prefers the exact bridge action when advertised, else the node path; group requests send both <code>groupId</code> and <code>txGroupId</code>.</p>
            <ul>
              <li>
                Groups: <code>/groups</code>, <code>/groups/search</code>, <code>/groups/{'{id}'}</code>,{' '}
                <code>/groups/member/{'{address}'}</code>, <code>/groups/members/{'{id}'}</code>,{' '}
                <code>/groups/joinrequests/…</code>, <code>/groups/invites/{'{address}'}</code>.
              </li>
              <li>
                Chat: <code>/chat/active/{'{address}'}?encoding=BASE64&amp;haschatreference=false</code>,{' '}
                <code>/chat/messages?txGroupId&amp;encoding=BASE64&amp;limit&amp;reverse=true[&amp;before]</code> (revisions
                included on purpose), <code>/chat/groupstats</code> (Qortal discovery); websockets{' '}
                <code>/websockets/chat/messages</code> and <code>/websockets/chat/active/{'{address}'}</code>.
              </li>
              <li>
                Names and resources: <code>/names/address/{'{address}'}</code>, <code>/names/{'{name}'}</code>,{' '}
                <code>/names/search?query&amp;prefix=true</code>, <code>/arbitrary/resources/search</code>.
              </li>
              <li>
                Transactions and node: <code>/transactions/signature/{'{sig}'}</code>, <code>/transactions/pending</code>,{' '}
                <code>/transactions/search</code>, <code>/addresses/rewardshares</code>, <code>/admin/status</code>,{' '}
                <code>/admin/mintingaccounts</code>, <code>/blocks/height</code>.
              </li>
            </ul>
          </ReferenceCard>
          <ReferenceCard title="QDN services and links">
            <ul>
              <li>
                Public services offered for linking (common to both cores): {QDN_SERVICE_SUGGESTIONS.join(', ')}.
              </li>
              <li>
                Qortium link: <code>qdn://SERVICE/name/identifier[/path]</code> with percent-encoded segments; service{' '}
                <code>{'^[A-Z0-9_]{1,64}$'}</code>, name ≤ 255, identifier ≤ 64, <code>default</code> means none.
              </li>
              <li>
                Qortal link: <code>qortal://SERVICE/name?identifier=…</code> (bare <code>qortal://name</code> is a
                WEBSITE), or Hub&apos;s <code>qortal://use-embed/{'{IMAGE|VIDEO|ATTACHMENT}'}?name&amp;service&amp;identifier</code>{' '}
                emitted only when every value matches <code>{HUB_EMBED_SAFE_VALUE.source}</code>.
              </li>
              <li>
                Avatars: Qortium <code>FETCH_ACCOUNT_AVATAR {'{address}'}</code> / <code>FETCH_GROUP_AVATAR {'{groupId}'}</code>{' '}
                (pointer-aware, <code>PENDING</code> retried); Qortal <code>FETCH_QDN_RESOURCE</code> of service{' '}
                <code>THUMBNAIL</code>, identifier <code>qortal_avatar</code> or <code>qortal_group_avatar_{'{groupId}'}</code>.
              </li>
              <li>
                Qortal group discovery searches {QORTAL_GROUP_SEARCH_LIMIT} groups per query.
              </li>
            </ul>
          </ReferenceCard>
          <ReferenceCard title="Deep links into Chat">
            <ul>
              <li>
                Conversation keys: {CHAT_ROUTE_QUERY_KEYS.join(', ')}. <code>address</code> matches{' '}
                <code>{'^Q[1-9A-HJ-NP-Za-km-z]{25,40}$'}</code>, <code>group</code> is a safe integer, <code>network</code> is{' '}
                <code>qortal</code> or <code>qortium</code> (default). A link with both fields opens the direct chat.
              </li>
              <li>
                Workspace: <code>{VIEW_QUERY_PARAM}={DEVELOPERS_VIEW}</code> opens this page;{' '}
                {DEVELOPERS_VIEW_ALIASES.map((alias, index) => (
                  <span key={alias}>
                    {index > 0 ? ' and ' : ''}
                    <code>
                      {VIEW_QUERY_PARAM}={alias}
                    </code>
                  </span>
                ))}{' '}
                are folded to it. Switching workspaces keeps the conversation keys, host parameters, unknown or repeated
                keys and the fragment, and adds one history entry so Back returns to the conversation.
              </li>
              <li>
                Home may also push a conversation at runtime with <code>OPEN_APP_TARGET</code> (see Home bridge).
              </li>
            </ul>
          </ReferenceCard>
          <ReferenceCard title="Retention caveat">
            <p>
              Chat assumes chat messages expire about 24 hours after they are made. That figure is Core&apos;s default
              retention, not an app constant: Chat has no setting for it and only reacts to what the node still returns.
              Consequences you will observe: relative timestamps never exceed hours; a delete leaves the original on
              chain until retention removes it; a revision whose root has aged out is shown as a coalesced orphan row per
              sender; and read-only previews of active open groups may be empty once their last message expires.
            </p>
          </ReferenceCard>
        </div>
        <div className="reference-grid">
          <CopyableCode label="deep links" snippet="routes" />
          <CopyableCode label="share links" snippet="shareLinks" />
        </div>
      </Section>

      <Section
        id="attachments"
        lede="Summary of docs/CHAT_ATTACHMENTS.md: how files reach QDN from each host, how a private attachment is described inside a message, and the caps that apply."
        title="Attachments"
      >
        <div className="reference-grid">
          <ReferenceCard title="Sources per host (feature-detected)">
            <ul>
              <li>
                Picker: <code>SELECT_QDN_PUBLISH_SOURCE</code> returns a short-lived <code>sourceToken</code> the app
                redeems through <code>PUBLISH_QDN_RESOURCE</code> (open groups) or <code>PUBLISH_CHAT_ATTACHMENT</code>{' '}
                (private conversations). The app never sees bytes.
              </li>
              <li>
                Bytes: on hosts that accept inline bytes the app reads the file, re-encodes non-GIF images to WebP and
                publishes <code>{'{action: "PUBLISH_QDN_RESOURCE", base64, filename, identifier, name, service}'}</code>.
                Open groups only.
              </li>
              <li>
                Staged bytes: token-only hosts that advertise <code>STAGE_QDN_PUBLISH_SOURCE</code> accept{' '}
                <code>{'{bytesBase64, fileName, mimeType?}'}</code> for paste/drop and return an ordinary token, which
                also serves private conversations.
              </li>
              <li>
                Public attachment: identifier <code>qtm-chat_group_{'{groupId}'}_{'{timestamp base36}'}-{'{6 random}'}</code>, link{' '}
                <code>qdn://{'{SERVICE}'}/{'{name}'}/{'{identifier}'}</code>; <code>image/*</code> except SVG is service{' '}
                <code>IMAGE</code>, everything else <code>ATTACHMENT</code>.
              </li>
            </ul>
          </ReferenceCard>
          <ReferenceCard title="Private attachment descriptor">
            <p>
              <code>PUBLISH_CHAT_ATTACHMENT</code> returns an immutable descriptor that must be handed back unchanged to{' '}
              <code>GET_CHAT_ATTACHMENT_STREAM_URL</code>, <code>OPEN_CHAT_ATTACHMENT_VIEWER</code> and{' '}
              <code>SAVE_CHAT_ATTACHMENT</code>:
            </p>
            <ul>
              <li>
                <code>{'{version: 1, encrypted: true, network, codec, conversation, resource: {identifier, name, service}, ciphertext: {algorithm: "SHA-256", hash, size, transactionSignature}}'}</code>
                .
              </li>
              <li>
                Codecs: {PRIVATE_ATTACHMENT_CODECS.join(', ')}. Services: {PRIVATE_ATTACHMENT_SERVICES.join(', ')}. Hash is
                64 hex characters; size is 1 byte to {formatBytes(PRIVATE_ATTACHMENT_MAX_CIPHERTEXT_BYTES)}.
              </li>
              <li>
                A stream URL is single-use and expires after 10 minutes on the host side; fetch a fresh one each time
                bytes are needed.
              </li>
            </ul>
          </ReferenceCard>
          <ReferenceCard title="Embedding matrix">
            <ul>
              <li>
                Qortal private group with service <code>IMAGE</code>: one entry in the Hub v3 <code>images[]</code>{' '}
                carrying the plain Hub fields plus the full descriptor keys.
              </li>
              <li>
                Every other case (Qortium group and direct, Qortal direct, Qortal private group non-image): Chat&apos;s{' '}
                <code>{'{message, repliedTo?, attachments: [descriptor]}'}</code> envelope; for Qortal direct it is
                re-wrapped into the v2 envelope with <code>attachments</code> as an extra key.
              </li>
              <li>
                Readers must validate each candidate with the descriptor check above (at most{' '}
                {MAX_ENVELOPE_CANDIDATES} per message). Edits never carry new attachments.
              </li>
            </ul>
          </ReferenceCard>
        </div>
        <div className="reference-grid">
          <CopyableCode label="attachment envelope" snippet="attachmentEnvelope" />
          <CopyableCode label="private attachment descriptor" snippet="descriptor" />
        </div>
      </Section>
    </div>
  );
}
