import { describe, expect, it, vi } from 'vitest';
import { copyTextToClipboard, type ClipboardDependencies } from './clipboard';

function createTextareaDocument(execCommandResult = true) {
  const textarea = {
    focus: vi.fn(),
    select: vi.fn(),
    setAttribute: vi.fn(),
    setSelectionRange: vi.fn(),
    style: {} as Partial<CSSStyleDeclaration>,
    value: '',
  };
  const document = {
    body: {
      appendChild: vi.fn(),
      removeChild: vi.fn(),
    },
    createElement: vi.fn(() => textarea),
    execCommand: vi.fn(() => execCommandResult),
  } as unknown as NonNullable<ClipboardDependencies['document']>;

  return { document, textarea };
}

describe('copyTextToClipboard', () => {
  it('uses the Clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const dependencies: ClipboardDependencies = {
      navigator: {
        clipboard: { writeText },
      },
    };

    await expect(copyTextToClipboard('Qabc123', dependencies)).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('Qabc123');
  });

  it('falls back to textarea copy when Clipboard API copy fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Denied'));
    const { document, textarea } = createTextareaDocument();
    const dependencies: ClipboardDependencies = {
      document,
      navigator: {
        clipboard: { writeText },
      },
    };

    await expect(copyTextToClipboard('Qfallback', dependencies)).resolves.toBe(true);
    expect(textarea.value).toBe('Qfallback');
    expect(document.body.appendChild).toHaveBeenCalledWith(textarea);
    expect(textarea.select).toHaveBeenCalledOnce();
    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(document.body.removeChild).toHaveBeenCalledWith(textarea);
  });

  it('reports failure when no copy path is available', async () => {
    await expect(copyTextToClipboard('Qmissing', {})).resolves.toBe(false);
  });
});
