import { describe, expect, it, vi } from 'vitest';

import type { FormField } from '../../types';
import { AiProviderError } from './openai-provider';
import { GeminiProvider, unwrapJsonContent } from './gemini-provider';

const sampleFields: FormField[] = [
  {
    selector: '#name',
    label: 'Nome',
    type: 'text',
  },
  {
    selector: '#email',
    label: 'E-mail',
    type: 'email',
  },
];

describe('unwrapJsonContent', () => {
  it('returns plain JSON unchanged', () => {
    expect(unwrapJsonContent('{"values":[]}')).toBe('{"values":[]}');
  });

  it('strips markdown fences', () => {
    expect(unwrapJsonContent('```json\n{"values":[]}\n```')).toBe(
      '{"values":[]}',
    );
  });
});

describe('GeminiProvider.fillForm', () => {
  it('calls generateContent with header auth and parses values', async () => {
    const fetchFn = vi.fn().mockImplementation(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        expect(String(url)).toContain(
          'generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
        );
        const headers = new Headers(init?.headers);
        expect(headers.get('x-goog-api-key')).toBe('AIza-test');
        expect(headers.get('Authorization')).toBeNull();

        const body = JSON.parse(String(init?.body)) as {
          generationConfig?: { responseMimeType?: string };
          systemInstruction?: { parts?: Array<{ text?: string }> };
        };
        expect(body.generationConfig?.responseMimeType).toBe('application/json');
        expect(body.systemInstruction?.parts?.[0]?.text).toMatch(/JSON object/);

        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        values: [
                          { selector: '#name', value: 'Ana' },
                          { selector: '#email', value: 'ana@ex.com' },
                          { selector: '#unknown', value: 'x' },
                        ],
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        );
      },
    );

    const provider = new GeminiProvider('AIza-test', { fetchFn });
    const values = await provider.fillForm('Engenheira Ana', sampleFields);

    expect(values).toEqual([
      { selector: '#name', value: 'Ana' },
      { selector: '#email', value: 'ana@ex.com' },
    ]);
  });

  it('maps 403 to invalid_key', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'API key not valid' } }), {
        status: 403,
      }),
    );
    const provider = new GeminiProvider('bad', { fetchFn });
    await expect(provider.fillForm('ctx', sampleFields)).rejects.toMatchObject({
      code: 'invalid_key',
    });
  });

  it('maps 429 to rate_limit', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('quota', { status: 429 }));
    const provider = new GeminiProvider('key', { fetchFn });
    await expect(provider.fillForm('ctx', sampleFields)).rejects.toMatchObject({
      code: 'rate_limit',
    });
  });

  it('maps timeout abort to network', async () => {
    const fetchFn = vi.fn().mockImplementation(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        const signal = init?.signal;
        return await new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      },
    );
    const provider = new GeminiProvider('key', {
      fetchFn,
      timeoutMs: 5,
    });
    await expect(provider.fillForm('ctx', sampleFields)).rejects.toMatchObject({
      code: 'network',
    });
  });

  it('throws AiProviderError on empty candidate text', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ candidates: [{ content: { parts: [] } }] }),
        { status: 200 },
      ),
    );
    const provider = new GeminiProvider('key', { fetchFn });
    await expect(provider.fillForm('ctx', sampleFields)).rejects.toBeInstanceOf(
      AiProviderError,
    );
  });

  it('returns [] for empty fields without calling the API', async () => {
    const fetchFn = vi.fn();
    const provider = new GeminiProvider('key', { fetchFn });
    await expect(provider.fillForm('ctx', [])).resolves.toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
