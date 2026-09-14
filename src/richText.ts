// Chat 2.0.19 — rich text (parity gap G1, decision D-A 2026-09-14).
//
// Chat's canonical representation stays a STRING: a lightweight inline
// markup the composer can type and every text consumer (snippets, search,
// notifications, edit prefill) can carry unchanged. The markup is parsed into
// a small block/inline tree for rendering and for the Qortal wire, where Hub
// clients expect a Tiptap document; Hub documents are converted back into the
// same markup on read so Hub-authored formatting renders here too.
//
// Grammar (deliberately small — the D-A subset):
//   **bold**   *italic* or _italic_   ~~strike~~   `code`
//   ```lang … ```       fenced code block (whole lines)
//   - item / * item     bullet list (consecutive lines)
//   @name or @[name with spaces]   mention
//   \x                  a literal marker character
// Bare URLs stay ordinary text: the link renderer (messageLinks.tsx) handles
// them exactly as before, so the copy-only http(s) stance (G7/D-E) is
// untouched by this file.
//
// On the QORTIUM wire the message text carries this markup verbatim (Chat is
// the only reader there); on the QORTAL wire it becomes the Tiptap doc below.

export type RichMarks = {
  bold?: true;
  code?: true;
  italic?: true;
  strike?: true;
};

export type RichInline =
  | { kind: 'text'; marks: RichMarks; text: string }
  | { address: string | null; kind: 'mention'; name: string };

export type RichBlock =
  | { inlines: RichInline[]; kind: 'paragraph' }
  | { kind: 'codeBlock'; lang: string; text: string }
  | { items: RichInline[][]; kind: 'bulletList' };

const MARKER_CHARACTERS = new Set(['*', '_', '~', '`', '@', '\\']);
const MENTION_NAME = /^[A-Za-z0-9._-]{1,40}/;
const MENTION_BRACKET = /^\[([^\]\n]{1,40})\]/;
// Marks that wrap inner content and may nest (bold inside italic etc.).
const WRAPPING_MARKS: ReadonlyArray<{ key: Exclude<keyof RichMarks, 'code'>; token: string }> = [
  { key: 'bold', token: '**' },
  { key: 'strike', token: '~~' },
  { key: 'italic', token: '*' },
  { key: 'italic', token: '_' },
];
const MAX_DOC_NODES = 4_000;
const MAX_DOC_DEPTH = 12;

function isWordCharacter(character: string | undefined) {
  return !!character && /[\p{L}\p{N}]/u.test(character);
}

function pushText(inlines: RichInline[], text: string, marks: RichMarks) {
  if (!text) return;
  const last = inlines[inlines.length - 1];
  if (last && last.kind === 'text' && sameMarks(last.marks, marks)) {
    last.text += text;
    return;
  }
  inlines.push({ kind: 'text', marks: { ...marks }, text });
}

function sameMarks(left: RichMarks, right: RichMarks) {
  return !!left.bold === !!right.bold && !!left.italic === !!right.italic && !!left.strike === !!right.strike && !!left.code === !!right.code;
}

// Finds the closing token for a wrapping mark opened at `start` (index just
// after the opener). A closer must not be preceded by whitespace and, for the
// single-character tokens, must not sit inside a word on the far side.
function findCloser(line: string, start: number, token: string) {
  let index = start;
  while (index < line.length) {
    const character = line[index];
    if (character === '\\') {
      index += 2;
      continue;
    }
    if (character === '`') {
      const end = line.indexOf('`', index + 1);
      if (end < 0) return -1;
      index = end + 1;
      continue;
    }
    if (line.startsWith(token, index) && index > start && !/\s/.test(line[index - 1] ?? '')) {
      // A longer run of the same marker ("***" closing "**b *c***") closes
      // the OUTER mark with its last characters, so the inner one can close
      // with the first.
      let run = 0;
      while (line[index + run] === token[0]) run += 1;
      const closer = run > token.length && token.length === 2 ? index + run - token.length : index;
      if (token === '**' || token === '~~' || !isWordCharacter(line[closer + token.length])) {
        return closer;
      }
    }
    index += 1;
  }
  return -1;
}

function parseInlines(line: string, inherited: RichMarks = {}): RichInline[] {
  const inlines: RichInline[] = [];
  let index = 0;

  while (index < line.length) {
    const character = line[index];

    if (character === '\\' && MARKER_CHARACTERS.has(line[index + 1] ?? '')) {
      pushText(inlines, line[index + 1]!, inherited);
      index += 2;
      continue;
    }

    if (character === '`') {
      const end = line.indexOf('`', index + 1);
      if (end > index + 1) {
        pushText(inlines, line.slice(index + 1, end), { ...inherited, code: true });
        index = end + 1;
        continue;
      }
    }

    if (character === '@') {
      const rest = line.slice(index + 1);
      const bracket = MENTION_BRACKET.exec(rest);
      const plain = bracket ? null : MENTION_NAME.exec(rest);
      const name = bracket ? bracket[1] : plain ? plain[0] : null;
      const previous = line[index - 1];
      if (name && !isWordCharacter(previous)) {
        inlines.push({ address: null, kind: 'mention', name });
        index += 1 + (bracket ? bracket[0].length : name.length);
        continue;
      }
    }

    let wrapped = false;
    for (const mark of WRAPPING_MARKS) {
      if (!line.startsWith(mark.token, index) || inherited[mark.key]) continue;
      const openerEnd = index + mark.token.length;
      const next = line[openerEnd];
      // An opener must be followed by non-space and, for single-character
      // tokens, must start at a word boundary (snake_case stays literal).
      if (!next || /\s/.test(next)) continue;
      if (mark.token.length === 1 && (isWordCharacter(line[index - 1]) || next === mark.token)) continue;
      const closer = findCloser(line, openerEnd, mark.token);
      if (closer < 0) continue;
      for (const inline of parseInlines(line.slice(openerEnd, closer), { ...inherited, [mark.key]: true })) {
        if (inline.kind === 'text') pushText(inlines, inline.text, inline.marks);
        else inlines.push(inline);
      }
      index = closer + mark.token.length;
      wrapped = true;
      break;
    }
    if (wrapped) continue;

    pushText(inlines, character, inherited);
    index += 1;
  }

  return inlines;
}

export function parseRichText(markup: string): RichBlock[] {
  const lines = markup.replace(/\r\n?/g, '\n').split('\n');
  const blocks: RichBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]!;
    const fence = /^```([\w+-]*)\s*$/.exec(line);

    if (fence) {
      const codeLines: string[] = [];
      let cursor = index + 1;
      while (cursor < lines.length && !/^```\s*$/.test(lines[cursor]!)) {
        codeLines.push(lines[cursor]!);
        cursor += 1;
      }
      if (cursor < lines.length) {
        blocks.push({ kind: 'codeBlock', lang: fence[1] ?? '', text: codeLines.join('\n') });
        index = cursor + 1;
        continue;
      }
      // Unterminated fence: literal text.
    }

    const bullet = /^[-*] (.*)$/.exec(line);
    if (bullet) {
      const items: RichInline[][] = [];
      let cursor = index;
      while (cursor < lines.length) {
        const item = /^[-*] (.*)$/.exec(lines[cursor]!);
        if (!item) break;
        items.push(parseInlines(item[1] ?? ''));
        cursor += 1;
      }
      blocks.push({ items, kind: 'bulletList' });
      index = cursor;
      continue;
    }

    blocks.push({ inlines: parseInlines(line), kind: 'paragraph' });
    index += 1;
  }

  return blocks;
}

// Escapes a literal string so parseRichText reads it back unchanged.
export function escapeRichText(text: string) {
  return text.replace(/([*_~`\\])/g, '\\$1').replace(/(?<![\p{L}\p{N}])@(?=[A-Za-z0-9._\-[])/gu, '\\@');
}

function escapeLineStart(line: string) {
  if (/^[-*] /.test(line)) return `\\${line}`;
  if (line.startsWith('```')) return `\\${line}`;
  return line;
}

function serializeInlines(inlines: RichInline[]) {
  let out = '';
  for (const inline of inlines) {
    if (inline.kind === 'mention') {
      out += /^[A-Za-z0-9._-]{1,40}$/.test(inline.name) ? `@${inline.name}` : `@[${inline.name.replace(/[\]\n]/g, ' ')}]`;
      continue;
    }
    let text = inline.marks.code ? inline.text.replace(/`/g, '\u02cb') : escapeRichText(inline.text);
    if (inline.marks.code) text = `\`${text}\``;
    if (inline.marks.strike) text = `~~${text}~~`;
    if (inline.marks.italic) text = `*${text}*`;
    if (inline.marks.bold) text = `**${text}**`;
    out += text;
  }
  return out;
}

export function richTextToMarkup(blocks: RichBlock[]) {
  return blocks
    .map((block) => {
      if (block.kind === 'codeBlock') {
        return `\`\`\`${block.lang}\n${block.text.replace(/^```/gm, '\u02cb``')}\n\`\`\``;
      }
      if (block.kind === 'bulletList') {
        return block.items.map((item) => `- ${serializeInlines(item)}`).join('\n');
      }
      return escapeLineStart(serializeInlines(block.inlines));
    })
    .join('\n');
}

// Marker-free text for snippets, notifications and search.
export function richTextToPlainText(blocks: RichBlock[]) {
  return blocks
    .map((block) => {
      if (block.kind === 'codeBlock') return block.text;
      if (block.kind === 'bulletList') return block.items.map((item) => `• ${plainInlines(item)}`).join('\n');
      return plainInlines(block.inlines);
    })
    .join('\n');
}

function plainInlines(inlines: RichInline[]) {
  return inlines.map((inline) => (inline.kind === 'mention' ? `@${inline.name}` : inline.text)).join('');
}

export function stripRichTextMarkup(markup: string) {
  return richTextToPlainText(parseRichText(markup));
}

export function hasRichTextMarkup(markup: string) {
  const blocks = parseRichText(markup);
  return blocks.some(
    (block) =>
      block.kind !== 'paragraph' ||
      block.inlines.some((inline) => inline.kind === 'mention' || Object.keys(inline.marks).length > 0),
  );
}

// ---------------------------------------------------------------------------
// Qortal Hub (Tiptap) documents

type TiptapMark = { attrs?: Record<string, unknown>; type: string };
type TiptapNode = { attrs?: Record<string, unknown>; content?: TiptapNode[]; marks?: TiptapMark[]; text?: string; type: string };

function inlineToTiptap(inline: RichInline): TiptapNode {
  if (inline.kind === 'mention') {
    return { attrs: { id: inline.address ?? inline.name, label: inline.name }, type: 'mention' };
  }
  const marks: TiptapMark[] = [];
  if (inline.marks.bold) marks.push({ type: 'bold' });
  if (inline.marks.italic) marks.push({ type: 'italic' });
  if (inline.marks.strike) marks.push({ type: 'strike' });
  if (inline.marks.code) marks.push({ type: 'code' });
  return { ...(marks.length > 0 ? { marks } : {}), text: inline.text, type: 'text' };
}

function paragraphToTiptap(inlines: RichInline[]): TiptapNode {
  const content = inlines.filter((inline) => inline.kind === 'mention' || inline.text).map(inlineToTiptap);
  return { ...(content.length > 0 ? { content } : {}), type: 'paragraph' };
}

/** The document shape Hub's Tiptap editor (StarterKit + Mention) reads and writes. */
export function richTextToTiptapDoc(blocks: RichBlock[]) {
  const content: TiptapNode[] = blocks.map((block) => {
    if (block.kind === 'codeBlock') {
      return {
        attrs: { language: block.lang || null },
        ...(block.text ? { content: [{ text: block.text, type: 'text' }] } : {}),
        type: 'codeBlock',
      };
    }
    if (block.kind === 'bulletList') {
      return {
        content: block.items.map((item) => ({ content: [paragraphToTiptap(item)], type: 'listItem' })),
        type: 'bulletList',
      };
    }
    return paragraphToTiptap(block.inlines);
  });
  return { content: content.length > 0 ? content : [{ type: 'paragraph' }], type: 'doc' };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function safeString(value: unknown, max: number) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

type DocWalk = { nodes: number };

function marksFrom(node: Record<string, unknown>): { href: string | null; marks: RichMarks } {
  const marks: RichMarks = {};
  let href: string | null = null;
  for (const mark of Array.isArray(node.marks) ? node.marks : []) {
    if (!isRecord(mark) || typeof mark.type !== 'string') continue;
    if (mark.type === 'bold') marks.bold = true;
    else if (mark.type === 'italic') marks.italic = true;
    else if (mark.type === 'strike') marks.strike = true;
    else if (mark.type === 'code') marks.code = true;
    else if (mark.type === 'link' && isRecord(mark.attrs) && typeof mark.attrs.href === 'string') href = mark.attrs.href;
  }
  return { href, marks };
}

function walkInlines(
  node: unknown,
  inherited: RichMarks,
  out: RichInline[],
  walk: DocWalk,
  depth: number,
  resolveHref: (href: string) => string | null,
) {
  if (!isRecord(node) || walk.nodes > MAX_DOC_NODES || depth > MAX_DOC_DEPTH) return;
  walk.nodes += 1;
  if (node.type === 'text') {
    const { href, marks } = marksFrom(node);
    const text = safeString(node.text, 20_000);
    const merged = { ...inherited, ...marks };
    pushText(out, text, merged);
    if (href) {
      const safe = resolveHref(href);
      if (safe && !text.includes(safe)) pushText(out, ` (${safe})`, merged);
    }
    return;
  }
  if (node.type === 'hardBreak') {
    pushText(out, '\n', inherited);
    return;
  }
  if (node.type === 'mention') {
    const attrs = isRecord(node.attrs) ? node.attrs : {};
    const label = safeString(attrs.label, 40).trim() || safeString(attrs.id, 40).trim();
    if (label) out.push({ address: safeString(attrs.id, 64) || null, kind: 'mention', name: label });
    return;
  }
  for (const child of Array.isArray(node.content) ? node.content : []) {
    walkInlines(child, inherited, out, walk, depth + 1, resolveHref);
  }
}

// Splits inlines on the '\n' that hardBreak produced into paragraphs.
function splitParagraph(inlines: RichInline[]): RichBlock[] {
  const blocks: RichBlock[] = [];
  let current: RichInline[] = [];
  for (const inline of inlines) {
    if (inline.kind === 'text' && inline.text.includes('\n')) {
      const pieces = inline.text.split('\n');
      pieces.forEach((piece, index) => {
        if (index > 0) {
          blocks.push({ inlines: current, kind: 'paragraph' });
          current = [];
        }
        pushText(current, piece, inline.marks);
      });
    } else if (inline.kind === 'text') {
      pushText(current, inline.text, inline.marks);
    } else {
      current.push(inline);
    }
  }
  blocks.push({ inlines: current, kind: 'paragraph' });
  return blocks;
}

/**
 * Reads a Hub/Tiptap document into rich blocks. Unknown nodes contribute their
 * text; headings become bold paragraphs, ordered lists become bullet lists,
 * blockquotes keep a "> " prefix, images/other leaf nodes are skipped (Hub
 * carries images in its own `images` field). `resolveHref` lets the caller
 * apply its link-safety rules (chatText.ts getSafeLinkedAddress).
 */
export function tiptapDocToRichText(doc: unknown, resolveHref: (href: string) => string | null = (href) => href): RichBlock[] {
  const blocks: RichBlock[] = [];
  const walk: DocWalk = { nodes: 0 };

  const visit = (node: unknown, depth: number, inherited: RichMarks) => {
    if (!isRecord(node) || walk.nodes > MAX_DOC_NODES || depth > MAX_DOC_DEPTH) return;
    const type = typeof node.type === 'string' ? node.type : '';
    const children = Array.isArray(node.content) ? node.content : [];

    if (type === 'paragraph' || type === 'heading') {
      walk.nodes += 1;
      const inlines: RichInline[] = [];
      const marks = type === 'heading' ? { ...inherited, bold: true as const } : inherited;
      for (const child of children) walkInlines(child, marks, inlines, walk, depth + 1, resolveHref);
      blocks.push(...splitParagraph(inlines));
      return;
    }
    if (type === 'codeBlock') {
      walk.nodes += 1;
      const inlines: RichInline[] = [];
      for (const child of children) walkInlines(child, {}, inlines, walk, depth + 1, resolveHref);
      const attrs = isRecord(node.attrs) ? node.attrs : {};
      blocks.push({ kind: 'codeBlock', lang: safeString(attrs.language, 20).replace(/[^\w+-]/g, ''), text: plainInlines(inlines) });
      return;
    }
    if (type === 'bulletList' || type === 'orderedList') {
      walk.nodes += 1;
      const items: RichInline[][] = [];
      for (const item of children) {
        if (!isRecord(item)) continue;
        const inlines: RichInline[] = [];
        for (const child of Array.isArray(item.content) ? item.content : []) {
          walkInlines(child, inherited, inlines, walk, depth + 2, resolveHref);
        }
        items.push(inlines.filter((inline) => inline.kind === 'mention' || inline.text !== '\n'));
      }
      blocks.push({ items, kind: 'bulletList' });
      return;
    }
    if (type === 'blockquote') {
      walk.nodes += 1;
      const start = blocks.length;
      for (const child of children) visit(child, depth + 1, inherited);
      for (const block of blocks.slice(start)) {
        if (block.kind === 'paragraph') block.inlines.unshift({ kind: 'text', marks: {}, text: '> ' });
      }
      return;
    }
    if (type === 'text' || type === 'hardBreak' || type === 'mention') {
      const inlines: RichInline[] = [];
      walkInlines(node, inherited, inlines, walk, depth, resolveHref);
      blocks.push(...splitParagraph(inlines));
      return;
    }
    walk.nodes += 1;
    for (const child of children) visit(child, depth + 1, inherited);
  };

  visit(doc, 0, {});
  return blocks;
}

// ---------------------------------------------------------------------------
// Qortal direct messages carry paragraph HTML (Hub: editor.getHTML()).

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function inlinesToHtml(inlines: RichInline[]) {
  return inlines
    .map((inline) => {
      if (inline.kind === 'mention') {
        return `<span class="mention" data-type="mention" data-id="${escapeHtml(inline.address ?? inline.name)}" data-label="${escapeHtml(inline.name)}">@${escapeHtml(inline.name)}</span>`;
      }
      let html = escapeHtml(inline.text);
      if (inline.marks.code) html = `<code>${html}</code>`;
      if (inline.marks.strike) html = `<s>${html}</s>`;
      if (inline.marks.italic) html = `<em>${html}</em>`;
      if (inline.marks.bold) html = `<strong>${html}</strong>`;
      return html;
    })
    .join('');
}

/** The HTML shape Hub's Tiptap editor produces for direct messages. */
export function richTextToParagraphHtml(blocks: RichBlock[]) {
  return blocks
    .map((block) => {
      if (block.kind === 'codeBlock') return `<pre><code>${escapeHtml(block.text)}</code></pre>`;
      if (block.kind === 'bulletList') return `<ul>${block.items.map((item) => `<li><p>${inlinesToHtml(item)}</p></li>`).join('')}</ul>`;
      return `<p>${inlinesToHtml(block.inlines)}</p>`;
    })
    .join('');
}
