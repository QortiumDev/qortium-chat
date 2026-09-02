import { describe, expect, it } from 'vitest';

// Pins the Classic network-tint contract in styles.css (owner request,
// 2026-09-01): each theme has a Qortium and a Qortal neutral palette keyed on
// `data-network`, scoped to Classic only, and every block also reaches into
// the Home 2 app-tab shell (which otherwise overrides the same tokens). Read
// from disk on purpose: vitest resolves `./styles.css?raw` to an empty string
// here (verified 2026-09-01), so a `?raw` import would pin nothing. The app
// tsconfig deliberately excludes Node ambient types (adding them breaks the
// browser timer typings in other tests), hence the untyped dynamic import.
const nodeFsSpecifier = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ nodeFsSpecifier)) as {
  readFileSync: (path: URL, encoding: 'utf8') => string;
};
const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

const NEUTRAL_TOKENS = [
  '--qc-color-page-bg',
  '--qc-color-surface',
  '--qc-color-message-bg',
  '--qc-color-border',
  '--qc-color-muted',
  '--qc-color-chip-bg',
];

function blockFor(selector: string) {
  const start = css.indexOf(selector);
  expect(start, `selector missing: ${selector}`).toBeGreaterThanOrEqual(0);
  const open = css.indexOf('{', start);
  return css.slice(open, css.indexOf('}', open));
}

describe('Classic network tint tokens', () => {
  it('sees the real stylesheet, not a stub', () => {
    expect(css.length).toBeGreaterThan(50_000);
    expect(css).toContain(':root {');
  });

  it.each([
    ["light", 'qortium'],
    ["light", 'qortal'],
    ["dark", 'qortal'],
  ])('%s %s block redefines the neutral tokens for the root and the Home 2 shell', (theme, network) => {
    const rootSelector = `:root[data-theme='${theme}'][data-ui='classic'][data-network='${network}'],`;
    const shellSelector = `:root[data-theme='${theme}'][data-ui='classic'][data-network='${network}'] .app-shell--home-v2 {`;
    const block = blockFor(rootSelector);

    expect(css.slice(css.indexOf(rootSelector), css.indexOf(shellSelector) + shellSelector.length)).toContain(shellSelector);
    for (const token of NEUTRAL_TOKENS) {
      expect(block, `${theme}/${network} lacks ${token}`).toContain(`${token}:`);
    }
  });

  it('dark qortium restates the base dark greys inside the Home 2 shell only', () => {
    const block = blockFor(":root[data-theme='dark'][data-ui='classic'][data-network='qortium'] .app-shell--home-v2 {");

    expect(block).toContain('--qc-color-page-bg: #0e1111;');
    expect(block).toContain('--qc-color-surface: #161d1d;');
    // No bare dark-qortium root block: the base :root[data-theme='dark']
    // palette IS the dark Qortium tint.
    expect(css).not.toContain(":root[data-theme='dark'][data-ui='classic'][data-network='qortium'],");
  });

  it('never tints outside Classic and never touches the accent', () => {
    const tintSelectors = css.match(/^[^\n]*\[data-network=[^\n]*$/gm) ?? [];

    expect(tintSelectors.length).toBeGreaterThanOrEqual(7);
    for (const selector of tintSelectors) {
      expect(selector).toContain("[data-ui='classic']");
    }
    for (const network of ['qortium', 'qortal']) {
      for (const theme of ['light', 'dark']) {
        const selector = `:root[data-theme='${theme}'][data-ui='classic'][data-network='${network}']`;
        if (!css.includes(selector)) continue;
        expect(blockFor(selector)).not.toMatch(/--qc-color-accent|--qc-gradient-primary/);
      }
    }
  });

  it('fades the large chrome surfaces on a network switch', () => {
    expect(css).toMatch(/:root\[data-ui='classic'\] :is\(\.app-shell, \.topbar, \.sidebar, \.panel, \.chat-pane, \.composer, \.members-drawer\) \{\n  transition: background-color 220ms ease, border-color 220ms ease;/);
  });
});
