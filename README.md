# Qortium Chat

A small QDN app for Qortium Home that can browse groups, join groups, send group
chat, open direct chats, send direct private chat, and read public or approved
private chat using the current `qdnRequest` bridge.

On Home versions that expose app notifications, the bell beside the selected
account lets the user opt in to Chat notifications. Chat registers one durable
incoming-direct-message rule for the selected account, re-registers it after an
account change, and removes it when the bell is turned off. While Chat is loaded,
mentions and replies in the selected group can also produce a notification when
the app is not focused. The app feature-detects the notification actions, so
older Home versions and browser development remain unaffected.

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

## Qortium Home Smoke Check

Before publishing a new QDN build:

```sh
npm test
npm run build
```

Then open `qdn://APP/Chat/Chat` in Qortium Home with a local
node selected and an unlocked tab account. Confirm that the status pill reports
Home, account approval succeeds, group search loads, joined groups and active
direct chats load, group join/send requests open Home approval prompts, direct
chat can be opened by address, direct private send/read requests use Home's
approval bridge, joined group leave requests open a Home approval prompt, Home
display settings update theme, text size, accent, and language in the app, and
encrypted/binary/unsupported message placeholders render in the selected
language.

For a publish pass, confirm the local Core is fully synchronized before running
`npm run qdn:publish`. The expected identified render URL is
`http://127.0.0.1:24891/render/APP/Chat?identifier=Chat`,
and the published resource should report `READY` at
`/arbitrary/resource/status/APP/Chat/Chat?build=true`.

## Current Limits

This app does not handle private keys or transaction signing directly. Group
joins, group chat sends, closed-group chat reads, direct private chat reads,
direct private chat sends, and minting key registration are delegated to
Qortium Home's account-safe approval bridge; the app never sees the minting
key. Browser development remains read-only and cannot decrypt or send direct
private chat without Home. Background direct-message notifications require
Home to remain running; Android delivery currently requires Home to remain in
the foreground. Closed-tab group mention detection is not available because
Core deliberately excludes message content from notification events.
