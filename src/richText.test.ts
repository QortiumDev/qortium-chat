import { describe, expect, it } from 'vitest';
import {
  escapeRichText,
  hasRichTextMarkup,
  parseRichText,
  richTextToMarkup,
  richTextToParagraphHtml,
  richTextToPlainText,
  richTextToTiptapDoc,
  stripRichTextMarkup,
  tiptapDocToRichText,
} from './richText';

const text = (value: string, marks = {}) => ({ kind: 'text', marks, text: value });

describe('parseRichText', () => {
  it('parses inline marks, nesting, escapes and code spans', () => {
    expect(parseRichText('a **b *c*** ~~d~~ `e**f` _g_')).toEqual([
      {
        kind: 'paragraph',
        inlines: [
          text('a '),
          text('b ', { bold: true }),
          text('c', { bold: true, italic: true }),
          text(' '),
          text('d', { strike: true }),
          text(' '),
          text('e**f', { code: true }),
          text(' '),
          text('g', { italic: true }),
        ],
      },
    ]);
    expect(parseRichText('\\*not bold\\* and 2*3*4 snake_case_name')).toEqual([
      { kind: 'paragraph', inlines: [text('*not bold* and 2*3*4 snake_case_name')] },
    ]);
    // Unbalanced or space-adjacent markers stay literal.
    expect(parseRichText('** not bold** and *x')).toEqual([{ kind: 'paragraph', inlines: [text('** not bold** and *x')] }]);
  });

  it('parses mentions, bullet lists and fenced code blocks', () => {
    expect(parseRichText('hi @alice and @[Bob Smith], mail me@x.io')).toEqual([
      {
        kind: 'paragraph',
        inlines: [
          text('hi '),
          { address: null, kind: 'mention', name: 'alice' },
          text(' and '),
          { address: null, kind: 'mention', name: 'Bob Smith' },
          text(', mail me@x.io'),
        ],
      },
    ]);
    expect(parseRichText('- one\n* **two**\nafter\n```js\nlet x = 1;\n```')).toEqual([
      { kind: 'bulletList', items: [[text('one')], [text('two', { bold: true })]] },
      { kind: 'paragraph', inlines: [text('after')] },
      { kind: 'codeBlock', lang: 'js', text: 'let x = 1;' },
    ]);
    // An unterminated fence is ordinary text.
    expect(parseRichText('```\nno end')[0]).toEqual({ kind: 'paragraph', inlines: [text('```')] });
  });

  it('round-trips markup and reports plain text', () => {
    for (const markup of ['plain', '**b** *i* ~~s~~ `c`', '- a\n- b', '```\ncode\n```', '@alice @[Bob Smith]', 'x \\*y\\*']) {
      expect(richTextToMarkup(parseRichText(markup))).toBe(markup);
    }
    expect(stripRichTextMarkup('**b** *i* `c` @alice\n- item')).toBe('b i c @alice\n• item');
    expect(hasRichTextMarkup('plain text')).toBe(false);
    expect(hasRichTextMarkup('**bold**')).toBe(true);
    expect(escapeRichText('*a* _b_ @c c@d `e`')).toBe('\\*a\\* \\_b\\_ \\@c c@d \\`e\\`');
  });
});

describe('Tiptap documents', () => {
  it('builds the Hub schema and reads it back', () => {
    const blocks = parseRichText('**hi** @alice\n- a\n```\nc\n```');
    const doc = richTextToTiptapDoc(blocks);
    expect(doc).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'hi', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' ' },
            { type: 'mention', attrs: { id: 'alice', label: 'alice' } },
          ],
        },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }] }] },
        { type: 'codeBlock', attrs: { language: null }, content: [{ type: 'text', text: 'c' }] },
      ],
    });
    expect(richTextToMarkup(tiptapDocToRichText(doc))).toBe('**hi** @alice\n- a\n```\nc\n```');
  });

  it('reads Hub documents with headings, hard breaks, links, quotes and unknown nodes', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'see ', marks: [{ type: 'italic' }, { type: 'underline' }] },
            { type: 'text', text: 'docs', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] },
            { type: 'hardBreak' },
            { type: 'text', text: 'line *two*' },
          ],
        },
        { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'q' }] }] },
        { type: 'image', attrs: { src: 'x' } },
        { type: 'orderedList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first' }] }] }] },
      ],
    };
    const blocks = tiptapDocToRichText(doc, (href) => (href.startsWith('https://') ? href : null));
    expect(richTextToMarkup(blocks)).toBe('**Title**\n*see *docs (https://example.com)\nline \\*two\\*\n> q\n- first');
    expect(richTextToPlainText(blocks)).toBe('Title\nsee docs (https://example.com)\nline *two*\n> q\n• first');
  });

  it('caps pathological documents instead of recursing forever', () => {
    let node: unknown = { type: 'text', text: 'deep' };
    for (let depth = 0; depth < 50; depth += 1) node = { type: 'paragraph', content: [node] };
    expect(tiptapDocToRichText({ type: 'doc', content: [node] })).toEqual([{ inlines: [], kind: 'paragraph' }]);
    expect(tiptapDocToRichText('not a doc')).toEqual([]);
  });

  it('renders Hub-style paragraph HTML for direct messages', () => {
    expect(richTextToParagraphHtml(parseRichText('**b** <x> @alice\n- i\n```\nc\n```'))).toBe(
      '<p><strong>b</strong> &lt;x&gt; <span class="mention" data-type="mention" data-id="alice" data-label="alice">@alice</span></p><ul><li><p>i</p></li></ul><pre><code>c</code></pre>',
    );
  });
});
