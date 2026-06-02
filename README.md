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

## Current Limits

This app does not handle private keys or transaction signing directly. Group
joins, group chat sends, closed-group chat reads, direct private chat reads, and
direct private chat sends are delegated to Qortium Home's account-safe approval
bridge. Browser development remains read-only and cannot decrypt or send direct
private chat without Home.
