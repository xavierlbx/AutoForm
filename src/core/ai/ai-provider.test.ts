import { describe, expect, it } from 'vitest';

import { createAiProvider } from './ai-provider';
import { GeminiProvider } from './providers/gemini-provider';
import { OpenAiProvider } from './providers/openai-provider';

describe('createAiProvider', () => {
  it('returns OpenAiProvider for openai', () => {
    const provider = createAiProvider('openai', 'sk-test');
    expect(provider).toBeInstanceOf(OpenAiProvider);
  });

  it('returns GeminiProvider for gemini', () => {
    const provider = createAiProvider('gemini', 'AIza-test');
    expect(provider).toBeInstanceOf(GeminiProvider);
  });

  it('rejects unsupported providers with a friendly message', () => {
    expect(() => createAiProvider('groq', 'key')).toThrow(/groq|não está/i);
  });
});
