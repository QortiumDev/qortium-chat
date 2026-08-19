import type { ReactNode } from 'react';

// Owns the outermost `<main class="app-shell">` wrapper and the structural
// `<section class="layout">` grid beneath it. `isHomeV2AppTab` toggles the
// Home v2 bridge modifier; `layoutClassName` is the already-computed
// `layout`/`layout--members-open`/`layout--mobile-chat` class string (App.tsx
// keeps owning that derivation since it depends on several pieces of chat
// state). `topbar` and `dialogs` are pre-built slots so DOM order stays
// exactly: header, then the layout section, then the trailing dialogs — as
// direct children of `<main>`, matching the pre-extraction markup.
export function AppShell({
  children,
  dialogs,
  isHomeV2AppTab,
  layoutClassName,
  topbar,
}: {
  children: ReactNode;
  dialogs?: ReactNode;
  isHomeV2AppTab: boolean;
  layoutClassName: string;
  topbar: ReactNode;
}) {
  return (
    <main className={`app-shell${isHomeV2AppTab ? ' app-shell--home-v2' : ''}`}>
      {topbar}
      <section className={layoutClassName}>{children}</section>
      {dialogs}
    </main>
  );
}
