// Attachment capability ladder (attachments-matrix Phase A1).
//
// Chat runs on several hosts that expose very different ways of getting file
// bytes onto QDN, and the composer must feature-detect them from the host's
// advertised action list — never from a host name or version string:
//
// | Host                       | SELECT_QDN_PUBLISH_SOURCE | PUBLISH_QDN_RESOURCE inline bytes | PUBLISH_CHAT_ATTACHMENT |
// | Home 1.x ≤1.2              | no                        | yes (`base64` + `filename`)       | no                      |
// | Home 1.x ≥1.3 (…1.8)       | yes                       | yes                               | no                      |
// | Home 2 desktop + Android   | yes                       | NO — denylisted, throws           | yes                     |
// | Home 2.2+ (home#495)       | yes (+STAGE_QDN_PUBLISH_SOURCE for app-held bytes)            | yes                     |
// | Qortal Hub                 | no                        | yes (`data64`/`base64`/`file`)    | no                      |
// | Gateway / plain browser    | no                        | no                                | no                      |
//
// Two sources therefore exist for an open-group attachment:
//
// - 'picker': Home's native file dialog hands back a short-lived sourceToken
//   (the P4 flow). The app never sees bytes, so paste/drop cannot feed it.
// - 'bytes':  the app reads a File itself (paperclip <input type="file">,
//   clipboard paste, drag-drop), compresses images, and sends base64 inline.
//   This is the pre-P4 flow, kept as the fallback for every host that still
//   accepts inline bytes — and the ONLY way paste/drop can stage anything.
//
// Private conversations (closed groups, direct chats) need Home's encrypted
// PUBLISH_CHAT_ATTACHMENT, which only the picker can feed; there is no bytes
// fallback for them (Home 1.x never had encrypted attachments, and Hub's
// private descriptors are a different contract).

import type { QdnAction } from './types';

export type AttachmentSource = 'bytes' | 'picker';

/** How a pasted/dropped local File gets to the host (B3):
 *  'inline' — the app publishes base64 directly (Home 1.x, Hub);
 *  'stage'  — the app stages bytes via STAGE_QDN_PUBLISH_SOURCE and redeems
 *             the returned sourceToken like a picker selection (Home 2.2+). */
export type LocalFileMode = 'inline' | 'stage';

export type AttachmentCapability = {
  /** Paste/drag-drop can stage a local File. */
  canStageLocalFile: boolean;
  /** How a local File reaches the host, when canStageLocalFile is true. */
  localFileMode: LocalFileMode | null;
  /** Source the paperclip uses for a private conversation, or null when unavailable. */
  privateSource: 'picker' | null;
  /** Source the paperclip uses for an open group, or null when unavailable. */
  publicSource: AttachmentSource | null;
};

function has(actions: readonly QdnAction[] | undefined, action: string) {
  const wanted = action.toUpperCase();

  return actions?.some((candidate) => candidate.toUpperCase() === wanted) ?? false;
}

/**
 * Whether PUBLISH_QDN_RESOURCE on this host accepts the inline
 * `base64` + `filename` source (every Home 1.x, Home 2 Android, Qortal Hub) or
 * only a Home-issued sourceToken (Home 2 desktop).
 *
 * Heuristic (tracker decision D1): Home 2 is the only host that refuses
 * inline bytes, and it is also the only host that advertises
 * PUBLISH_CHAT_ATTACHMENT — so that action doubles as the "token-only"
 * marker. No probe request is made. If a future host breaks the pairing,
 * this one function is the place to change; every caller goes through it.
 */
export function hostAcceptsInlinePublishBytes(actions: readonly QdnAction[] | undefined): boolean {
  return has(actions, 'PUBLISH_QDN_RESOURCE') && !has(actions, 'PUBLISH_CHAT_ATTACHMENT');
}

export function hostOffersPublishPicker(actions: readonly QdnAction[] | undefined): boolean {
  return has(actions, 'PUBLISH_QDN_RESOURCE') && has(actions, 'SELECT_QDN_PUBLISH_SOURCE');
}

/** Home ships STAGE_QDN_PUBLISH_SOURCE (home#495): the app hands over bytes
 *  it already holds and receives an ordinary publish sourceToken back. */
export function hostStagesAppBytes(actions: readonly QdnAction[] | undefined): boolean {
  return has(actions, 'STAGE_QDN_PUBLISH_SOURCE');
}

export function resolveAttachmentCapability(input: {
  actions: readonly QdnAction[] | undefined;
  /** The sender has a registered name on this network (open-group publishes need one). */
  hasPublisherName: boolean;
  isOpenGroup: boolean;
  isPrivateConversation: boolean;
}): AttachmentCapability {
  const { actions } = input;
  const acceptsBytes = hostAcceptsInlinePublishBytes(actions);
  const stagesBytes = hostStagesAppBytes(actions);

  // The picker is preferred when both exist (Home 1.3–1.8): Home shows its own
  // approval prompt with the real file and never needs the app to hold bytes.
  // The bytes path still serves paste/drop on that host.
  const publicSource: AttachmentSource | null =
    input.isOpenGroup && input.hasPublisherName
      ? hostOffersPublishPicker(actions)
        ? 'picker'
        : acceptsBytes
          ? 'bytes'
          : null
      : null;

  const privateSource: 'picker' | null =
    input.isPrivateConversation &&
    has(actions, 'PUBLISH_CHAT_ATTACHMENT') &&
    has(actions, 'SELECT_QDN_PUBLISH_SOURCE')
      ? 'picker'
      : null;

  // Staged bytes ride the normal token pipeline, so they serve BOTH the
  // public paperclip path and private conversations (PUBLISH_CHAT_ATTACHMENT
  // redeems the same token). Inline bytes remain public-only.
  const localFileMode: LocalFileMode | null =
    publicSource !== null || privateSource !== null
      ? stagesBytes
        ? 'stage'
        : acceptsBytes && publicSource !== null
          ? 'inline'
          : null
      : null;

  return {
    canStageLocalFile: localFileMode !== null,
    localFileMode,
    privateSource,
    publicSource,
  };
}
