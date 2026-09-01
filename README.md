# Qortium Chat

A QDN chat app for Qortium Home 2 and, on the Qortal side, Qortal Hub.
Qortium conversations use `window.qdnRequest`; Qortal conversations use the
dedicated `qortalRequest` global — Home 2's window property or Qortal Hub's
injected classic bridge — with a compatibility adapter retained for the older
Qortal-prefixed `window.qdnRequest` actions of Home 1.7. Every feature gates
on the host's advertised actions (`SHOW_ACTIONS`) and structured runtime
errors, so the same build degrades cleanly on hosts with a smaller action
surface. The app follows Home's display settings, including the Classic,
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
version is 2.0.9, where the `2.0` prefix declares the minimum Qortium platform
level the app is built against (Qortium Home 2) and the last number is the
app's own release counter. The build emits a `qortium-app.json` manifest (see
`vite.config.ts`) that Qortium Home reads from the published root to show the
compatibility badge. The manifest is ignored by Qortal Hub, where the same
bundle runs against the classic `qortalRequest` surface.

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
language in the app.

For a publish pass, confirm the local Core is fully synchronized before running
`npm run qdn:publish`. The expected identified render URL is
`http://127.0.0.1:24891/render/APP/Chat/Chat`,
and the published resource should report `READY` at
`/arbitrary/resource/status/APP/Chat/Chat?build=true`.

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
restart-safe pending-transaction journal when the host provides it. Browser
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
actions, bounded discovery, and read-only previews for qualifying active open
groups. Public-group attachments work on every host that can publish to QDN: through
Home's native picker where it is offered (Home 1.3+, Home 2), otherwise by
reading the file in the app and publishing it inline (older Home 1.x, Qortal Hub);
pasting or dropping a file into the composer stages it wherever the host
accepts inline bytes (everywhere except Home 2 desktop, which needs a Home
change first — see `docs/CHAT_ATTACHMENTS.md`). The composer can also link any
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
unrelated new messages. Reticulum/RCHAT remains a later, separate source
family.

The working plan for completing both Qortium and Qortal CHAT capabilities is in
[`docs/CHAT_COMPLETION_ROADMAP.md`](docs/CHAT_COMPLETION_ROADMAP.md).
