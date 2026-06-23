import { useEffect, useRef } from 'react';

const DIALOG_FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getDialogFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE_SELECTOR)).filter(
    (element) => element.offsetParent !== null || element === document.activeElement,
  );
}

// Shared modal behavior for the overlay dialogs: move focus inside on open, keep
// Tab cycling within the dialog, close on Escape, and restore focus to the
// previously focused element on dismissal. Mirrors the members-drawer pattern so
// the dialogs honor the aria-modal they already declare.
export function useModalDialog<T extends HTMLElement = HTMLElement>(onClose: () => void) {
  const containerRef = useRef<T>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const container = containerRef.current;
    const initialFocusables = container ? getDialogFocusable(container) : [];

    (initialFocusables[0] ?? container)?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !container) {
        return;
      }

      const items = getDialogFocusable(container);

      if (items.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !container.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !container.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return containerRef;
}
