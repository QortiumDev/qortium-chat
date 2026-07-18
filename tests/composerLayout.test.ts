import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

function getRule(selector: string, requiredDeclaration?: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...styles.matchAll(new RegExp(`${escapedSelector}\\s*\\{([^}]+)\\}`, 'g'))];
  const match = requiredDeclaration
    ? matches.find((candidate) => candidate[1].includes(requiredDeclaration))
    : matches[0];

  expect(match, `Expected a ${selector} rule`).toBeDefined();
  return match?.[1] ?? '';
}

describe('composer layout CSS', () => {
  it('keeps long unbroken messages from setting the desktop flex width', () => {
    const composerRule = getRule('.composer', 'padding-top');
    const textareaRule = getRule('.composer textarea', 'field-sizing');

    expect(composerRule).toMatch(/min-width:\s*0\s*;/);
    expect(composerRule).toMatch(/max-width:\s*100%\s*;/);
    expect(textareaRule).toMatch(/flex:\s*1 1 0\s*;/);
    expect(textareaRule).toMatch(/width:\s*100%\s*;/);
    expect(textareaRule).toMatch(/max-width:\s*100%\s*;/);
    expect(textareaRule).toMatch(/overflow-wrap:\s*anywhere\s*;/);
  });

  it('keeps the textarea on its own row in the narrow layout', () => {
    const narrowComposer = styles.match(
      /@media\s*\(max-width:\s*600px\)[\s\S]*?\.composer textarea\s*\{([^}]+)\}/,
    );

    expect(narrowComposer, 'Expected the narrow composer textarea rule').toBeDefined();
    expect(narrowComposer?.[1]).toMatch(/flex-basis:\s*100%\s*;/);
    expect(narrowComposer?.[1]).toMatch(/width:\s*100%\s*;/);
  });
});
