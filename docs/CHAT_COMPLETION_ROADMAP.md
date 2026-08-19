# Chat 2.0 roadmap

Status: reconciled 2026-08-19 against Home `main` (Home 2, milestones H0–H7
implemented) and Core `main` (C0–C6 implemented). This supersedes the earlier
dual-chain completion roadmap, which described Home 1.7 constraints and
proposed contracts (for example `GET_CHAT_CAPABILITIES`) that were never
adopted — Home 2 advertises its callable actions dynamically through
`SHOW_ACTIONS`, and that advertisement is the only capability truth surface
Chat consumes.

Reticulum/RCHAT is explicitly parked. It is a distinct future source/action
family; nothing in this roadmap depends on it, references to it gate nothing,
and it must not be overloaded onto the Qortium or Qortal CHAT actions.

## Target

One Chat app, one published bundle, version 2.0.0:

- In **Qortium Home 2** it serves Qortium and/or Qortal, detecting which
  chains the host actually offers — Home running with a single connected
  network shows a single network section.
- In **Qortal Hub** the same bundle serves Qortal only, through the classic
  `qortalRequest` surface.
- Feature availability always derives from advertised actions and structured
  runtime errors — never from route class (public vs local node), host
  version sniffing, or hard-coded network checks.

## Host tiers

One shared conversation model; three explicit transport adapters:

| Tier | Host / global | Surface |
| --- | --- | --- |
| T1 | Home 2, `window.qdnRequest` (Qortium) | Full fine-grained families: public group send/edit/delete/reaction, direct family, private-group family, membership/admin, resources, private attachments, notifications, pending-transaction journal |
| T2 | Home 2, `window.qortalRequest` (Qortal) | Same families minus per-chain deltas (no group 0, chain-specific extras) |
| T3 | Qortal Hub, lexical `qortalRequest` | Generic `SEND_CHAT_MESSAGE` + `chatReference` envelopes, `SEARCH_CHAT_MESSAGES`, group membership mutations, generic QDN reads/publish. No decrypted DM reads (DMs are hidden on Hub), no private groups, no attachments, no immediate notifications, no pending journal |

A browser-development fallback (read-only local node access) is retained for
`npm run dev`. The legacy Home 1.7 Qortal-prefixed adapter remains only as
compatibility; it proves its action catalogue before the Qortal section shows.

Detection order: `window.qdnRequest` presence; a dedicated `qortalRequest`
global (Home 2 sets a window property, Hub injects a top-level lexical const —
both are honored); then `SHOW_ACTIONS` + `WHICH_UI` per global
(`QORTIUM_HOME_ELECTRON` vs `HUB_ELECTRON`/`HUB_WEB`). Unknown action names
are never probed — Hub leaves unrecognized requests to a 30-second timeout.

## Contract facts Chat relies on

- `SHOW_ACTIONS` is runtime-filtered by the selected route's availability;
  publication/attachment actions additionally require reachability. An
  implemented-but-unavailable action fails with `NODE_CAPABILITY_MISSING`; an
  action absent from the protocol fails with `UNSUPPORTED_PROTOCOL`.
- `GET_HOST_INFO` supplies host, protocol, network, platform, and route
  diagnostics.
- Bridge errors carry structured fields (`code`, `network`, `action`,
  `retryable`, `outcome`, optional `target`). Chat maps the documented codes
  to localized notices and treats `outcome: "unknown"` as ambiguous, never as
  a proven rejection.
- Home records signed mutations with unknown broadcast outcomes in a
  restart-safe journal (`GET_PENDING_TRANSACTIONS` /
  `FORGET_PENDING_TRANSACTION`) and blocks same-target mutations with
  `PENDING_TRANSACTION_RECONCILIATION_REQUIRED` until the app reconciles and
  forgets the entry. Chat forgets an entry only after observing its signature
  in fetched or live messages for its own network.
- The invoked global fixes the chain; Home never silently crosses networks,
  and Chat never lets an app-side `network` value select keys or routes.
- Qortal has no group-0 general chat anywhere (Core rejects it; the UI never
  offers it).

## Ownership and safety boundaries

Chat owns conversation state, network-qualified presentation, protocol payload
codecs, capability-gated controls, and bounded rendering. Home owns account
selection, private keys, signing, proof of work, encryption and decryption,
private-chat authorization, native file access, publishing, and native
viewers. Chat never receives reusable private, group, or content keys. All
conversation, identity, avatar, and resource objects carry their network; no
operation defaults a Qortal object to Qortium.

## Delivery phases

### P1 — host adapters and capability cutover (this tranche)

Done in this branch:

- Bridge host classification (`home2` / `hub` / `legacy-home` / `gateway` /
  `browser-dev`) and Hub-safe detection of the lexical `qortalRequest` global.
- Obsolete public-node send and key-recovery suppression removed; failures
  surface through the structured error codes instead.
- Typed per-network wrappers for public `SEND_CHAT_EDIT`/`DELETE`/`REACTION`
  and the fine-grained direct family, with the generic
  `SEND_CHAT_MESSAGE` + `chatReference` envelope retained for hosts that do
  not advertise the exact actions (byte-compatible with the Hub v3 /
  direct v2 envelopes frozen in Home's interop fixture).
- Direct-send capability derived from `SEND_DIRECT_CHAT_MESSAGE`, not from
  the group send action; direct revision controls require the full
  edit/delete/reaction family.
- Qortal join/leave through mirrored per-network derivations with
  network-tagged transaction tracking.
- Pending-transaction journal consumption and reconciliation.

### P2 — direct messages on both chains

Qortal direct rail/list/history/send through the exact direct family on
T1/T2. DMs stay hidden on T3 (Hub exposes no way to decrypt DM history).
Qortal direct payloads must serialize text as paragraph HTML per the frozen
interop vectors. Preserve network/account-qualified storage, pagination,
unread state, avatars, replies, missing-public-key errors, and ambiguous-send
handling.

### P3 — private groups on both chains

Consume private active/history/state, send/revision, key request, resolve,
and rotation actions per network on T1/T2; surface structured missing-key,
recovery, membership, retention-gap, and operator-policy states without
exposing keys. Unjoined private groups stay hidden; T3 shows none.

### P4 — public and private resource completion

Route viewer/stream/save/publish/navigation through the selected network's
advertised actions; adopt Home source tokens (`SELECT_QDN_PUBLISH_SOURCE`)
and the private attachment family (publish, stream, viewer, save, progress,
failure states). Wire the Qortal publisher identity so attachments stop being
Qortium-only. Ordinary QDN links stay visibly public even inside encrypted
conversations.

### P5 — UI/UX redesign to the Home 2 design system

Extract the layout shell from `App.tsx`; move Chat's token values to Home 2's
palette and finish the `modern` UI style (including a `clay` accent); keep
the app fully usable on phones. Requires a small Home change so hosted apps
receive `uiStyle: 'modern'` and an unmapped `clay` accent.

### P6 — notifications and operational completion

Chain-qualified `SHOW_NOTIFICATION`/`NOTIFICATION_HAS_PERMISSION` where
advertised; retain separate user choices for direct activity, mentions, and
replies; reconcile account, lock, node-route, app-navigation, and journal
changes without leaking another identity's transcript, drafts, or
notifications; finish consistent empty/locked/missing-key/read-only/pending/
ambiguous/retry states on desktop and mobile.

### P7 — version 2.0.0, docs, dual-chain publication

Version bump (2.0.0 = requires platform 2.0 under QAVS), final capability
matrix and README limits, then publication of the identical built tree to
Qortium QDN (existing `APP/Chat/Chat`) and Qortal QDN (identity to be decided
at publish time; Hub's catalog lists default-identifier resources). The
transaction wrapping necessarily differs per chain; the published files do
not. Publication only happens from merged `main` with explicit owner
approval.

## Verification standard

Every tranche keeps `npm test` and `npm run build` green and adds unit tests
for new pure logic. Capabilities must work across local, authenticated
custom, unauthenticated custom, and public node routes on desktop and
Android; when an operator disables a required endpoint, the exact capability
error is shown. A public node is not a reduced tier by design — only by an
operator's explicit policy.
