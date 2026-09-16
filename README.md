# Qortium Chat

A QDN chat app for Qortium Home 2 and, on the Qortal side, Qortal Hub.
Qortium conversations use `window.qdnRequest`; Qortal conversations use the
dedicated `qortalRequest` global — Home 2's window property or Qortal Hub's
injected classic bridge — with a compatibility adapter retained for the older
Qortal-prefixed `window.qdnRequest` actions of Home 1.7. Every feature gates
on the host's advertised actions (`SHOW_ACTIONS`) and structured runtime
errors, so the same build degrades cleanly on hosts with a smaller action
surface. One deliberate exception keeps Home 1.x (1.7–1.8) users able to
post: when a Qortium host advertises the private-chat read actions and the
generic `SEND_CHAT_MESSAGE` but not Home 2's exact private send actions —
the signature of Home 1.x on a local or trusted node, where Home itself
routes a closed group or a direct recipient through Core's encrypted private
send — closed-group messages and direct messages ride the generic action as
Chat 1.x did. On a public node Home 1.x hides those reads, so nothing is
sent unencrypted anywhere (`src/legacyHome.ts`). Home 1.x also answers a
public-group send with `{accepted: true, result: true}` and no signature;
Chat treats that as a successful broadcast and reconciles the local echo by
content once the message appears, rather than reporting an unknown outcome. The app follows Home's display settings, including the Classic,
Modern, and Fun UI styles.

The bell beside the selected account opens separate choices for direct chat
activity, mentions, and replies. On Home 2 those choices drive foreground
notifications: while Chat is running it detects new activity itself and asks
Home to show a chain-qualified notification (`SHOW_NOTIFICATION`), so machine
messages, reactions, and edit/delete revisions are correctly excluded. On
legacy hosts that still expose the durable subscription actions, Chat keeps
registering the background incoming-direct rule exactly as before — there,
direct activity can include edits, reactions, or app-to-app data messages
because Core's background event deliberately excludes message content.
Existing bell preferences migrate without changing behavior, and the app
feature-detects the notification actions, so older Home versions and browser
development remain unaffected.

For minting groups, the selected group header shows whether the selected
account is currently minting on the connected node, and joined members who are
not minting yet get a Start minting button that asks Qortium Home (via the
`START_MINTING` bridge action) to add the account's minting key to the
connected local node — including on a fresh or additional node. If the account
has no on-chain minting authorization yet (for example it joined the minting
group before joins carried minting keys), the same button first submits the
free self-share authorization transaction, tracks it until it confirms, and
can then add the key. Minting status reads use the `GET_MINTING_STATUS` bridge
action when Home provides it, with a read-only node API fallback otherwise.

## Development

Install dependencies:

```sh
npm install
```

Run the app locally:

```sh
npm run dev -- --host 127.0.0.1
```

The local browser fallback reads from `http://127.0.0.1:24891` by default. Set
`VITE_QORTIUM_NODE_API_URL` to use another node during development.

Build and publish the app to the local Previewnet QDN test name:

```sh
npm run build
npm run qdn:publish
```

By default the publish helper uploads `dist/` as `qdn://APP/Chat/Chat` through
`http://127.0.0.1:24891`, using the local preview account files under
`~/qortium/git/qortium-core/preview`. The helper uses `QORTIUM_CHAT_NODE_API_KEY` or
`QORTIUM_CHAT_NODE_API_KEY_PATH` when set, then tries the API key for the active
local Core process, and finally falls back to `~/.config/qortium-core/runtime/apikey.txt`.
Set `QORTIUM_CHAT_QDN_NAME`, `QORTIUM_CHAT_QDN_IDENTIFIER`,
`QORTIUM_CHAT_QDN_TITLE`, or `QORTIUM_CHAT_QDN_SERVICE` to publish another QDN
resource.

## Versioning

Chat follows the Qortium app versioning standard (QAVS): the current app
version is 2.0.30, where the `2.0` prefix declares the minimum Qortium platform
level the app is built against (Qortium Home 2) and the last number is the
app's own release counter. The build emits a `qortium-app.json` manifest (see
`vite.config.ts`) that Qortium Home reads from the published root to show the
compatibility badge. The manifest is ignored by Qortal Hub, where the same
bundle runs against the classic `qortalRequest` surface.

## Developers

Since 2.0.14 the app carries an in-app public contract reference for other
clients, following the fleet Developers-workspace convention. Open it from the
`Developers` tab in the top bar or with `qdn://APP/Chat/Chat?view=developers`
(`view=developer` and `view=reference` are accepted and folded to the canonical
form). It documents the chat envelope and `chatReference` rules, the
machine-message skip rule, Qortium vs Qortal payload shapes (Hub v3 group,
direct v2, General Chat wrapper, delete markers), client-side limits, capability
discovery and the full bridge action roster, send outcomes and the pending
journal, discovery paths and deep links, and the attachment contract. Every
printed value is bound to the implementation constant it describes and every
example is produced by the real codec (`src/referenceExamples.ts`,
`src/reference.test.tsx`).

The workspace is additive: switching to it keeps the selected conversation, its
in-memory draft and the `address/group/network` query keys, adds one history
entry so Back returns to the conversation, and scrolls only its own container
(never Home's outer document). The tab label is localized; the reference body
intentionally stays English (`lang="en" dir="ltr"`). Note that the Chat
workspace tab is the same `Chat` loanword in several locales on purpose.

## Qortium Home Smoke Check

Before publishing a new QDN build:

```sh
npm test
npm run build
```

Then open `qdn://APP/Chat/Chat` in Qortium Home with an unlocked tab account.
Confirm that the status pill reports Home, account approval succeeds, joined
Qortium and Qortal groups load, both public-group send paths open Home approval
prompts, Qortal Hub v3 text/replies render correctly, and Qortium direct/private
flows retain their existing behavior. Also confirm that Home display settings
update theme, text size, accent, UI style (Classic, Modern, or Fun), and
language in the app, and that Classic tints its surfaces green while a Qortium
conversation is open and blue while a Qortal one is open.

For a publish pass, confirm the local Core is fully synchronized before running
`npm run qdn:publish`. The expected identified render URL is
`http://127.0.0.1:24891/render/APP/Chat/Chat`,
and the published resource should report `READY` at
`/arbitrary/resource/status/APP/Chat/Chat?build=true`.

## Formatting

Messages support a small formatting subset (Chat 2.0.19): `**bold**`,
`*italic*` or `_italic_`, `~~strike~~`, `` `code` ``, fenced ```` ``` ```` code
blocks, `- ` bullet lists and `@name` mentions (`@[Name With Spaces]` for
names containing spaces). The composer's B / I / S / `</>` buttons (or
Ctrl/Cmd+B, I, E) wrap the selection, and typing `@` offers the conversation's
named members. A backslash makes a marker literal (`\*not bold\*`).

On Qortium the message text carries this markup as written (Chat is the only
reader there). On Qortal the same content is sent as the Tiptap document
Qortal Hub's editor uses — marks, mentions, bullet lists and code blocks — so
Hub renders it natively, and Hub-authored formatting (including headings,
links and quotes) is read back into the same markup here.

## Inline images

Since Chat 2.0.26 an image pasted or dropped into a Qortium conversation
travels inside the message itself when the image, exactly as given, fits
under Core's 4 000-byte CHAT cap (a WebP, JPEG or PNG of roughly 2.8 KB or
less — an icon or a small sticker): the composer shows it with its byte
count and sends it as an `![alt](data:image/…;base64,…)` line that every
Chat reader renders. Room for the rest of the message is counted first —
reply references, the typed text and the closed-group plaintext cap — so an
image never pushes a message over the limit. Chat never resizes or
re-encodes what was dropped (2.0.26–2.0.29 did, and sent a thumbnail in
place of the image; fixed in 2.0.30). Anything larger, or an image that no
longer fits after the text grows, takes the ordinary attachment path with
the original bytes (a QDN publish and link, see "Current Limits"), and the
chip's "Attach instead" button switches a staged inline image to that path
by hand. Qortal conversations keep
the attachment path only, since Qortal Hub carries images as QDN resources.

Since Chat 2.0.28 every image in a message is clickable and opens the same
lightbox. For a public `IMAGE` embed and for a private image attachment the
lightbox offers **Open** (Home's shared viewer, with zoom and its own save)
and **Save** (Home's native save dialog) when the host advertises the
matching actions — `OPEN_QDN_RESOURCE_VIEWER` / `SAVE_QDN_RESOURCE` for a
public resource, `OPEN_CHAT_ATTACHMENT_VIEWER` / `SAVE_CHAT_ATTACHMENT` for a
private attachment — and a private image preview also carries Open/Save
buttons of its own, exactly like a file attachment's chip. An inline
`data:` image is not a QDN resource, so its lightbox has no Open; since
Chat 2.0.29 it offers Save on hosts that take app-held bytes
(`SAVE_FILE_BYTES`, Home 2.1.0-beta.12 and later), writing the image through
Home's save dialog under a name derived from its caption.


## Group events and moderation

Since Chat 2.0.20 the group feed interleaves everyone's confirmed group
events from the last 24 hours — joins, join requests and approvals, leaves,
invitations, removals, bans, admin changes and group updates — read through
the host's `SEARCH_TRANSACTIONS` and filtered to the open group. Owners and
admins moderate from the members drawer: remove or ban a member, and (owner)
make or remove admins; admins can invite by address. Creating or editing a
group and setting its avatar stay in the Groups app, linked from the drawer.
Every action goes through the host's own approval prompt.

## Web links and Qortal General Chat on Home

Since Chat 2.0.22, an `http(s)` link in a message opens through the host when
it advertises `OPEN_EXTERNAL_LINK` (Qortium Home 2.1+): the host checks the
address, shows the site and the full link, and only on approval hands it to
the device's browser — Chat never navigates and a host without the action
keeps links copy-only. On the same hosts Qortal's General Chat is listed and
writable through `SEND_QORTAL_GENERAL_CHAT`, which builds the MESSAGE-wrapped
group-0 message Hub and the Classic UI read; Qortal Hub keeps its
`SIGN_TRANSACTION` path.

## Blocking senders

Since Chat 2.0.23, Block on someone else's message (or Block/Unblock on their
member chip) adds or removes their address in the node's own `blockedAddresses`
list — the same list the Classic UI and Qortal Hub use — through the host's
list actions (`GET_LIST`/`ADD_TO_LIST`/`REMOVE_FROM_LIST` on Qortium Home 2,
`GET_LIST_ITEMS`/`ADD_LIST_ITEMS`/`DELETE_LIST_ITEM` on Qortal Hub). Messages,
edits and reactions from blocked senders are hidden and never notify. Home 2
serves lists only for an administered node (its own Core, or a custom node with
your API key), so on a public node the controls simply do not appear.

## Searching messages

Since Chat 2.0.25 the Search button in a conversation's header filters the
loaded history to messages whose text or sender matches every word you type
(Escape closes it). It searches what is loaded so far — use "Load older
messages" to widen it — because neither chain offers a server-side chat search.

## Live updates

Open Qortium groups on desktop Home use the node's `/websockets/chat/messages`
stream. Since Chat 2.0.24 open Qortal groups inside Qortal Hub do too, over the
Hub's own render origin (a Qortal node). Everything else — Qortal chats on
Home 2, everything on Android, closed groups and direct chats — polls: every
6 seconds while the tab is visible, every 30 seconds while hidden.

## Closed-group history and joining later

Private-group (QPGC) messages are encrypted to the group key in force when they
were sent. A member who joins later holds only the current key, so older
messages show as "Sent before you joined" (since 2.0.26) rather than as a
missing key. A per-group "share history with new members" setting is planned
(owner decision D-I); until then this is by design.

## Current Limits

This app does not handle private keys or transaction signing directly. Group
joins, group chat sends, closed-group chat reads, direct private chat reads,
direct private chat sends, and minting key registration are delegated to the
host's account-safe approval bridge; the app never sees the minting key.
Feature availability follows the host's advertised actions: there is no
built-in public-node restriction anymore — if a node operator disables a
required capability, the send is attempted and the host's exact capability
error (for example a missing-capability or unavailable-route notice) is
shown. Ambiguous broadcast outcomes are reconciled through Home 2's
restart-safe pending-transaction journal when the host provides it. Since
Chat 2.0.27 sends and revisions go out one at a time per network, so a
message typed while the previous one is still computing its proof-of-work
waits its turn instead of racing the host; a proof-of-work refusal, timeout
or cancellation (`QDN_POW_BUSY`, `QDN_POW_TIMEOUT`, `QDN_POW_CANCELLED`) is
a definite pre-signing rejection and keeps the Retry button. Browser
development remains read-only and cannot decrypt or send direct private chat
without Home. On Home 2, notifications are foreground-only: Chat must be
running (in a tab) to detect activity and ask Home to show a notification —
Home 2 deliberately does not provide the legacy background subscription
system. On legacy hosts, background direct-message notifications require
Home to remain running, and Android delivery requires Home in the
foreground. Closed-tab group mention detection is not available on any host
because Core deliberately excludes message content from notification events.

App-to-app data messages are hidden from the message feed, unread counts, and
in-app mention/reply notifications. On legacy hosts a direct one can still
raise Home's background "New direct message" notification. That rule is
evaluated by Core,
whose CHAT_MESSAGE event carries only addresses and envelope metadata and whose
filters are address-scoped, so Chat has no way to exclude a message it has not
seen yet. Suppressing it requires Home to fetch, decrypt, and classify the
message before displaying.

Qortal support currently covers public groups end to end: joined-group
history, messages, replies, edits, deletes, and emoji reactions (through the
host's exact revision actions when advertised, otherwise the interoperable
`chatReference` envelope), plus join/leave when the host advertises those
actions, bounded discovery that lists every unjoined group (active ones first
with a preview; quiet and closed ones by name — a closed group's Join sends a
join request), and read-only previews of open groups. Public-group attachments work on every host that can publish to QDN: through
Home's native picker where it is offered (Home 1.3+, Home 2), otherwise by
reading the file in the app and publishing it inline (older Home 1.x, Qortal Hub);
pasting or dropping a file into the composer stages it wherever the host
accepts inline bytes, and on token-only hosts (Home 2 desktop and Android)
through `STAGE_QDN_PUBLISH_SOURCE` when the host advertises it — see
`docs/CHAT_ATTACHMENTS.md`. The composer can also link any
resource already published to QDN — by any account — instead of republishing
it, emitting Qortal Hub's `use-embed` form in Qortal conversations so Hub
renders it inline. Qortal direct messages,
closed/private groups, private attachments,
and app notifications shipped in the 2.0.x releases and are available per
host tier — each gates on the host's advertised actions, and its controls
stay hidden on hosts that cannot support it. In
Qortal Hub specifically, direct messages are not offered at all — Hub
provides no way for an app to decrypt DM history — and private groups,
private attachments, and app notifications are likewise Home-only. Chat
always hides unsupported revision controls instead of broadcasting them as
unrelated new messages. On Hub, Chat hands its Hub-v3 envelope to
`SEND_CHAT_MESSAGE` as `fullMessageObject` (Hub sends that verbatim), never
as `message`, which Hub would wrap into a second Tiptap document; Home 2's
`qortalRequest` global takes the envelope in `message` and validates it.
Reticulum/RCHAT remains a later, separate source family.

The working plan for completing both Qortium and Qortal CHAT capabilities is in
[`docs/CHAT_COMPLETION_ROADMAP.md`](docs/CHAT_COMPLETION_ROADMAP.md).
