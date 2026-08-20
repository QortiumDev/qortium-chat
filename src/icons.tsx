// The WebP is the same icon at ~28% of the PNG's size; it is inlined into the
// bundle (see vite.config.ts), so the smaller encoding matters. Every
// QDN-capable browser supports WebP (the avatar pipeline already allows it).
import chatIcon from './assets/brand/qortium-chat-icon.webp';

// Self-contained icons used across the chat UI. Most are stroke-based and inherit
// color via `currentColor`; sizing comes from the consuming CSS.

export function SearchIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path d="m21 21-4.35-4.35" />
      <circle cx="11" cy="11" r="7" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

export function OwnerIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path d="M4 18h16" />
      <path d="m5 8 4 4 3-6 3 6 4-4-1.5 10h-11z" />
    </svg>
  );
}

export function AdminIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path d="M12 3 5.5 6v5.5c0 4.25 2.7 7.25 6.5 9.5 3.8-2.25 6.5-5.25 6.5-9.5V6z" />
      <path d="m9 12 2 2 4-5" />
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <rect height="11" rx="2" width="14" x="5" y="10" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function UnavailableIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8" />
      <path d="m6.35 6.35 11.3 11.3" />
    </svg>
  );
}

export function BackIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path d="m15 5-7 7 7 7" />
    </svg>
  );
}

export function DownIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function UpIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path d="m6 15 6-6 6 6" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </svg>
  );
}

export function BellIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </svg>
  );
}

export function BrandMark() {
  return <img className="topbar__brand-mark" src={chatIcon} alt="" aria-hidden="true" />;
}
