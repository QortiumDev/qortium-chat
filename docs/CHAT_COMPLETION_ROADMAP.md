# Dual-chain Chat completion roadmap

Status: working roadmap, 2026-08-16

This roadmap completes the existing CHAT experience on Qortium and Qortal before
Reticulum/RCHAT work resumes. The target is one coherent Chat app in Qortium
Home, with public and private groups, direct messages, membership actions,
avatars, replies, edits, deletes, reactions, and embeds behaving consistently.

Every completed capability must work in the same tranche on:

- desktop and Android;
- a local node, an authenticated or unauthenticated custom node, and a public
  node that exposes the documented public prerequisites; and
- Qortium and Qortal, except where a protocol genuinely has no interoperable
  equivalent and that limitation is explicitly documented.

The user's normal live testing is continuous product feedback, not a separate
acceptance phase or a reason to defer automated contract coverage.

Home cannot force an independently operated node to expose an endpoint that its
operator has disabled. In that case it must report the exact missing capability;
it must not silently use another network or pretend that the feature succeeded.

## Ownership and safety boundaries

Chat owns conversation state, network-qualified presentation, protocol payload
codecs, capability-gated controls, and bounded rendering. Home owns account
selection, private keys, signing, proof of work, encryption and decryption,
private-chat authorization, native file access, publishing, and native viewers.
Chat must never receive reusable private, group, or content keys.

Home must decode and attest every target-critical field before signing any
node-provided unsigned bytes: network/domain, selected sender, recipient or
group, payload/hash, transaction reference, timestamp, fee, and proof-of-work
rules. It must recheck app, tab, account, network, and node-route authority after
approval and immediately before signing and broadcasting. Node-staged QDN
publishes require equivalent content attestation.

All conversation, identity, avatar, and resource objects must carry their
network. No operation may silently default a Qortal object to Qortium. Feature
availability must come from advertised capabilities, not Home version sniffing.
Reticulum remains a distinct future source/action family; it must not be
overloaded onto the legacy Qortium or Qortal CHAT actions.

## Completion matrix

| Capability | Qortium today | Qortal today | Chat can do now | Home, and sometimes Core, required |
| --- | --- | --- | --- | --- |
| Joined/open groups | History, pagination, live updates, send, replies, membership-first navigation, and discovery; Home 1 still has a custom-remote send-routing gap | Joined/open history, polling, send, replies, and discovery; no older-history paging | Active-chat previews and unread state, pagination, roster routing, persisted selection, and network-qualified links | Portable join/leave/invite/admin actions on both bridges, plus correction of the Home 1 custom-remote send route |
| Closed/private groups | Read and send through Home 1 local/trusted compatibility actions; not portable to public nodes | Not implemented | Shared private-conversation UI, status, and capability gates | Qortium: portable Home QPGC crypto plus a bounded public Core control-envelope read API. Qortal: exact Hub key-bundle and `encryptSingle` compatibility in Home |
| Direct messages | Read, send, pagination, replies, edits, deletes, and reactions through the current Home 1 local/trusted Qortium path; public-node portability is incomplete | Not implemented | Network-qualified direct rail, storage, routes, and shared presentation | Home-owned QDM1 and Qortal DM lookup, encryption/decryption, send, active-list, and search actions for every node route |
| Replies | Groups and DMs | Open groups | Preserve shared projection and build exact network payloads | Reused by new DM/private actions; no new standalone action needed |
| Edits and deletes | Work in Home 1; Home 2 currently drops `chatReference` and can turn revisions into new messages | Disabled; delete interoperability still needs a frozen Hub contract | Keep same-sender authorization and implement exact Qortal Hub edit envelopes | Preserve a validated transaction `chatReference` end-to-end and advertise the capability. Do not claim Qortal delete until an interoperable trace/spec is frozen |
| Emoji reactions | Groups and DMs in the existing Qortium path; broken through Home 2 for the same reference reason | Disabled | Build/project exact per-network reaction envelopes | Same `chatReference` bridge tranche as edits |
| Membership and administration | Home 1 actions exist but are not portable across all node routes; Home 2 writes are deferred | Reads only | Consistent member/role UI and action gating | Portable join, leave, invite, approval, ban, kick, and role actions as needed by Chat; advanced administration may open Groups |
| User avatars | Qortium account avatars work | Currently resolved through the wrong-chain profile path or initials | Key profile caches by `(network,address)` and resolve Qortal primary names plus `THUMBNAIL/<name>/qortal_avatar` | Normalized read actions are desirable in Home 2; Qortal avatar publishing is a later Home write action |
| Group avatars | Current Home 1 exposes the read action, but Chat renders initials | Not rendered; established resource convention exists | Display Qortium and Qortal group avatars with bounded visible-row caching and initials fallback | Add Home 2 group-avatar parity; authoring/publishing stays with Home/Groups |
| Public embeds | QDN image preview, media viewer, document viewer/save, and open-group public upload work in Home 1 | A legacy `qdn://` link is tokenized but its viewer/fetch/save/navigation helpers use Qortium actions and can use the wrong chain; native `qortal://` is not parsed; Hub `images` are discarded; Home 2 lacks viewer/save parity | Make every resource operation network-aware; define native and contextual link rules; parse Hub image descriptors and safe string/HTML variants; add bounded cards and small previews | Unified Qortal viewer, stream, save, and publish support, particularly Android ranged media and Home 2 binary handling |
| Private embeds | A public link can be placed in encrypted text, but the resource remains public | Same limitation | Render an explicit encrypted attachment descriptor once defined; never label a public resource private | Home-owned encrypted upload, key wrapping, authorized decrypt, and bounded view/stream contracts for each DM/private-group protocol |
| Notifications and mentions | Existing Qortium direct, mention, and reply foundations | Cross-chain group/direct behavior is incomplete | Network-qualify read watermarks, mentions, and in-app notification state | Advertise and implement safe background events for both chains without exposing message plaintext |
| Send lifecycle | Broadcast/pending handling exists but still has confirmation ambiguity | Same product problem on the current open-group path | One network-qualified pending model with safe retry and duplicate prevention | Return stable broadcast identity and status needed to reconcile pending, confirmed, rejected, and expired sends |

## Work that can start in Chat now

### 1. Qortal read and navigation parity

- Wire Qortal active-chat results into safe previews; keep read watermarks and
  unread-count ownership in Chat.
- Page older Qortal group history instead of stopping after the first page.
- Route group rosters through the selected network.
- Persist and restore network-qualified group and direct selections.
- Make deep links include the network and conversation kind.
- Keep unsupported write controls hidden until Home advertises them.

The same tranche should normalize the send lifecycle on both chains:
`pending -> broadcast -> confirmed`, with explicit rejected/expired states,
stable signature-based reconciliation, bounded retry, and duplicate prevention.
Closing/reopening Chat, switching nodes, or receiving a delayed history result
must not turn one user intent into two posts.

### 2. Network-scoped identity and avatars

- Replace address-only profile caching with `(network,address)` keys.
- Resolve Qortium account and group avatars through the existing Home actions.
- Resolve Qortal account avatars from the primary-name `qortal_avatar`
  thumbnail and group avatars from
  `qortal_group_avatar_<groupId>` under the owner's primary name.
- Reserve stable avatar layout slots and use bounded loading, byte validation,
  and initials fallback on desktop and Android.

The current Qortium avatar contract is a mutable explicit
`{service,name,identifier}` pointer resolved to the latest revision. Older issue
text describing signature-lifetime avatar caching is stale and must be corrected
before implementation.

### 3. Network-aware public embeds

- Introduce one internal resource descriptor containing `network`, `service`,
  `name`, `identifier`, optional `path`, filename, MIME type, and size.
- Treat a legacy bare `qdn://` link as belonging to its source conversation;
  new copied descriptors must encode the network explicitly.
- Parse and preserve pinned Qortal Hub `images` descriptors rather than
  discarding them. Decode and sanitize the observed structured, string, and HTML
  body variants without rendering raw HTML.
- Keep image previews user-initiated and bounded. Reject unsafe inline SVG/HTML,
  validate bytes and MIME type, and keep external HTTP previews opt-in to avoid
  leaking a reader's IP or activity.
- Use Home's viewer/stream/save capabilities when advertised. Do not buffer
  large audio or video into an unbounded base64 response.
- Add compact title/description cards without auto-fetching arbitrary web pages.
- Make app/resource navigation network-aware so a Qortal resource can never be
  opened or fetched from Qortium by accident.
- Validate all service/name/identifier/path lengths and traversal/query behavior
  before passing an attacker-controlled resource descriptor to Home.

### 4. Conversation-model cleanup

Extract the network-qualified conversation, capability, rail, header, composer,
and resource models before adding another full protocol path. Close issues whose
current behavior is already implemented (#29 membership-first navigation and
#30 member Direct/Mention actions), retain #38 for evidence-based revision
identity investigation, and implement #31 and #55 under the corrected contracts.

## Required bridge contract

Names below describe the normalized contract. Home may retain compatibility
aliases internally, but Chat should consume one capability-driven interface.

### Capability discovery

Add `GET_CHAT_CAPABILITIES`, scoped to the selected account, authoritative
bridge network, current node route, and platform. It should advertise exact
primitives rather than broad feature booleans, including:

- public-group read, send, reply, revise, react, and each supported membership or
  administration mutation;
- direct read, send, revise, react, and crypto;
- private-group read, send, revise, react, recovery, and rotation;
- account-avatar and group-avatar reads;
- small resource read, publish, viewer, ranged stream, save, and app-link
  navigation; and
- private attachment publish, decrypt, view, and stream.

Chat can derive a conservative legacy profile from `SHOW_ACTIONS` on Home 1.7,
but it must not infer future behavior from a version number. Capability discovery
does not grant authorization, and target-specific conditions such as a missing
recipient public key or group key remain structured runtime states.

### Conversations, reads, and sends

Use a tagged selector everywhere:

```text
{ kind: "group", groupId } | { kind: "direct", otherAddress }
```

The invoked bridge (`qdnRequest` or `qortalRequest`) is the authoritative network
and selects the permission and signing domain. If a compatibility request repeats
`network`, Home must reject a mismatch; app input must never select a different
key, route, or permission scope.

Normalize the actions around these shapes:

- `SEARCH_CHAT_MESSAGES { conversation, before, after, limit, reverse }`
  returns plaintext messages, a cursor, and structured crypto status. Home must
  reject a direct selector that does not involve the selected account.
- `GET_ACTIVE_CHATS { includeGroups, includeDirect }` returns active
  conversations, safe previews, and crypto status, with Home decrypting only for
  the selected account. Chat owns read watermarks and unread counts.
- `SEND_CHAT_MESSAGE { conversation, message, payloadFormat,
  chatReference? }` validates target, size, reference, and capability, then
  performs protocol-specific encryption, proof of work, signing, and broadcast.
  It returns network, signature, timestamp, and broadcast state.

`payloadFormat` is an allowlisted application-envelope codec/version only. Home
derives encryption from the conversation kind and authoritative group metadata
and fails closed if private status cannot be verified. An app-provided format can
never override target or encryption semantics.

`chatReference` must be validated and preserved on both Home 1 and Home 2, on
desktop and Android. Freeze the distinct Qortal codecs separately: Hub v3 open
groups, legacy version-2 direct-message plaintext before secretbox, and the
private-group inner payload before `encryptSingle`. Do not reuse Qortium's JSON
shape for any of them.

### Portable private chat

The existing Home 1 Qortium `/chat/private/*` integration remains a local-node
compatibility adapter, not the portable design. Home needs deterministic golden
vectors and host-owned implementations for:

- Qortium QDM1 direct messages: Ed25519-to-X25519 shared secret, QDM1 domain
  separation/KDF, and AES-256-GCM envelope;
- Qortal direct messages: Ed25519-to-Curve25519/X25519, SHA-256 shared secret,
  NaCl secretbox, and a nonce taken from the first 24 bytes of the random 64-byte
  `lastReference` (which is distinct from `chatReference`);
- Qortium QPGC membership epochs, announcements, requests, relays, rotations,
  AES-GCM content, and secure account/network/group/epoch-scoped key persistence;
  and
- Qortal Hub private-group QDN key bundles and exact `encryptSingle` message
  formats.

Vectors must cover both directions, wrong account or key, unknown recipient
public key, malformed/tampered/replayed data, restart, account switch, key
rotation, and cross-client Hub traces. Home returns plaintext or structured
`MISSING_KEY` state, never reusable keys. QPGC recovery additionally needs a
bounded, side-effect-free Core API for raw control envelopes. It must filter by
group, epoch, and control type; support before/after cursors and limits; and
return sender, timestamp, CHAT signature, and raw data for current and historical
requests without decrypting or exposing keys. Home still verifies envelope
signatures, membership/epoch, intended wrapper recipient, and key commitment.
Ordinary public chat search intentionally filters these controls today.

Phase 0 must also decide secure at-rest QPGC key storage and migration, account
isolation, recovery after the roughly 24-hour CHAT/control retention window,
reinstall and multi-device behavior, and which earlier history is irrecoverable.
For Qortal private groups it must freeze publisher authorization, exact owner or
admin name and identifier selection, deterministic newest-valid-resource rules,
member public-key requirements, rotations on joins/leaves, historical-key
behavior, old/new `encryptSingle` compatibility, and reaction type 102.

CHAT storage is retained and ephemeral, not indefinite chain history. Pagination
and resume cover the selected node's retained window; the product must explain
node-switch gaps and missing history rather than promise an offline mailbox.

### Resources and attachments

Normalize public resource operations as network-qualified `FETCH_RESOURCE`,
`OPEN_RESOURCE_VIEWER`, `OPEN_RESOURCE_STREAM`, `SAVE_RESOURCE`, and
`PUBLISH_RESOURCE` actions, plus network-qualified app/resource navigation. The
desktop and Android implementations must share the same validators, bounds,
authorization, and MIME policy. Small fetch/property responses are strictly
bounded. Large streams use an expiring app/tab/account/network/route-bound
capability URL with Range support, cancellation and byte ceilings, no node API
key exposure, and strict service/path validation. Android needs that authorized
ranged proxy rather than whole-file buffering.

Public uploads may be referenced from open chats. A public upload referenced by
an encrypted message is still public. Genuine private files require a separate
chat-specific contract such as:

```text
PUBLISH_CHAT_ATTACHMENT { conversation, sourceToken, metadata }
```

Home issues `sourceToken` from its native file picker; only a small, explicitly
bounded inline-byte alternative is allowed. Home selects and allowlists the
ciphertext service, sniffs and validates content, encrypts bytes plus filename,
MIME type and other sensitive metadata using the current DM or group context,
and publishes under an opaque identifier. The returned authenticated descriptor
must contain an immutable expected transaction signature and/or content hash so
a later mutable-QDN revision cannot silently replace a signed attachment.
Intentional latest-revision embeds remain a distinct descriptor type.

Fetch/view/stream actions verify the selected account's conversation access,
decrypt in Home, and recheck the declared MIME type against decrypted bytes. The
design must acknowledge unavoidable size/timing/publisher metadata and that
downloaded plaintext cannot be revoked.

Qortal public-node publication must not be promised until a portable signing or
keyless staging route is proven. Qortium's existing keyless public publication
does not imply that Qortal has an equivalent. Hub-compatible private-group images
use their pinned `encryptSingle` and encrypted `images[]` formats; generic Qortal
private files and DM attachments require separate formats and vectors rather than
being assumed compatible with that image path.

## Delivery sequence

### Phase 0 — reconcile contracts and fixtures

- Correct the stale avatar issue text and freeze the current pointer contract.
- Pin the Qortal Hub implementation used for interoperability evidence.
- Capture separate open-group, direct-message, private-group, mutation,
  attachment, transaction, crypto, and cross-client vectors.
- Define `GET_CHAT_CAPABILITIES` and the normalized conversation/resource
  descriptors before adding more one-off actions.
- Probe and specify portable Qortal QDN publication before scheduling Qortal
  private-group rotation or authoring. If Qortal has no safe public/custom
  staging route, define the required Qortal Core/API work first.
- Specify QPGC durable key storage/recovery and Qortal private-group bundle trust
  and rotation rules before implementation.

### Phase 1 — Chat-only read and presentation parity

Deliver Qortal active chats/unread, history pagination, roster and selection
parity; network-scoped user/group avatars; Qortal Hub image parsing; and
network-correct public embeds/cards. Refactor the conversation and resource
models while preserving current Qortium behavior. Add the shared pending,
broadcast, confirmation/error, retry, and duplicate-prevention model. This phase
targets the already released Home 1.7 action surface and requires no Home change.

### Phase 2 — small bridge parity tranche

Preserve `chatReference` through every Home bridge, add capability discovery,
Home 2 group-avatar reads, network-aware viewer/stream/save actions, and portable
join/leave basics. Each mutation needs its own advertised capability, validated
serializer or public unsigned builder, local signing/attestation, fee and proof
rules, action-specific approval, freshness checks, and broadcast tests. Enable
Qortal edits and reactions only after Hub vectors pass.

### Phase 3 — direct messages on both chains

Implement Home-owned QDM1 and Qortal DM active/search/decrypt/send paths, then
enable replies, edits, supported delete semantics, reactions, pagination,
unread state, and avatars in the shared direct-message UI.

### Phase 4 — closed/private groups on both chains

Add the bounded Core QPGC control read needed by remote Home, implement portable
QPGC recovery/rotation, and separately implement the pinned Qortal Hub key-bundle
and message formats, including the Qortal publication route proven in Phase 0.
Complete private member state, history, send, replies, edits/reactions where
interoperable, and structured missing-key recovery.

### Phase 5 — publishing, authoring, and attachments

Complete general Qortal public publishing, Home 2 Qortium publishing parity, and
avatar authoring through the owning app, then add separately specified encrypted
private images/files for each supported direct and private-group protocol. Public
and private resource descriptors must remain visibly distinct.

### Phase 6 — completion hardening

For every capability, maintain automated fixtures across both networks,
desktop/Android, local/authenticated-custom/unauthenticated-custom/public node
routes, open/private/direct
conversation kinds, account lock/switch/restart, node switch, missing key/public
key, stale approval, malformed/oversize input, tamper, and replay. A tranche is
not complete if one platform silently falls back to another network or if a
public/custom node path is merely hidden rather than implemented or explicitly
reported unavailable. Keep named representative public and unauthenticated
custom nodes in the fixture matrix, and cover short retention, node-switch gaps,
missing history, pending-send reconciliation, and cross-chain direct/mention/
reply notification semantics.

User testing continues throughout these phases and feeds the next tranche. It is
not a separate packaged-Home checkpoint in this roadmap.

### Phase 7 — Reticulum/RCHAT

Resume the separate RCHAT compatibility work only after the dual-chain CHAT
matrix above is complete. It retains its own protocol, action family, licensing,
vectors, honest capability handshake, group/DM behavior, and stock-client trace
requirements.

## Dual-chain legacy CHAT tranche definition of done

Chat completion means a selected account can discover and participate in its
public and private groups and direct conversations on both chains; see correct
names and avatars; page and resume history; reply, edit, delete where the target
protocol defines an interoperable delete, and react; and safely view or share
public and private resources. The same advertised capability behaves the same on
desktop and Android and across local, authenticated or unauthenticated custom,
and public nodes that expose the documented prerequisites; operator-denied
capabilities fail explicitly.

Unsupported states produce an accurate structured explanation. They never
broadcast a different transaction, leak a key, fetch from the other chain, or
present a public resource as private.

This definition completes the Qortium/Qortal legacy CHAT tranche. It is not the
Chat 2.0 release gate: the accepted Chat 2.0 plan still requires the separate
Reticulum/RCHAT scope in Phase 7.
