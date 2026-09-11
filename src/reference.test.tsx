// Rendered-contract tests for the Developers workspace. These are drift
// detectors, not markup snapshots: every printed value is asserted against
// the implementation export it must equal, every public example is parsed
// back through the real reader, and the bridge roster is compared with the
// `action: '…'` literals in src/ so a new or removed action fails here.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';


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
import { BRIDGE_ERROR_CODES, getBridgeErrorDetails, isDefiniteChatMutationRejection } from './bridgeErrors';
import { filterChatJournalEntries, getJournalConversationKey } from './bridgeJournal';
import {
  decodeChatMessage,
  DEFAULT_REACTION_OPTIONS,
  encodeBase64,
  isHiddenChatMessage,
  isMachineChatMessage,
  MAX_ENVELOPE_CANDIDATES,
  MAX_ENVELOPE_DEPTH,
  MAX_REACTION_CONTENT_LENGTH,
  QORTAL_HUB_IMAGE_IDENTIFIER_MAX_LENGTH,
  QORTAL_HUB_IMAGE_NAME_MAX_LENGTH,
  QORTAL_HUB_IMAGE_SERVICES,
} from './chatText';
import {
  DEFAULT_LIST_LIMIT,
  DEFAULT_MAX_BYTES,
  DIRECT_MESSAGE_MAX_BYTES,
  isPrivateAttachmentDescriptor,
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
import {
  CHAT_ROUTE_QUERY_KEYS,
  DEVELOPERS_VIEW,
  DEVELOPERS_VIEW_ALIASES,
  isPlausibleQortiumAddress,
  parseChatView,
  parseDeepLinkSearch,
  VIEW_QUERY_PARAM,
} from './deepLink';
import { GENERAL_CHAT_GROUP_ID } from './generalChat';
import { LEGACY_HOME_PRE_BROADCAST_REFUSALS } from './legacyHome';
import { getMessageQdnResources, HUB_EMBED_SAFE_VALUE } from './messageLinks';
import { THREAD_CONTINUATION_WINDOW_MS } from './messageThreads';
import {
  CHAT_APP_LINK,
  CHAT_NOTIFICATION_TEXT_MAX_LENGTH,
  CHAT_NOTIFICATION_TITLE_MAX_LENGTH,
  DIRECT_MESSAGE_NOTIFICATION_ID,
} from './notifications';
import { SEND_CONFIRMATION_TIMEOUT_MS } from './pendingSends';
import { DEFAULT_NODE_API_URL, LOCAL_READ_ACTIONS } from './qdnRequest';
import { QDN_SERVICE_SUGGESTIONS } from './qdnServices';
import { normalizeQortalOutgoingMessage } from './qortalChatPayload';
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
import {
  DEFAULT_NODE_API_URL as QORTAL_DEFAULT_NODE_API_URL,
  LEGACY_QORTAL_ACTIONS,
  QORTAL_PUBLIC_READ_ACTIONS,
} from './qortalRequest';
import Reference, { formatBytes, formatDuration, getCopyStatusText, QORTAL_PUBLICATION, QORTIUM_PUBLICATION } from './Reference';
import {
  BRIDGE_ACTION_ROSTER,
  BRIDGE_ACTIONS,
  EXAMPLE_AMBIGUOUS_SEND_RESULT,
  EXAMPLE_ATTACHMENT_ENVELOPE,
  EXAMPLE_BRIDGE_ERROR,
  EXAMPLE_CHAT_MESSAGE_ROW,
  EXAMPLE_DELETE_ENVELOPE,
  EXAMPLE_DESCRIPTOR,
  EXAMPLE_DEVELOPERS_ROUTE,
  EXAMPLE_DIRECT_ROUTE,
  EXAMPLE_DIRECT_V2_DELETE,
  EXAMPLE_DIRECT_V2_ENVELOPE,
  EXAMPLE_FLAT_JSON_VISIBLE,
  EXAMPLE_GROUP_ROUTE,
  EXAMPLE_HUB_GROUP_DELETE,
  EXAMPLE_HUB_GROUP_ENVELOPE,
  EXAMPLE_HUB_GROUP_REACTION,
  EXAMPLE_JOURNAL,
  EXAMPLE_MACHINE_ENVELOPE,
  EXAMPLE_PLAIN_TEXT,
  EXAMPLE_QORTAL_SHARE_LINK,
  EXAMPLE_QORTIUM_SHARE_LINK,
  EXAMPLE_REACTION_ENVELOPE,
  EXAMPLE_RECIPIENT_ADDRESS,
  EXAMPLE_REPLY_ENVELOPE,
  EXAMPLE_SEND_RESULT,
  EXAMPLE_SENDER_ADDRESS,
  EXAMPLE_SHARE_RESOURCE,
  EXAMPLE_SHOW_NOTIFICATION_REQUEST,
  EXAMPLE_SIGNATURE,
  EXAMPLE_SPECIAL_ID,
  REFERENCE_SNIPPETS,
} from './referenceExamples';
import { REFERENCE_SECTIONS } from './ReferenceNavigation';

const APP_VERSION = 'v2.0.14-test';

function render() {
  return renderToStaticMarkup(<Reference appVersion={APP_VERSION} />);
}

// renderToStaticMarkup escapes text nodes; compare against the escaped form.
function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

function row(text: string) {
  return { data: encodeBase64(text), encoding: 'BASE64' as const, isEncrypted: false, isText: true };
}

function count(html: string, needle: string) {
  return html.split(needle).length - 1;
}

const html = render();

// Read from disk on purpose: vitest resolves `./styles.css?raw` to an empty
// string here (see networkTint.test.ts), and the app tsconfig deliberately
// excludes Node ambient types, hence the untyped dynamic import.
const nodeFsSpecifier = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ nodeFsSpecifier)) as {
  readFileSync: (path: URL, encoding: 'utf8') => string;
};
const stylesCss = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
const attachmentsDoc = readFileSync(new URL('../docs/CHAT_ATTACHMENTS.md', import.meta.url), 'utf8');

// Raw source of every non-test module under src/ (the reference and its
// examples excluded), keyed by './path'. Used to compare the printed bridge
// roster with the real `action: '…'` literals and to guard scroll behaviour.
const SOURCE_FILES = Object.fromEntries(
  Object.entries(
    import.meta.glob('./**/*.{ts,tsx}', { eager: true, import: 'default', query: '?raw' }) as Record<string, string>,
  ).filter(([path]) => !/\.test\.tsx?$/.test(path) && !/\/(Reference\.tsx|referenceExamples\.ts)$/.test(path)),
);

describe('Reference — root, language and sections', () => {
  it('is an English LTR island with the intentionally-English note and the version', () => {
    expect(html).toContain('class="developer-reference" dir="ltr" lang="en"');
    expect(html).toContain('This page intentionally remains in English');
    expect(html).toContain(`<code>${APP_VERSION}</code>`);
    expect(html).toContain(escapeHtml(QORTIUM_PUBLICATION));
    expect(html).toContain(escapeHtml(QORTAL_PUBLICATION));
  });

  it('renders every navigable section as a focusable landmark, in navigation order', () => {
    let lastIndex = -1;

    for (const [id, label] of REFERENCE_SECTIONS) {
      const index = html.indexOf(`<section class="reference-section" id="${id}" tabindex="-1">`);
      expect(index, `section ${id}`).toBeGreaterThan(lastIndex);
      expect(html).toContain(`href="/?view=developers#${id}"`);
      expect(html).toContain(escapeHtml(label));
      lastIndex = index;
    }

    expect(REFERENCE_SECTIONS.map(([id]) => id)).toEqual([
      'envelope',
      'machine-messages',
      'chains',
      'limits',
      'bridge',
      'outcomes',
      'discovery',
      'attachments',
    ]);
  });

  it('renders no escaped markup as visible text', () => {
    expect(html).not.toMatch(/&lt;\/?(code|strong|em|a)&gt;/);
  });

  it('never uses scrollIntoView anywhere in the workspace modules', () => {
    for (const file of ['./ReferenceNavigation.tsx', './Topbar.tsx']) {
      expect(SOURCE_FILES[file], file).toBeDefined();
      expect(SOURCE_FILES[file]).not.toMatch(/\.scrollIntoView\s*\(/);
    }
    for (const source of Object.values(SOURCE_FILES)) {
      expect(source).not.toMatch(/\.scrollIntoView\s*\(/);
    }
  });
});

describe('Reference — copy controls', () => {
  const snippetCount = Object.keys(REFERENCE_SNIPPETS).length;

  it('shows one visible polite status per example, idle by default, with a 44px control', () => {
    expect(count(html, 'class="reference-code__copy"')).toBe(snippetCount);
    expect(count(html, 'aria-live="polite" class="reference-copy-status" role="status"')).toBe(snippetCount);
    expect(count(html, escapeHtml(getCopyStatusText('idle', 'x')))).toBe(snippetCount);

    const css = stylesCss;
    expect(css.length).toBeGreaterThan(50_000);
    expect(css).toMatch(/\.reference-code__copy \{[^}]*min-height: 44px/);
    expect(css).toMatch(/\.reference-toc a \{[^}]*min-height: 44px/);
    expect(css).toMatch(/\.workspace-nav__tab \{[^}]*min-height: 44px/);
  });

  it('states copied, unavailable and idle outcomes in the fleet wording', () => {
    expect(getCopyStatusText('copied', 'reply envelope')).toBe('Copied reply envelope.');
    expect(getCopyStatusText('unavailable', 'reply envelope')).toBe(
      'Clipboard unavailable. Select the code and copy it manually.',
    );
    expect(getCopyStatusText('idle', 'reply envelope')).toBe('Code can be selected for manual copying.');
  });

  it('renders every snippet verbatim inside a selectable code block', () => {
    for (const [name, code] of Object.entries(REFERENCE_SNIPPETS)) {
      expect(html, `snippet ${name}`).toContain(`<code>${escapeHtml(code)}</code>`);
    }
    expect(count(html, '<pre aria-label=')).toBe(snippetCount);
    expect(count(html, 'tabindex="0"><code>')).toBe(snippetCount);
  });
});

describe('Reference — envelope examples round-trip through the real codecs', () => {
  it('uses example addresses that pass the deep-link address check', () => {
    expect(isPlausibleQortiumAddress(EXAMPLE_SENDER_ADDRESS)).toBe(true);
    expect(isPlausibleQortiumAddress(EXAMPLE_RECIPIENT_ADDRESS)).toBe(true);
  });

  it('decodes the printed chat row as a reply to the original signature', () => {
    expect(decodeChatMessage(EXAMPLE_CHAT_MESSAGE_ROW)).toEqual({
      body: 'Thanks, that worked.',
      kind: 'text',
      repliedTo: EXAMPLE_SIGNATURE,
    });
    expect(EXAMPLE_CHAT_MESSAGE_ROW.chatReference).toBeNull();
    expect(EXAMPLE_CHAT_MESSAGE_ROW.txGroupId).toBe(GENERAL_CHAT_GROUP_ID);
    expect(JSON.parse(EXAMPLE_REPLY_ENVELOPE)).toEqual({ message: 'Thanks, that worked.', repliedTo: EXAMPLE_SIGNATURE });
  });

  it('decodes the delete and reaction envelopes to the documented kinds', () => {
    expect(JSON.parse(EXAMPLE_DELETE_ENVELOPE)).toEqual({ message: '' });
    expect(decodeChatMessage(row(EXAMPLE_DELETE_ENVELOPE))).toEqual({ body: '', kind: 'text', repliedTo: null });
    expect(decodeChatMessage(row(EXAMPLE_REACTION_ENVELOPE))).toEqual({
      body: '',
      kind: 'reaction',
      reaction: { content: DEFAULT_REACTION_OPTIONS[0], contentState: true },
      repliedTo: null,
    });
    expect(JSON.parse(EXAMPLE_REACTION_ENVELOPE)).toMatchObject({ message: '', type: 'reaction' });
  });

  it('carries a descriptor that the real validator accepts', () => {
    expect(isPrivateAttachmentDescriptor(EXAMPLE_DESCRIPTOR)).toBe(true);
    expect(isPrivateAttachmentDescriptor({ ...EXAMPLE_DESCRIPTOR, ciphertext: { ...EXAMPLE_DESCRIPTOR.ciphertext, size: PRIVATE_ATTACHMENT_MAX_CIPHERTEXT_BYTES + 1 } })).toBe(false);

    const decoded = decodeChatMessage(row(EXAMPLE_ATTACHMENT_ENVELOPE));
    expect(decoded).toMatchObject({ body: 'Screenshot attached', kind: 'text', repliedTo: null });
    expect(decoded.attachments).toHaveLength(1);
    expect(isPrivateAttachmentDescriptor(decoded.attachments?.[0])).toBe(true);
    expect(PRIVATE_ATTACHMENT_CODECS).toContain(EXAMPLE_DESCRIPTOR.codec);
    expect(PRIVATE_ATTACHMENT_SERVICES).toContain(EXAMPLE_DESCRIPTOR.resource.service);
  });

  it('lifts the reply envelope into the Qortal builders and leaves other JSON as text', () => {
    expect(normalizeQortalOutgoingMessage(EXAMPLE_REPLY_ENVELOPE)).toEqual({
      repliedTo: EXAMPLE_SIGNATURE,
      text: 'Thanks, that worked.',
    });
    expect(normalizeQortalOutgoingMessage(EXAMPLE_FLAT_JSON_VISIBLE)).toEqual({
      repliedTo: null,
      text: EXAMPLE_FLAT_JSON_VISIBLE,
    });
  });
});

describe('Reference — machine-message skip rule', () => {
  it('hides the positive example and keeps the flat and quoted forms visible (depth 0 only)', () => {
    const machine = row(EXAMPLE_MACHINE_ENVELOPE);
    expect(decodeChatMessage(machine)).toMatchObject({ kind: 'machine', machineApp: 'chess' });
    expect(isMachineChatMessage(machine)).toBe(true);
    expect(isHiddenChatMessage(machine)).toBe(true);

    const flat = row(EXAMPLE_FLAT_JSON_VISIBLE);
    expect(isMachineChatMessage(flat)).toBe(false);
    expect(decodeChatMessage(flat)).toMatchObject({ body: EXAMPLE_FLAT_JSON_VISIBLE, kind: 'text' });

    const quoted = row(JSON.stringify({ message: EXAMPLE_MACHINE_ENVELOPE, repliedTo: EXAMPLE_SIGNATURE }));
    expect(isMachineChatMessage(quoted)).toBe(false);
    expect(decodeChatMessage(quoted)).toMatchObject({ kind: 'text', repliedTo: EXAMPLE_SIGNATURE });
  });

  it('prints the three conditions and the depth restriction', () => {
    expect(html).toContain('non-empty string <code>app</code>');
    expect(html).toContain('<em>no</em> string <code>message</code>');
    expect(html).toContain('at least one other key holds a plain object');
    expect(html).toContain('depth 0 of the unwrap only');
  });
});

describe('Reference — Qortal payload shapes', () => {
  it('produces the Hub v3 group shapes with the real builders and reads them back', () => {
    expect(JSON.parse(EXAMPLE_HUB_GROUP_ENVELOPE)).toMatchObject({
      images: [],
      isEdited: false,
      repliedTo: '',
      specialId: EXAMPLE_SPECIAL_ID,
      type: '',
      version: 3,
    });
    expect(decodeChatMessage(row(EXAMPLE_HUB_GROUP_ENVELOPE))).toMatchObject({ body: EXAMPLE_PLAIN_TEXT, kind: 'text' });

    expect(JSON.parse(EXAMPLE_HUB_GROUP_DELETE)).toEqual({
      images: [],
      isEdited: true,
      messageText: '<p></p>',
      repliedTo: '',
      specialId: EXAMPLE_SPECIAL_ID,
      type: 'edit',
      version: 3,
    });
    expect(decodeChatMessage(row(EXAMPLE_HUB_GROUP_DELETE))).toMatchObject({ body: '', kind: 'text' });

    expect(JSON.parse(EXAMPLE_HUB_GROUP_REACTION)).toEqual({
      content: DEFAULT_REACTION_OPTIONS[0],
      contentState: true,
      message: '',
      specialId: EXAMPLE_SPECIAL_ID,
      type: 'reaction',
    });
    expect(decodeChatMessage(row(EXAMPLE_HUB_GROUP_REACTION))).toMatchObject({
      kind: 'reaction',
      reaction: { content: DEFAULT_REACTION_OPTIONS[0], contentState: true },
    });
  });

  it('produces the direct v2 shapes and reads the reply and the six-key delete marker back', () => {
    expect(JSON.parse(EXAMPLE_DIRECT_V2_ENVELOPE)).toMatchObject({
      message: '<p>Thanks, that worked.</p>',
      repliedTo: EXAMPLE_SIGNATURE,
      specialId: EXAMPLE_SPECIAL_ID,
      type: '',
      version: 2,
    });
    expect(decodeChatMessage(row(EXAMPLE_DIRECT_V2_ENVELOPE))).toEqual({
      body: 'Thanks, that worked.',
      kind: 'text',
      repliedTo: EXAMPLE_SIGNATURE,
    });

    const deleteMarker = JSON.parse(EXAMPLE_DIRECT_V2_DELETE) as Record<string, unknown>;
    expect(Object.keys(deleteMarker).sort()).toEqual(['isEdited', 'message', 'repliedTo', 'specialId', 'type', 'version']);
    expect(deleteMarker).toMatchObject({ isEdited: true, message: '<p></p>', repliedTo: '', type: 'edit', version: 2 });
    expect(decodeChatMessage(row(EXAMPLE_DIRECT_V2_DELETE))).toMatchObject({ body: '', kind: 'text' });
  });

  it('prints the General Chat wrapper constants from qortalGeneralChat', () => {
    expect(html).toContain(`(transaction type ${CHAT_TRANSACTION_TYPE})`);
    expect(html).toContain(`MESSAGE (type ${MESSAGE_TRANSACTION_TYPE})`);
    expect(html).toContain(`byte offset ${CHAT_NONCE_OFFSET}`);
    expect(html).toContain(`difficulty ${CHAT_POW_DIFFICULTY} for the CHAT`);
    expect(html).toContain(`${MESSAGE_POW_DIFFICULTY} for the wrapper`);
    expect(html).toContain(`${formatDuration(POW_TIMEOUT_MS)} timeout`);
    expect(html).toContain(`${formatBytes(WRAPPER_FETCH_MAX_BYTES)} per fetch`);
    expect(html).toContain(`Data cap ${MAX_MESSAGE_DATA_BYTES} bytes`);
    for (const [from, to] of Object.entries(LEGACY_QORTAL_ACTIONS)) {
      expect(html).toContain(`${from} → ${to}`);
    }
  });
});

describe('Reference — limits are bound to implementation constants', () => {
  it('prints every limit from its export', () => {
    expect(html).toContain(`<code>${DIRECT_MESSAGE_MAX_BYTES} UTF-8 bytes</code>`);
    expect(html).toContain(`<code>${QORTAL_PRIVATE_GROUP_MAX_PLAINTEXT_BYTES} UTF-8 bytes</code>`);
    expect(html).toContain('<code>maxMessagePlaintextBytes</code></td><td>GET_PRIVATE_GROUP_CHAT_STATE');
    expect(html).toContain(`<code>${MAX_MESSAGE_DATA_BYTES} bytes</code>`);
    expect(html).toContain(`<code>1–${MAX_REACTION_CONTENT_LENGTH} characters</code>`);
    expect(html).toContain(`<code>${MAX_ENVELOPE_CANDIDATES}</code>`);
    expect(html).toContain(`<code>${formatBytes(PRIVATE_ATTACHMENT_MAX_CIPHERTEXT_BYTES)}</code>`);
    expect(html).toContain(`<code>${formatBytes(ATTACHMENT_FILE_MAX_BYTES)} / ${formatBytes(ATTACHMENT_IMAGE_MAX_BYTES)}</code>`);
    expect(html).toContain(`<code>${formatBytes(QDN_PUBLISH_SOURCE_MAX_BYTES)}</code>`);
    expect(html).toContain(`<code>${formatDuration(SOURCE_TOKEN_EXPIRY_MS)}</code>`);
    expect(html).toContain(`max width ${IMAGE_COMPRESSION_MAX_WIDTH}, quality ${IMAGE_COMPRESSION_QUALITY}`);
    expect(html).toContain(`${QDN_PUBLISH_NAME_MAX_BYTES.qortium} bytes Qortium / ${QDN_PUBLISH_NAME_MAX_BYTES.qortal} bytes Qortal`);
    expect(html).toContain(
      `${QDN_PUBLISH_IDENTIFIER_MAX_BYTES} / ${QDN_PUBLISH_TITLE_MAX_BYTES} / ${QDN_PUBLISH_DESCRIPTION_MAX_BYTES} / ${QDN_PUBLISH_CATEGORY_MAX_BYTES} bytes`,
    );
    expect(html).toContain(`≤ ${QDN_PUBLISH_TAGS_MAX_COUNT} tags of ≤ ${QDN_PUBLISH_TAG_MAX_BYTES} bytes`);
    expect(html).toContain(`<code>${formatBytes(DEFAULT_MAX_BYTES)}</code>`);
    expect(html).toContain(`<code>${RESOLVE_IDENTITIES_LIMIT} addresses</code>`);
    expect(html).toContain(`<code>${DEFAULT_LIST_LIMIT}</code>`);
    expect(html).toContain(`${CHAT_NOTIFICATION_TITLE_MAX_LENGTH} / ${CHAT_NOTIFICATION_TEXT_MAX_LENGTH} characters`);
    expect(html).toContain(`<code>${formatBytes(AVATAR_MAX_BYTES)}</code>`);
    expect(html).toContain(`Up to ${MAX_ENVELOPE_DEPTH} nested JSON levels`);
    expect(html).toContain(`within ${formatDuration(THREAD_CONTINUATION_WINDOW_MS)} group as a continuation`);
    expect(html).toContain(`name ≤ ${QORTAL_HUB_IMAGE_NAME_MAX_LENGTH} and identifier ≤ ${QORTAL_HUB_IMAGE_IDENTIFIER_MAX_LENGTH}`);
    expect(html).toContain([...QORTAL_HUB_IMAGE_SERVICES].sort().join(', '));
    expect(html).toContain(DEFAULT_REACTION_OPTIONS.join(' '));
  });

  it('formats byte and duration values the way the tables expect', () => {
    expect(formatBytes(PRIVATE_ATTACHMENT_MAX_CIPHERTEXT_BYTES)).toBe('1 MiB');
    expect(formatBytes(AVATAR_MAX_BYTES)).toBe('500 KiB');
    expect(formatBytes(DIRECT_MESSAGE_MAX_BYTES)).toBe(`${DIRECT_MESSAGE_MAX_BYTES} bytes`);
    expect(formatDuration(SEND_CONFIRMATION_TIMEOUT_MS)).toBe('2 min');
    expect(formatDuration(ACCOUNT_UNLOCK_STATE_CHANGE_TIMEOUT_MS)).toBe('2 s');
  });
});

describe('Reference — Home bridge', () => {
  it('lists exactly the actions Chat sends (no more, no fewer than the src literals)', () => {
    const literals = new Set<string>();
    expect(Object.keys(SOURCE_FILES).length).toBeGreaterThan(50);
    for (const source of Object.values(SOURCE_FILES)) {
      for (const match of source.matchAll(/action: '([A-Z][A-Z_]+)'/g)) {
        literals.add(match[1]);
      }
    }

    expect([...BRIDGE_ACTIONS].sort()).toEqual([...literals].sort());
    expect(new Set(BRIDGE_ACTIONS).size).toBe(BRIDGE_ACTIONS.length);
    for (const action of BRIDGE_ACTIONS) {
      expect(html, action).toContain(`<code>${action}</code>`);
    }
    for (const group of Object.keys(BRIDGE_ACTION_ROSTER)) {
      expect(html).toContain(`<dt>${escapeHtml(group)}</dt>`);
    }
  });

  it('describes discovery from the exported globals, fallbacks and probes', () => {
    expect(html).toContain(LOCAL_READ_ACTIONS.join(', '));
    expect(html).toContain(`<code>${DEFAULT_NODE_API_URL}</code>`);
    expect(html).toContain(`<code>${QORTAL_DEFAULT_NODE_API_URL}</code>`);
    expect(html).toContain(QORTAL_PUBLIC_READ_ACTIONS.join(', '));
    expect(html).toContain('<code>window._qdnContext</code>');
    expect(html).toContain('<code>GET_HOST_INFO</code> is never called');
    expect(html).toContain('<code>?homeV2Bridge=1</code>');
    expect(html).toContain(`for ${formatDuration(ACCOUNT_UNLOCK_STATE_CHANGE_TIMEOUT_MS)}`);
    expect(html).toContain(`<code>${CHAT_APP_LINK}</code>`);
    expect(html).toContain(`<code>${DIRECT_MESSAGE_NOTIFICATION_ID}</code>`);
    for (const pattern of LEGACY_HOME_PRE_BROADCAST_REFUSALS) {
      expect(html).toContain(escapeHtml(pattern.source));
    }
  });

  it('builds the SHOW_NOTIFICATION example with the real builder inside its caps', () => {
    expect(EXAMPLE_SHOW_NOTIFICATION_REQUEST.action).toBe('SHOW_NOTIFICATION');
    expect(EXAMPLE_SHOW_NOTIFICATION_REQUEST.title.length).toBeLessThanOrEqual(CHAT_NOTIFICATION_TITLE_MAX_LENGTH);
    expect(EXAMPLE_SHOW_NOTIFICATION_REQUEST.text.length).toBeLessThanOrEqual(CHAT_NOTIFICATION_TEXT_MAX_LENGTH);
  });
});

describe('Reference — confirmations and outcomes', () => {
  it('reads the printed error, journal and results through the real helpers', () => {
    expect(getBridgeErrorDetails(EXAMPLE_BRIDGE_ERROR)).toEqual({
      action: 'SEND_CHAT_MESSAGE',
      code: 'ACCOUNT_LOCKED',
      network: 'qortium',
      outcome: 'rejected',
      retryable: true,
    });
    expect(isDefiniteChatMutationRejection(EXAMPLE_BRIDGE_ERROR)).toBe(true);
    expect(BRIDGE_ERROR_CODES).toContain(EXAMPLE_BRIDGE_ERROR.code);

    const entries = filterChatJournalEntries(EXAMPLE_JOURNAL.entries);
    expect(entries).toHaveLength(1);
    expect(getJournalConversationKey('qortium', entries[0])).toBe(`group:${GENERAL_CHAT_GROUP_ID}`);
    expect(EXAMPLE_JOURNAL.version).toBe(1);

    expect(EXAMPLE_SEND_RESULT.outcome).toBeUndefined();
    expect(EXAMPLE_AMBIGUOUS_SEND_RESULT.outcome).toBe('ambiguous');
    expect(EXAMPLE_AMBIGUOUS_SEND_RESULT.signature).toBe(EXAMPLE_SEND_RESULT.signature);
  });

  it('prints the phases, the expiry window, the forget rule and every error code', () => {
    expect(html).toContain('pending → broadcast → confirmed | rejected | ambiguous | expired');
    expect(html).toContain(`Confirmation expiry: ${formatDuration(SEND_CONFIRMATION_TIMEOUT_MS)} after broadcast`);
    expect(html).toContain('only after the entry&#x27;s signature has been observed');
    expect(html).toContain('never because time passed');
    expect(html).toContain(BRIDGE_ERROR_CODES.join(', '));
    expect(html).toContain('<code>accepted-unsigned</code>');
    expect(html).toContain('<code>not-submitted</code>');
  });
});

describe('Reference — discovery, routes and links', () => {
  it('parses the printed deep links back through the route reader', () => {
    expect(parseDeepLinkSearch(new URL(EXAMPLE_GROUP_ROUTE, 'http://localhost').search)).toEqual({
      group: GENERAL_CHAT_GROUP_ID,
      network: 'qortium',
    });
    expect(parseDeepLinkSearch(new URL(EXAMPLE_DIRECT_ROUTE, 'http://localhost').search)).toEqual({
      address: EXAMPLE_RECIPIENT_ADDRESS,
      network: 'qortal',
    });

    const developers = new URL(EXAMPLE_DEVELOPERS_ROUTE, 'http://localhost');
    expect(parseChatView(developers.search)).toBe('developers');
    expect(developers.searchParams.get(VIEW_QUERY_PARAM)).toBe(DEVELOPERS_VIEW);
    expect(parseDeepLinkSearch(developers.search)).toEqual({ group: GENERAL_CHAT_GROUP_ID, network: 'qortium' });

    expect(html).toContain(`Conversation keys: ${CHAT_ROUTE_QUERY_KEYS.join(', ')}`);
    for (const alias of DEVELOPERS_VIEW_ALIASES) {
      expect(html).toContain(`<code>view=${alias}</code>`);
    }
  });

  it('parses the printed share links back into the same resource', () => {
    const [qortium] = getMessageQdnResources(EXAMPLE_QORTIUM_SHARE_LINK, 'qortium');
    expect(qortium).toMatchObject({ ...EXAMPLE_SHARE_RESOURCE, network: 'qortium' });

    const [qortal] = getMessageQdnResources(EXAMPLE_QORTAL_SHARE_LINK, 'qortal');
    expect(qortal).toMatchObject({ ...EXAMPLE_SHARE_RESOURCE, network: 'qortal' });
    expect(EXAMPLE_QORTAL_SHARE_LINK.startsWith('qortal://use-embed/')).toBe(true);
    for (const value of Object.values(EXAMPLE_SHARE_RESOURCE)) {
      expect(HUB_EMBED_SAFE_VALUE.test(value)).toBe(true);
    }
    expect(html).toContain(escapeHtml(HUB_EMBED_SAFE_VALUE.source));
    expect(html).toContain(QDN_SERVICE_SUGGESTIONS.join(', '));
  });

  it('labels the 24 h retention figure as Core’s default with no app constant', () => {
    expect(html).toContain('expire about 24 hours after');
    expect(html).toContain('Core&#x27;s default');
    expect(html).toContain('not an app constant');
    expect(html).toContain('coalesced orphan row');
  });
});

describe('Reference — attachments summary', () => {
  it('matches docs/CHAT_ATTACHMENTS.md on identifiers, services, codecs and caps', () => {
    expect(attachmentsDoc).toContain('PRIVATE_ATTACHMENT_MAX_CIPHERTEXT_BYTES');
    expect(attachmentsDoc).toContain('MAX_ENVELOPE_CANDIDATES');
    expect(html).toContain('qtm-chat_group_{groupId}_{timestamp base36}-{6 random}');
    expect(html).toContain(PRIVATE_ATTACHMENT_CODECS.join(', '));
    expect(html).toContain(PRIVATE_ATTACHMENT_SERVICES.join(', '));
    expect(html).toContain(`size is 1 byte to ${formatBytes(PRIVATE_ATTACHMENT_MAX_CIPHERTEXT_BYTES)}`);
    expect(html).toContain(`at most ${MAX_ENVELOPE_CANDIDATES} per message`);
    expect(html).toContain('Edits never carry new attachments');
    expect(html).toContain('<code>STAGE_QDN_PUBLISH_SOURCE</code>');
    expect(EXAMPLE_DESCRIPTOR.resource.identifier.startsWith('qtm-chat_group_12_')).toBe(true);
  });
});
