import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FormField } from '../../types';
import {
  AiProviderError,
  buildFillPrompt,
  OpenAiProvider,
  parseFieldValuesResponse,
} from './openai-provider';

const sampleFields: FormField[] = [
  { selector: '#name', label: 'Nome completo', type: 'text' },
  {
    selector: '#role',
    label: 'Cargo',
    type: 'select',
    options: ['Dev', 'PM'],
  },
];

describe('buildFillPrompt', () => {
  it('includes structured fields and context, not HTML', () => {
    const { system, user } = buildFillPrompt('Bio da Ada', sampleFields);

    expect(system).toMatch(/JSON/i);
    expect(user).toContain('Bio da Ada');
    expect(user).toContain('#name');
    expect(user).toContain('Nome completo');
    expect(user).toContain('"options":["Dev","PM"]');
    expect(user).not.toMatch(/<html|<form|<input/i);
  });
});

describe('parseFieldValuesResponse', () => {
  const allowed = new Set(['#name', '#role']);

  it('parses { values: [...] } and keeps known selectors', () => {
    const raw = JSON.stringify({
      values: [
        { selector: '#name', value: 'Ada' },
        { selector: '#role', value: 'Dev' },
        { selector: '#unknown', value: 'x' },
        { selector: '#name', value: 123 },
        null,
      ],
    });

    expect(parseFieldValuesResponse(raw, allowed)).toEqual([
      { selector: '#name', value: 'Ada' },
      { selector: '#role', value: 'Dev' },
    ]);
  });

  it('accepts a bare array as fallback', () => {
    const raw = JSON.stringify([{ selector: '#name', value: 'Ada' }]);
    expect(parseFieldValuesResponse(raw, allowed)).toEqual([
      { selector: '#name', value: 'Ada' },
    ]);
  });

  it('throws AiProviderError on malformed JSON', () => {
    expect(() => parseFieldValuesResponse('{not-json', allowed)).toThrow(
      AiProviderError,
    );
    try {
      parseFieldValuesResponse('{not-json', allowed);
    } catch (error) {
      expect(error).toBeInstanceOf(AiProviderError);
      expect((error as AiProviderError).code).toBe('parse');
    }
  });

  it('throws when shape is wrong', () => {
    expect(() =>
      parseFieldValuesResponse(JSON.stringify({ foo: 1 }), allowed),
    ).toThrow(AiProviderError);
  });
});

describe('OpenAiProvider.fillForm', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockJsonResponse(
    status: number,
    body: unknown,
  ): ReturnType<typeof vi.fn> {
    return vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }

  it('calls OpenAI with JSON mode and returns validated values', async () => {
    const fetchFn = mockJsonResponse(200, {
      choices: [
        {
          message: {
            content: JSON.stringify({
              values: [
                { selector: '#name', value: 'Ada Lovelace' },
                { selector: '#evil', value: 'drop' },
              ],
            }),
          },
        },
      ],
    });

    const provider = new OpenAiProvider('sk-test', { fetchFn });
    const values = await provider.fillForm('Engenheira', sampleFields);

    expect(values).toEqual([{ selector: '#name', value: 'Ada Lovelace' }]);
    expect(fetchFn).toHaveBeenCalledOnce();

    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer sk-test',
    );

    const payload = JSON.parse(String(init.body)) as {
      model: string;
      response_format: { type: string };
      messages: Array<{ role: string; content: string }>;
    };
    expect(payload.model).toBe('gpt-4o-mini');
    expect(payload.response_format).toEqual({ type: 'json_object' });
    expect(payload.messages[1]?.content).toContain('Engenheira');
    expect(payload.messages[1]?.content).not.toMatch(/<html/i);
  });

  it('maps 401 to invalid_key friendly error', async () => {
    const fetchFn = mockJsonResponse(401, {
      error: { message: 'Incorrect API key' },
    });
    const provider = new OpenAiProvider('bad', { fetchFn });

    await expect(provider.fillForm('ctx', sampleFields)).rejects.toMatchObject({
      code: 'invalid_key',
      message: expect.stringMatching(/API key inválida/i),
    });
  });

  it('maps 429 to rate_limit friendly error', async () => {
    const fetchFn = mockJsonResponse(429, { error: { message: 'Rate limit' } });
    const provider = new OpenAiProvider('sk', { fetchFn });

    await expect(provider.fillForm('ctx', sampleFields)).rejects.toMatchObject({
      code: 'rate_limit',
      message: expect.stringMatching(/Limite de uso/i),
    });
  });

  it('maps network failure to friendly error', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const provider = new OpenAiProvider('sk', { fetchFn });

    await expect(provider.fillForm('ctx', sampleFields)).rejects.toMatchObject({
      code: 'network',
      message: expect.stringMatching(/rede|conexão/i),
    });
  });

  it('maps abort to timeout-friendly error', async () => {
    const fetchFn = vi.fn().mockRejectedValue(
      new DOMException('The operation was aborted', 'AbortError'),
    );
    const provider = new OpenAiProvider('sk', {
      fetchFn,
      timeoutMs: 1,
    });

    await expect(provider.fillForm('ctx', sampleFields)).rejects.toMatchObject({
      code: 'network',
      message: expect.stringMatching(/timeout/i),
    });
  });

  it('returns empty array when there are no fields', async () => {
    const fetchFn = vi.fn();
    const provider = new OpenAiProvider('sk', { fetchFn });
    await expect(provider.fillForm('ctx', [])).resolves.toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
