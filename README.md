# Qortium Chat

A small QDN app for Qortium Home that can browse groups, join groups, send group
chat, open direct chats, send direct private chat, and read public or approved
private chat using the current `qdnRequest` bridge.

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

By default the publish helper uploads `dist/` as
`qdn://APP/QortiumHomeTest/qortium-chat` through `http://127.0.0.1:24891`, using
the ignored preview API key and local preview account files under
`~/git/qortium/preview`.

## Qortium Home Smoke Check

Before publishing a new QDN build:

```sh
npm test
npm run build
```

Then open `qdn://APP/QortiumHomeTest/qortium-chat` in Qortium Home with a local
node selected and an unlocked tab account. Confirm that the status pill reports
Home, account approval succeeds, group search loads, joined groups and active
direct chats load, group join/send requests open Home approval prompts, direct
chat can be opened by address, and direct private send/read requests use Home's
approval bridge.

For a publish pass, confirm the local Core is fully synchronized before running
`npm run qdn:publish`. The expected identified render URL is
`http://127.0.0.1:24891/render/APP/QortiumHomeTest?identifier=qortium-chat`,
and the published resource should report `READY` at
`/arbitrary/resource/status/APP/QortiumHomeTest/qortium-chat?build=true`.

## Current Limits

This app does not handle private keys or transaction signing directly. Group
joins, group chat sends, closed-group chat reads, direct private chat reads, and
direct private chat sends are delegated to Qortium Home's account-safe approval
bridge. Browser development remains read-only and cannot decrypt or send direct
private chat without Home.
