# Chat attachment embedding (P4b)

`PUBLISH_CHAT_ATTACHMENT` returns an immutable `PrivateAttachmentDescriptor`
(review/schemas-publish-attachments.md § 3) but the bridge contract does not
define how a Chat message should carry that descriptor — Chat owns that
convention, because descriptors only ever travel inside conversations Chat
itself composes. This documents the convention P4b implements and the
evidence for why it is safe.

## The finding that shaped this

Home does not validate the plaintext shape of a **new** (non-edit,
non-delete, non-reaction) chat message on any of the five send paths this
app uses, before encrypting/broadcasting it:

- Qortium public/private group new message: `normalizeHomeV2PublicChatRequest`
  returns immediately for `SEND_CHAT_MESSAGE` with no `chatReference` — no
  envelope check at all beyond a UTF-8 length cap.
  [home-v2-chat-actions.ts:268-277](../../qortium-home-main-ro/electron/home-v2-chat-actions.ts:268)
- Qortium direct new message: `validateQortiumDirectPayload` returns
  immediately for `SEND_DIRECT_CHAT_MESSAGE`.
  [home-v2-direct-chat-contract.ts:115-116](../../qortium-home-main-ro/electron/home-v2-direct-chat-contract.ts:115)
- Qortal public/private group new message: same `normalizeHomeV2PublicChatRequest`
  no-op branch (private-group write requests delegate to it verbatim).
  [home-v2-private-group-chat-contract.ts:225-239](../../qortium-home-main-ro/electron/home-v2-private-group-chat-contract.ts:225)
- Qortal direct new/edit message: `validateQortalDirectPayload` requires
  `version`/`specialId`/`message`/`type`, but has **no key allow-list** on
  the initial-send or edit branches (only the canonical delete envelope
  restricts keys).
  [home-v2-direct-chat-contract.ts:144-179](../../qortium-home-main-ro/electron/home-v2-direct-chat-contract.ts:144)

Consequence: an extra `attachments` key survives every one of these paths
untouched. **The `qatt1:` text-body marker fallback the P4 design brief
proposed as a contingency is not needed anywhere** — every payload family
tolerates the extra key, so this implementation does not build it. If a
future Home tightens one of these validators to an allow-list, the affected
codec falls back to the marker; that is a one-function change isolated to
this document's matrix, not a redesign.

## The matrix

| Conversation | Codec | Embedding | Where |
| --- | --- | --- | --- |
| Qortal **private group**, `resource.service === 'IMAGE'` | `qortal-hub-group-image-v1` | Hub's `images[]` array in a v3 envelope, one entry per attachment, carrying **both** the plain Hub fields (`service`/`name`/`identifier`) real Hub clients read **and** the full descriptor's extra keys (`version`, `encrypted`, `network`, `conversation`, `codec`, `resource`, `ciphertext`) Chat's own decode needs | `App.tsx` builds the envelope directly via `buildQortalHubGroupChatPayload(..., images)` (qortalChatPayload.ts) before calling `sendPrivateGroupChatMessage` |
| Everything else: Qortium group (`qenc-v2-group`), Qortium direct (`qenc-v2-direct`), Qortal direct (`qortal-qatt-direct-v1`), Qortal private group non-image (`qortal-qatt-group-v1`) | — | Chat's own `{message, repliedTo?, attachments: [descriptor]}` JSON envelope | `chatText.ts`'s `buildChatMessageText(text, repliedTo, attachments)` |

For the Qortal direct case, `buildChatMessageText`'s JSON is handed to
`sendDirectChatMessage`, which re-wraps it into Qortal's v2 envelope via
`normalizeQortalOutgoingMessage` + `buildQortalDirectChatPayload`
(qortalChatPayload.ts) — both extended to carry `attachments` through as an
extra key. For the Qortal private-group non-image case and every Qortium
case, the message text reaches Home unmodified (no re-wrap layer exists for
those send paths), so the same envelope Chat builds is exactly what Home
encrypts.

Edits never carry a new attachment (the composer clears any staged file on
entering edit mode, matching the pre-P4 rule that an edit keeps the
original message's media), so none of the edit/delete/reaction builders
needed a change.

## Decoding

`chatText.ts`'s `unwrapChatTextEnvelope` extracts two kinds of raw
candidate, both capped at 12 entries and filtered to plain objects only:

- the generic envelope's `attachments` field (Chat's own convention), and
- every entry of a v3 envelope's `images[]` array (covers both real Hub
  images and the dual-purpose entries above).

These are exposed as `DisplayChatMessage.attachments?: unknown[]` —
deliberately **unvalidated**: `chatText.ts` cannot import
`coreApi.isPrivateAttachmentDescriptor` (coreApi.ts already imports from
chatText.ts, so the reverse import would be circular). Every consumer
(`MessageList.tsx`) must run candidates through
`isPrivateAttachmentDescriptor` before treating one as real — an ordinary
public Hub image entry has no `ciphertext`/`conversation`/`codec` fields and
is rejected by that check, so this is safe against a real Hub client's
plain `images[]` traffic landing in a private/closed context and being
mistaken for one of Chat's own attachments.

## Rendering

`MessageList.tsx` filters `decoded.attachments` through
`isPrivateAttachmentDescriptor`, then for each validated descriptor:

- `resource.service === 'IMAGE'` **and** `GET_CHAT_ATTACHMENT_STREAM_URL` is
  advertised: a click-gated reveal button, matching the existing public
  image-preview pattern — a fresh stream URL is fetched only when the user
  clicks, never cached (the capability expires after 10 minutes and is
  meant to be single-use per review/schemas-publish-attachments.md § 4).
- otherwise: a file chip labelled generically (the descriptor carries no
  plaintext filename) with the ciphertext size, plus Open/Save buttons
  gated on `OPEN_CHAT_ATTACHMENT_VIEWER`/`SAVE_CHAT_ATTACHMENT`.

Public `qdn://` links keep rendering exactly as before, including the
existing "Public resource" label inside encrypted conversations.

## Attachment sources per host (attachments-matrix A1/A2, 2026-09)

The P4 picker flow above assumed every host offers Home's native picker and
refuses inline bytes. Only Home 2 desktop does both. Chat therefore
feature-detects an **attachment source** per conversation from the host's
advertised actions (`src/attachmentCapabilities.ts` — never a host name or
version string):

| Host | Open-group paperclip | Paste / drag-drop | Private conversations |
| --- | --- | --- | --- |
| Home 1.x ≤1.2 (no picker yet) | bytes (`<input type="file">`) | stages the file (bytes) | — |
| Home 1.x ≥1.3 (picker since home#100) | picker (token) | stages the file (bytes) | — |
| Home 2 desktop | picker (token) | notice → use the attach button | picker + `PUBLISH_CHAT_ATTACHMENT` |
| Home 2 Android | picker (token) | stages the file (bytes) | — (not dispatched to apps) |
| Qortal Hub | bytes | stages the file (bytes) | — |
| Gateway / browser | — | — | — |

- **picker**: `SELECT_QDN_PUBLISH_SOURCE` → `sourceToken` → `publishQdnResource`
  / `publishChatAttachment` (the P4 flow, unchanged).
- **bytes**: the app reads the `File` itself (`prepareLocalAttachment`:
  WebP re-encode at max width 1200 / quality 0.6 for non-GIF images, which
  also strips metadata — Hub's own parameters), base64-encodes it, and calls
  `publishQdnResourceBytes`, which sends the pre-P4 inline shape
  `{ action: 'PUBLISH_QDN_RESOURCE', base64, filename, identifier, name, service }`.
  Every Home 1.x reads `data64 || base64`; Hub reads `data64 || base64 || file`.
  The host shows its own approval prompt and signs. Hosts return different
  shapes (Home: `{accepted, resource, result}`; Hub: the node's transaction
  response), so the only contract relied on is resolved = published,
  rejected/`accepted: false` = not.

**Token-only detection.** Home 2 desktop denylists every inline field and is
also the only host that advertises `PUBLISH_CHAT_ATTACHMENT`, so that action
is used as the "refuses inline bytes" marker (`hostAcceptsInlinePublishBytes`).
No probe request is made. When both the picker and inline bytes are accepted
(Home 1.3–1.8), the paperclip prefers the picker (Home sees the real file and
the app never holds bytes) while paste/drop use the bytes path.

Paste/drop can only ever stage on the bytes path — a token-only host gives the
app no way to hand bytes to its picker. Enabling that on Home 2 desktop needs
a Home-side blob-intake action (tracked as Phase B1 in
`~/AGENTS/projects/qortium-chat-v2/attachments-matrix/TRACKER.md`).

The bytes path is open groups only: private conversations need Home's
encrypted `PUBLISH_CHAT_ATTACHMENT`, and no host without it has an
equivalent.

## Linking existing resources (attachments-matrix A3/A4, 2026-09)

The composer's 🔗 button searches Core's `/arbitrary/resources/search` (via
`FETCH_NODE_API`, which every host serves — Home directly, Hub and the gateway
through Chat's same-origin fallback) across ALL publishers and inserts a link;
nothing is republished. `buildQdnResourceShareLink` picks the form the
conversation's network previews best:

- Qortium: `qdn://SERVICE/name/identifier` (percent-encoded segments).
- Qortal: Hub's `qortal://use-embed/{IMAGE|VIDEO|ATTACHMENT}?name=…&service=…&identifier=…`
  so real Hub clients render an inline embed. Hub neither URL-encodes nor
  decodes these query values, so the form is used only when every value is
  `[A-Za-z0-9._-]`; otherwise the plain `qortal://SERVICE/name?identifier=…`
  link is emitted (previewed by Chat, linkified by Hub).

Chat's `parseQdnResource` now also parses incoming `use-embed` links (both the
ones Chat emits and real Hub group-image embeds), so they preview like any
other QDN link. Open-group ATTACHMENT publishes in Qortal conversations emit
the use-embed form too — the previous `qdn://SERVICE/name/identifier` form was
mis-parsed in Qortal conversations, where an identifier only rides
`?identifier=` (the third segment was read as an app path).
