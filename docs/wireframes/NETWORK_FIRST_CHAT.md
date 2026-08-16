# Network-first Chat wireframes

Status: review-only product artifact. These files do not change the production
Chat application.

## Decision represented

Chat keeps Qortium and Qortal as separate, simultaneously visible navigation
sections. Each network owns its own Direct, Joined groups, and Discover
surfaces. There is no global network switcher.

Every conversation also carries its protocol source (`CHAT` or `RCHAT`). This
keeps Qortal legacy CHAT and Qortal RCHAT distinct without splitting them into
different apps or hiding either network.

## Membership and discovery rules

- Joined groups are normal interactive conversations.
- Discover contains only open/public groups whose recent activity has been
  confirmed by a bounded message read.
- Unjoined discovery rows are visibly marked `Preview` and open read-only.
- Closed/private unjoined groups and public groups without messages are absent.
- Explicit search can query the wider public catalogue.

## Layout decisions

- Embedded Home mode uses a compact Chat utility header instead of repeating
  the full brand and account masthead already supplied by Home.
- Desktop keeps the network-first rail and conversation visible together.
- Mobile uses separate full-height list and conversation views.
- Conversation headers show network and protocol badges, membership context,
  and one primary action. Administrative actions move into an overflow menu.
- Group-avatar space is reserved without implementing the future avatar
  descriptor/resolver contract.
- Direct conversation titles prefer names. Full addresses belong in account
  details rather than the ordinary conversation header.

## Review files

- `network-first-chat.html` — responsive, self-contained wireframe.
- `network-first-chat-desktop.png` — desktop conversation state.
- `network-first-chat-mobile-list.png` — mobile network rail.
- `network-first-chat-mobile-chat.png` — mobile conversation state.

Regenerate the PNGs with:

```bash
npm run wireframe:capture
```
