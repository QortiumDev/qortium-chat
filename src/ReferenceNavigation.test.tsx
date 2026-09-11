import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi, type Mock } from 'vitest';

import { parseChatView, parseDeepLinkSearch } from './deepLink';
import {
  APP_ROOT_SELECTOR,
  findReferenceScrollContainer,
  REFERENCE_SECTIONS,
  ReferenceNavigation,
  referenceSectionUrl,
  scrollReferenceSection,
} from './ReferenceNavigation';

const address = `Q${'1'.repeat(33)}`;

type FakeNode = {
  clientHeight: number;
  closest: (selector: string) => FakeNode | null;
  focus: Mock<(options?: { preventScroll?: boolean }) => void>;
  getBoundingClientRect: () => { top: number };
  overflowY: string;
  parentElement: FakeNode | null;
  scrollHeight: number;
  scrollIntoView: ReturnType<typeof vi.fn>;
  scrollTop: number;
};

function node(overrides: Partial<FakeNode> = {}): FakeNode {
  const created: FakeNode = {
    clientHeight: 100,
    closest: () => null,
    focus: vi.fn<(options?: { preventScroll?: boolean }) => void>(),
    getBoundingClientRect: () => ({ top: 0 }),
    overflowY: 'visible',
    parentElement: null,
    scrollHeight: 100,
    scrollIntoView: vi.fn(),
    scrollTop: 0,
    ...overrides,
  };

  return created;
}

// Mirrors the Developers workspace DOM: shell > layout--developers (scroll
// owner at every width) > developer-reference > section.
function buildTree(sectionTop: number) {
  const shell = node({ overflowY: 'hidden' });
  const layout = node({ clientHeight: 400, overflowY: 'auto', parentElement: shell, scrollHeight: 3000, scrollTop: 120 });
  const reference = node({ parentElement: layout });
  const section = node({ getBoundingClientRect: () => ({ top: sectionTop }), parentElement: reference });

  for (const candidate of [layout, reference, section]) {
    candidate.closest = (selector) => (selector === APP_ROOT_SELECTOR ? shell : null);
  }

  return { layout, reference, section, shell };
}

function dependencies(tree: ReturnType<typeof buildTree>, id = 'limits', scrollingElement: FakeNode | null = null) {
  return {
    getComputedStyle: (element: unknown) => ({ overflowY: (element as FakeNode).overflowY }),
    getElementById: (requested: string) => (requested === id ? tree.section : null),
    scrollingElement,
  };
}

describe('reference section links', () => {
  it('builds document links from the live location, keeping the conversation and host keys', () => {
    const href = referenceSectionUrl(
      `https://node.test/render/APP/Chat/Chat/?view=reference&view=developer&group=4&network=qortal&address=${address}&homeV2Bridge=1&theme=dark&future=a&future=b#old`,
      'limits',
    );
    const target = new URL(href, 'https://node.test/render/APP/Chat/Chat/');

    expect(target.pathname).toBe('/render/APP/Chat/Chat/');
    expect(target.searchParams.getAll('view')).toEqual(['developers']);
    expect(target.searchParams.get('homeV2Bridge')).toBe('1');
    expect(target.searchParams.get('theme')).toBe('dark');
    expect(target.searchParams.getAll('future')).toEqual(['a', 'b']);
    expect(target.hash).toBe('#limits');
    expect(parseChatView(target.search)).toBe('developers');
    expect(parseDeepLinkSearch(target.search)).toEqual({ address, group: 4, network: 'qortal' });
  });

  it('renders a labelled nav with a real document link per section, never a bare fragment', () => {
    const html = renderToStaticMarkup(<ReferenceNavigation />);

    expect(html).toContain('aria-label="Developer reference sections"');
    for (const [id] of REFERENCE_SECTIONS) {
      expect(html).toContain(`href="/?view=developers#${id}"`);
    }
    expect(html).not.toContain('href="#');
  });
});

describe('reference section scrolling', () => {
  it('scrolls only the nearest overflowing ancestor inside the shell and focuses without scrolling', () => {
    const tree = buildTree(250);

    expect(findReferenceScrollContainer(tree.section, dependencies(tree).getComputedStyle)).toBe(tree.layout);
    expect(scrollReferenceSection('limits', dependencies(tree))).toBe('container');
    expect(tree.layout.scrollTop).toBe(370);
    expect(tree.shell.scrollTop).toBe(0);
    expect(tree.section.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(tree.section.scrollIntoView).not.toHaveBeenCalled();
  });

  it('stops at the app shell: a scrollable shell is never the scroll target', () => {
    const tree = buildTree(250);
    tree.layout.overflowY = 'visible';
    tree.shell.overflowY = 'auto';
    tree.shell.scrollHeight = 5000;
    const scrollingElement = node({ scrollTop: 40 });

    expect(findReferenceScrollContainer(tree.section, dependencies(tree).getComputedStyle)).toBeNull();
    expect(scrollReferenceSection('limits', dependencies(tree, 'limits', scrollingElement))).toBe('document');
    expect(tree.shell.scrollTop).toBe(0);
    expect(scrollingElement.scrollTop).toBe(290);
    expect(tree.section.focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('ignores unknown or missing sections', () => {
    const tree = buildTree(10);

    expect(scrollReferenceSection('not-a-section', dependencies(tree))).toBeNull();
    expect(scrollReferenceSection('envelope', dependencies(tree))).toBeNull();
    expect(tree.layout.scrollTop).toBe(120);
    expect(tree.section.focus).not.toHaveBeenCalled();
  });
});
