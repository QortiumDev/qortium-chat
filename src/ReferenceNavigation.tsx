import { useEffect, type MouseEvent } from 'react';

import { getChatViewUrl } from './deepLink';

// Section order of the Developers reference. Ids double as URL fragments.
export const REFERENCE_SECTIONS = [
  ['envelope', 'Envelope'],
  ['machine-messages', 'Machine messages'],
  ['chains', 'Qortium vs Qortal'],
  ['limits', 'Limits'],
  ['bridge', 'Home bridge'],
  ['outcomes', 'Outcomes'],
  ['discovery', 'Discovery'],
  ['attachments', 'Attachments'],
] as const;

export type ReferenceSectionId = (typeof REFERENCE_SECTIONS)[number][0];

// Scrolling stops at Chat's own shell so section navigation can never move
// Home's outer document (Android renders the app inside Home's page).
export const APP_ROOT_SELECTOR = '.app-shell';

export function isReferenceSectionId(value: string): value is ReferenceSectionId {
  return REFERENCE_SECTIONS.some(([id]) => id === value);
}

// Section links are full document URLs built from the live location (path
// and query kept, hash set) rather than bare `#id` fragments, which resolve
// against Core's injected <base> instead of the current page.
export function referenceSectionUrl(input: string, id: ReferenceSectionId) {
  const url = new URL(input, 'http://localhost');
  url.hash = id;

  return getChatViewUrl('developers', { hash: url.hash, pathname: url.pathname, search: url.search });
}

type ScrollableLike = {
  clientHeight: number;
  closest(selector: string): ScrollableLike | null;
  getBoundingClientRect(): { top: number };
  parentElement: ScrollableLike | null;
  scrollHeight: number;
  scrollTop: number;
};

type SectionLike = ScrollableLike & {
  focus(options?: { preventScroll?: boolean }): void;
};

export type ReferenceScrollDependencies = {
  getComputedStyle(element: ScrollableLike): { overflowY: string };
  getElementById(id: string): SectionLike | null;
  scrollingElement: ScrollableLike | null;
};

function getDefaultScrollDependencies(): ReferenceScrollDependencies {
  return {
    getComputedStyle: (element) => window.getComputedStyle(element as unknown as Element),
    getElementById: (id) => document.getElementById(id) as unknown as SectionLike | null,
    scrollingElement: document.scrollingElement as unknown as ScrollableLike | null,
  };
}

// The nearest overflow auto/scroll ancestor that actually overflows, bounded
// at the app root. In the Developers workspace that is `.layout--developers`
// at every width; the shell itself is never a candidate.
export function findReferenceScrollContainer(
  section: ScrollableLike,
  getComputedStyle: ReferenceScrollDependencies['getComputedStyle'],
): ScrollableLike | null {
  const shell = section.closest(APP_ROOT_SELECTOR);
  let container = section.parentElement;

  while (container && container !== shell) {
    if (
      /(auto|scroll)/.test(getComputedStyle(container).overflowY) &&
      container.scrollHeight > container.clientHeight
    ) {
      return container;
    }

    container = container.parentElement;
  }

  return null;
}

// Scrolls the reference's own scroll owner to a section and focuses it
// without scrolling. Never uses scrollIntoView (it can scroll Home's outer
// Android document). Returns which element was scrolled, for tests.
export function scrollReferenceSection(
  id: string,
  dependencies: ReferenceScrollDependencies = getDefaultScrollDependencies(),
): 'container' | 'document' | null {
  if (!isReferenceSectionId(id)) {
    return null;
  }

  const section = dependencies.getElementById(id);

  if (!section) {
    return null;
  }

  const container = findReferenceScrollContainer(section, dependencies.getComputedStyle);
  const target = container ?? dependencies.scrollingElement;
  let scrolled: 'container' | 'document' | null = null;

  if (target) {
    target.scrollTop += section.getBoundingClientRect().top - target.getBoundingClientRect().top;
    scrolled = container ? 'container' : 'document';
  }

  section.focus({ preventScroll: true });

  return scrolled;
}

function scrollToLocationHash() {
  scrollReferenceSection(window.location.hash.slice(1));
}

export function ReferenceNavigation() {
  useEffect(() => {
    scrollToLocationHash();
    window.addEventListener('popstate', scrollToLocationHash);
    window.addEventListener('hashchange', scrollToLocationHash);

    return () => {
      window.removeEventListener('popstate', scrollToLocationHash);
      window.removeEventListener('hashchange', scrollToLocationHash);
    };
  }, []);

  function visit(event: MouseEvent<HTMLAnchorElement>, id: ReferenceSectionId) {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    event.preventDefault();

    if (window.location.hash !== `#${id}`) {
      window.history.pushState(window.history.state, '', referenceSectionUrl(window.location.href, id));
    }

    scrollReferenceSection(id);
  }

  const base = typeof window === 'undefined' ? '/?view=developers' : window.location.href;

  return (
    <nav aria-label="Developer reference sections" className="reference-toc">
      {REFERENCE_SECTIONS.map(([id, label]) => (
        <a href={referenceSectionUrl(base, id)} key={id} onClick={(event) => visit(event, id)}>
          {label}
        </a>
      ))}
    </nav>
  );
}
