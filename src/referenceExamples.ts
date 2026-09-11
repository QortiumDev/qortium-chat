// Copyable examples for the Developers reference. Every wire example is
// produced by the same builder the app uses to send it (or typed against the
// same type the app reads), so the reference cannot drift from the codecs:
// reference.test.tsx parses each one back through the real readers.
import { buildChatMessageText, buildDeletedMessageText, buildReactionMessageText, encodeBase64 } from './chatText';
import { getChatViewUrl } from './deepLink';
import { buildQdnResourceShareLink } from './messageLinks';
import { buildShowChatNotificationRequest } from './notifications';
import {
  buildQortalDirectChatDeletePayload,
  buildQortalDirectChatPayload,
  buildQortalHubGroupChatDeletePayload,
  buildQortalHubGroupChatPayload,
  buildQortalHubGroupChatReactionPayload,
} from './qortalChatPayload';
import type {
  ChatMessage,
  ChatSendResult,
  PendingBridgeTransactionsResult,
  PrivateAttachmentDescriptor,
} from './types';

// Base58 (no 0, O, I, l), Q-prefixed, 33 characters: passes the same address
// check Chat applies to deep links and direct-chat targets.
export const EXAMPLE_SENDER_ADDRESS = 'QReferenceSenderAddress1111111111';
export const EXAMPLE_RECIPIENT_ADDRESS = 'QReferenceRecipientAddress111111111';
export const EXAMPLE_SIGNATURE = '3ReferenceSignatureOfTheOriginalMessage111111111111111111111111111111111111111111111';
export const EXAMPLE_SPECIAL_ID = '2b1a7d0e-3c4f-4a5b-8c6d-9e0f1a2b3c4d';
export const EXAMPLE_TIMESTAMP = 1757462400000;

export const EXAMPLE_DESCRIPTOR: PrivateAttachmentDescriptor = {
  ciphertext: {
    algorithm: 'SHA-256',
    hash: '5f1e3a9c0b7d2e4f6a8c1b3d5e7f9a0c2e4d6f8a1b3c5d7e9f0a2c4e6b8d0f1a',
    size: 48213,
    transactionSignature: EXAMPLE_SIGNATURE,
  },
  codec: 'qenc-v2-group',
  conversation: { groupId: 12, kind: 'group' },
  encrypted: true,
  network: 'qortium',
  resource: {
    identifier: 'qtm-chat_group_12_mf1x2y3z-a1b2c3',
    name: 'ReferenceSender',
    service: 'IMAGE',
  },
  version: 1,
};

// --- Chat's own text envelopes (both chains) --------------------------------

export const EXAMPLE_PLAIN_TEXT = 'Hello from Chat';
export const EXAMPLE_REPLY_ENVELOPE = buildChatMessageText('Thanks, that worked.', EXAMPLE_SIGNATURE);
export const EXAMPLE_ATTACHMENT_ENVELOPE = buildChatMessageText('Screenshot attached', null, [EXAMPLE_DESCRIPTOR]);
export const EXAMPLE_DELETE_ENVELOPE = buildDeletedMessageText();
export const EXAMPLE_REACTION_ENVELOPE = buildReactionMessageText('👍', true);

// --- Machine messages --------------------------------------------------------

export const EXAMPLE_MACHINE_ENVELOPE = JSON.stringify({ app: 'chess', move: { from: 'e2', san: 'e4', to: 'e4' } });
export const EXAMPLE_FLAT_JSON_VISIBLE = JSON.stringify({ app: 'chess', name: 'A flat object of strings stays visible' });

// --- Qortal payload shapes ---------------------------------------------------

export const EXAMPLE_HUB_GROUP_ENVELOPE = buildQortalHubGroupChatPayload(
  { repliedTo: null, text: EXAMPLE_PLAIN_TEXT },
  EXAMPLE_SPECIAL_ID,
);
export const EXAMPLE_HUB_GROUP_DELETE = buildQortalHubGroupChatDeletePayload(EXAMPLE_SPECIAL_ID);
export const EXAMPLE_HUB_GROUP_REACTION = buildQortalHubGroupChatReactionPayload('👍', true, EXAMPLE_SPECIAL_ID);
export const EXAMPLE_DIRECT_V2_ENVELOPE = buildQortalDirectChatPayload(
  { repliedTo: EXAMPLE_SIGNATURE, text: 'Thanks, that worked.' },
  EXAMPLE_SPECIAL_ID,
);
export const EXAMPLE_DIRECT_V2_DELETE = buildQortalDirectChatDeletePayload(EXAMPLE_SPECIAL_ID);

// --- Node rows and bridge shapes ---------------------------------------------

export const EXAMPLE_CHAT_MESSAGE_ROW: ChatMessage = {
  chatReference: null,
  data: encodeBase64(EXAMPLE_REPLY_ENVELOPE),
  encoding: 'BASE64',
  isEncrypted: false,
  isText: true,
  recipient: null,
  recipientName: null,
  sender: EXAMPLE_SENDER_ADDRESS,
  senderName: 'ReferenceSender',
  signature: '4ReferenceSignatureOfThisReply11111111111111111111111111111111111111111111111111111',
  timestamp: EXAMPLE_TIMESTAMP,
  txGroupId: 0,
};

export const EXAMPLE_SEND_CHAT_MESSAGE_REQUEST = {
  action: 'SEND_CHAT_MESSAGE',
  groupId: 0,
  message: EXAMPLE_REPLY_ENVELOPE,
  txGroupId: 0,
};

export const EXAMPLE_SEND_CHAT_EDIT_REQUEST = {
  action: 'SEND_CHAT_EDIT',
  chatReference: EXAMPLE_SIGNATURE,
  groupId: 0,
  message: 'Thanks, that worked (edited).',
  txGroupId: 0,
};

export const EXAMPLE_SEND_RESULT: ChatSendResult = {
  signature: EXAMPLE_CHAT_MESSAGE_ROW.signature as string,
  timestamp: EXAMPLE_TIMESTAMP,
};

export const EXAMPLE_AMBIGUOUS_SEND_RESULT: ChatSendResult = {
  error: 'Broadcast timed out after signing.',
  errorType: 'BROADCAST_UNKNOWN',
  outcome: 'ambiguous',
  signature: EXAMPLE_CHAT_MESSAGE_ROW.signature as string,
  timestamp: EXAMPLE_TIMESTAMP,
};

export const EXAMPLE_BRIDGE_ERROR = {
  action: 'SEND_CHAT_MESSAGE',
  code: 'ACCOUNT_LOCKED',
  network: 'qortium',
  outcome: 'rejected',
  retryable: true,
};

export const EXAMPLE_JOURNAL: PendingBridgeTransactionsResult = {
  entries: [
    {
      action: 'SEND_CHAT_MESSAGE',
      createdAt: EXAMPLE_TIMESTAMP,
      network: 'qortium',
      signature: EXAMPLE_CHAT_MESSAGE_ROW.signature as string,
      target: { groupId: 0, kind: 'group' },
      timestamp: EXAMPLE_TIMESTAMP,
    },
  ],
  network: 'qortium',
  version: 1,
};

export const EXAMPLE_SHOW_NOTIFICATION_REQUEST = buildShowChatNotificationRequest({
  source: { conversation: { groupId: 0, kind: 'group' }, kind: 'chat' },
  text: 'ReferenceSender: Hello from Chat',
  title: 'General Chat',
});

// --- Discovery: routes, links ------------------------------------------------

export const EXAMPLE_ROUTE_LOCATION = { hash: '', pathname: '/render/APP/Chat/Chat', search: '?group=0&network=qortium' };
export const EXAMPLE_DEVELOPERS_ROUTE = getChatViewUrl('developers', EXAMPLE_ROUTE_LOCATION);
export const EXAMPLE_GROUP_ROUTE = `${EXAMPLE_ROUTE_LOCATION.pathname}${EXAMPLE_ROUTE_LOCATION.search}`;
export const EXAMPLE_DIRECT_ROUTE = `${EXAMPLE_ROUTE_LOCATION.pathname}?address=${EXAMPLE_RECIPIENT_ADDRESS}&network=qortal`;

export const EXAMPLE_SHARE_RESOURCE = { identifier: 'qtm-chat_group_0_mf1x2y3z-a1b2c3', name: 'ReferenceSender', service: 'IMAGE' };
export const EXAMPLE_QORTIUM_SHARE_LINK = buildQdnResourceShareLink('qortium', EXAMPLE_SHARE_RESOURCE);
export const EXAMPLE_QORTAL_SHARE_LINK = buildQdnResourceShareLink('qortal', EXAMPLE_SHARE_RESOURCE);

function pretty(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function prettyJsonText(value: string) {
  try {
    return pretty(JSON.parse(value) as unknown);
  } catch {
    return value;
  }
}

export const REFERENCE_SNIPPETS = {
  attachmentEnvelope: prettyJsonText(EXAMPLE_ATTACHMENT_ENVELOPE),
  bridgeError: pretty(EXAMPLE_BRIDGE_ERROR),
  chatMessageRow: pretty(EXAMPLE_CHAT_MESSAGE_ROW),
  deleteEnvelope: EXAMPLE_DELETE_ENVELOPE,
  descriptor: pretty(EXAMPLE_DESCRIPTOR),
  directV2Delete: prettyJsonText(EXAMPLE_DIRECT_V2_DELETE),
  directV2Envelope: prettyJsonText(EXAMPLE_DIRECT_V2_ENVELOPE),
  flatJsonVisible: EXAMPLE_FLAT_JSON_VISIBLE,
  hubGroupDelete: prettyJsonText(EXAMPLE_HUB_GROUP_DELETE),
  hubGroupEnvelope: prettyJsonText(EXAMPLE_HUB_GROUP_ENVELOPE),
  hubGroupReaction: prettyJsonText(EXAMPLE_HUB_GROUP_REACTION),
  journal: pretty(EXAMPLE_JOURNAL),
  machineEnvelope: EXAMPLE_MACHINE_ENVELOPE,
  reactionEnvelope: EXAMPLE_REACTION_ENVELOPE,
  replyEnvelope: EXAMPLE_REPLY_ENVELOPE,
  routes: [EXAMPLE_GROUP_ROUTE, EXAMPLE_DIRECT_ROUTE, EXAMPLE_DEVELOPERS_ROUTE].join('\n'),
  sendChatEditRequest: pretty(EXAMPLE_SEND_CHAT_EDIT_REQUEST),
  sendChatMessageRequest: pretty(EXAMPLE_SEND_CHAT_MESSAGE_REQUEST),
  sendResultAmbiguous: pretty(EXAMPLE_AMBIGUOUS_SEND_RESULT),
  sendResultSigned: pretty(EXAMPLE_SEND_RESULT),
  shareLinks: [EXAMPLE_QORTIUM_SHARE_LINK, EXAMPLE_QORTAL_SHARE_LINK].join('\n'),
  showNotificationRequest: pretty(EXAMPLE_SHOW_NOTIFICATION_REQUEST),
} as const;

export type ReferenceSnippetName = keyof typeof REFERENCE_SNIPPETS;

// Every bridge action Chat sends, grouped by purpose. reference.test.tsx
// checks this roster against the `action: '…'` literals in src/ so a new or
// removed action fails the build until the reference is updated.
export const BRIDGE_ACTION_ROSTER = {
  'Capability, identity and node reads': [
    'SHOW_ACTIONS',
    'WHICH_UI',
    'IS_USING_PUBLIC_NODE',
    'FETCH_NODE_API',
    'GET_NODE_STATUS',
    'GET_SELECTED_ACCOUNT',
    'UNLOCK_SELECTED_ACCOUNT',
    'GET_USER_ACCOUNT',
    'GET_PRIMARY_NAME',
    'GET_ACCOUNT_NAMES',
    'GET_NAME_DATA',
    'RESOLVE_IDENTITIES',
    'GET_MINTING_STATUS',
  ],
  'Groups and membership': [
    'LIST_GROUPS',
    'SEARCH_GROUPS',
    'GET_GROUP',
    'GET_ACCOUNT_GROUPS',
    'GET_GROUP_MEMBERS',
    'GET_GROUP_JOIN_REQUESTS',
    'GET_ACCOUNT_GROUP_JOIN_REQUESTS',
    'GET_ADMIN_GROUP_JOIN_REQUESTS',
    'JOIN_GROUP',
    'LEAVE_GROUP',
    'APPROVE_GROUP_JOIN_REQUEST',
    'GROUP_APPROVAL',
    'START_MINTING',
  ],
  'Public group chat': ['GET_ACTIVE_CHATS', 'SEARCH_CHAT_MESSAGES', 'SEND_CHAT_MESSAGE', 'SEND_CHAT_EDIT', 'SEND_CHAT_DELETE', 'SEND_CHAT_REACTION'],
  'Direct chat': [
    'GET_PRIVATE_DIRECT_ACTIVE_CHATS',
    'SEARCH_PRIVATE_DIRECT_CHAT_MESSAGES',
    'SEND_DIRECT_CHAT_MESSAGE',
    'SEND_DIRECT_CHAT_EDIT',
    'SEND_DIRECT_CHAT_DELETE',
    'SEND_DIRECT_CHAT_REACTION',
  ],
  'Private group chat': [
    'GET_PRIVATE_GROUP_ACTIVE_CHATS',
    'GET_PRIVATE_GROUP_CHAT_STATE',
    'SEARCH_PRIVATE_GROUP_CHAT_MESSAGES',
    'SEND_PRIVATE_GROUP_CHAT_MESSAGE',
    'SEND_PRIVATE_GROUP_CHAT_EDIT',
    'SEND_PRIVATE_GROUP_CHAT_DELETE',
    'SEND_PRIVATE_GROUP_CHAT_REACTION',
    'REQUEST_PRIVATE_GROUP_CHAT_KEY',
    'RESOLVE_PRIVATE_GROUP_CHAT_KEY_REQUESTS',
    'ROTATE_PRIVATE_GROUP_CHAT_KEY',
  ],
  'QDN resources and attachments': [
    'SELECT_QDN_PUBLISH_SOURCE',
    'STAGE_QDN_PUBLISH_SOURCE',
    'PUBLISH_QDN_RESOURCE',
    'PUBLISH_CHAT_ATTACHMENT',
    'GET_CHAT_ATTACHMENT_STREAM_URL',
    'OPEN_CHAT_ATTACHMENT_VIEWER',
    'SAVE_CHAT_ATTACHMENT',
    'FETCH_QDN_RESOURCE',
    'GET_QDN_RESOURCE_METADATA',
    'GET_QDN_RESOURCE_PROPERTIES',
    'GET_QDN_RESOURCE_URL',
    'GET_QDN_RESOURCE_STREAM_URL',
    'OPEN_QDN_RESOURCE_VIEWER',
    'OPEN_QDN_MEDIA_PLAYER',
    'OPEN_QDN_DOCUMENT_VIEWER',
    'SAVE_QDN_RESOURCE',
    'OPEN_NEW_TAB',
    'FETCH_ACCOUNT_AVATAR',
    'FETCH_GROUP_AVATAR',
  ],
  'Journal, notifications and signing': [
    'GET_PENDING_TRANSACTIONS',
    'FORGET_PENDING_TRANSACTION',
    'NOTIFICATION_HAS_PERMISSION',
    'NOTIFICATION_ADD',
    'NOTIFICATION_REMOVE',
    'SHOW_NOTIFICATION',
    'SIGN_TRANSACTION',
  ],
} as const;

export const BRIDGE_ACTIONS = Object.values(BRIDGE_ACTION_ROSTER).flat() as readonly string[];
