import type { ReactNode } from 'react';

// Thin structural wrapper for the `<aside class="sidebar">` container. The
// panel contents (invites, direct/group lists, network sections) stay
// written inline in App.tsx and are passed through as children — they are
// too deeply coupled to App's local state/handlers to extract cleanly here,
// and this component's job is only to own the container element + its
// aria/inert attributes.
export function SidebarPane({
  ariaLabel,
  children,
  inert,
}: {
  ariaLabel: string;
  children: ReactNode;
  inert?: boolean;
}) {
  return (
    <aside aria-label={ariaLabel} className="sidebar" inert={inert || undefined}>
      {children}
    </aside>
  );
}
