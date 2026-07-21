import { describe, expect, it } from 'vitest';
import {
  CONTEXT_MAX_CHARS,
  appendContextBlocks,
  formatFileBlock,
} from './context-view';

describe('formatFileBlock', () => {
  it('wraps plain text with a filename separator', () => {
    expect(formatFileBlock('Curriculo.pdf', '  João Silva  ')).toBe(
      '--- Curriculo.pdf ---\nJoão Silva',
    );
  });

  it('falls back when filename is blank', () => {
    expect(formatFileBlock('   ', 'texto')).toBe('--- arquivo ---\ntexto');
  });
});

describe('appendContextBlocks', () => {
  it('joins existing text and new blocks with blank lines', () => {
    const result = appendContextBlocks('bio', [
      formatFileBlock('a.pdf', 'um'),
      formatFileBlock('b.docx', 'dois'),
    ]);
    expect(result.truncated).toBe(false);
    expect(result.text).toBe(
      'bio\n\n--- a.pdf ---\num\n\n--- b.docx ---\ndois',
    );
  });

  it('skips empty existing text', () => {
    const result = appendContextBlocks('  ', [formatFileBlock('a.pdf', 'um')]);
    expect(result.text).toBe('--- a.pdf ---\num');
  });

  it('truncates when over CONTEXT_MAX_CHARS', () => {
    const huge = 'x'.repeat(CONTEXT_MAX_CHARS - 5);
    const result = appendContextBlocks(huge, ['more-text-than-fits']);
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBe(CONTEXT_MAX_CHARS);
    expect(result.text.startsWith(huge)).toBe(true);
  });
});
