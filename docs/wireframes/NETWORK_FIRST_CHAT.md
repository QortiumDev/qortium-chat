# Network-first Chat wireframes

Status: approved direction. The first production tranche implements the
embedded shell, network rail, joined/discovery labels, conversation context,
and reserved initials avatars. The HTML/PNG files remain design references.

## Decision represented

Chat keeps Qortium and Qortal as separate, simultaneously visible navigation
sections. Each network ultimately owns its own Direct, Joined groups, and
Discover surfaces. There is no global network switcher. The current Qortal
bridge slice exposes groups only; Qortal direct messages stay in the roadmap
rather than appearing as a non-functional placeholder.

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

## Production boundary after the first tranche

- Home v2 embedded mode is selected only by the explicit `homeV2Bridge=1`
  contract. Standalone and gateway Chat keep the full branded masthead.
- Qortium and Qortal group rails show their current `CHAT` source. No `RCHAT`
  badge is rendered until that protocol is implemented and honestly usable.
- Discover remains an explicit, bounded search. It does not poll the public
  catalogue or interrupt an open conversation in the background.
- Administrative header actions and component extraction remain follow-up UI
  work. Link cards, shared group avatars, Qortal direct messages, and RCHAT are
  not part of this tranche.

## Review files

- `network-first-chat.html` — responsive, self-contained wireframe.
- `network-first-chat-desktop.png` — desktop conversation state.
- `network-first-chat-mobile-list.png` — mobile network rail.
- `network-first-chat-mobile-chat.png` — mobile conversation state.

Regenerate the PNGs with:

```bash
npm run wireframe:capture
```
