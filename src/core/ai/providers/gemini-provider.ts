import type { FieldValue, FormField } from '../../types';
import type { AiProvider } from '../ai-provider';
import {
  AiProviderError,
  buildFillPrompt,
  parseFieldValuesResponse,
} from './openai-provider';

const GEMINI_API_BASE =
  'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_TIMEOUT_MS = 60_000;

export interface GeminiProviderOptions {
  model?: string;
  timeoutMs?: number;
  /** Injected for tests; defaults to global fetch. */
  fetchFn?: typeof fetch;
}

function buildGeminiUrl(model: string): string {
  return `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`;
}

function extractCandidateText(body: unknown): string {
  if (typeof body !== 'object' || body === null) {
    return '';
  }
  const candidates = (body as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return '';
  }
  const first = candidates[0];
  if (typeof first !== 'object' || first === null) {
    return '';
  }
  const content = (first as { content?: unknown }).content;
  if (typeof content !== 'object' || content === null) {
    return '';
  }
  const parts = (content as { parts?: unknown }).parts;
  if (!Array.isArray(parts)) {
    return '';
  }
  const texts: string[] = [];
  for (const part of parts) {
    if (typeof part === 'object' && part !== null) {
      const text = (part as { text?: unknown }).text;
      if (typeof text === 'string' && text.trim()) {
        texts.push(text);
      }
    }
  }
  return texts.join('\n').trim();
}

/** Strip optional markdown fences around JSON (fallback if mime type is ignored). */
export function unwrapJsonContent(raw: string): string {
  const trimmed = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced?.[1]?.trim() ?? trimmed;
}

function mapHttpError(status: number, bodyText: string): AiProviderError {
  if (status === 400 || status === 401 || status === 403) {
    const looksLikeKey =
      /api.?key|permission|unauthenticated|invalid.?argument/i.test(bodyText);
    if (status === 401 || status === 403 || looksLikeKey) {
      return new AiProviderError(
        'invalid_key',
        'API key inválida ou sem permissão. Revise a chave em Configurar Contexto.',
      );
    }
  }
  if (status === 429) {
    return new AiProviderError(
      'rate_limit',
      'Limite de uso da API atingido. Aguarde um momento e tente novamente.',
    );
  }

  let detail = '';
  try {
    const body = JSON.parse(bodyText) as {
      error?: { message?: string };
    };
    if (typeof body.error?.message === 'string' && body.error.message.trim()) {
      detail = ` (${body.error.message.trim().slice(0, 120)})`;
    }
  } catch {
    // ignore non-JSON error bodies
  }

  return new AiProviderError(
    'api',
    `Erro na API do Gemini (HTTP ${status})${detail}. Tente novamente.`,
  );
}

function mapNetworkError(error: unknown): AiProviderError {
  if (error instanceof AiProviderError) {
    return error;
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new AiProviderError(
      'network',
      'A chamada à IA demorou demais (timeout). Verifique a conexão e tente novamente.',
    );
  }
  if (error instanceof TypeError) {
    return new AiProviderError(
      'network',
      'Falha de rede ao chamar o Gemini. Verifique sua conexão e tente novamente.',
      { cause: error },
    );
  }
  return new AiProviderError(
    'network',
    'Não foi possível contactar o Gemini. Tente novamente.',
    { cause: error },
  );
}

export class GeminiProvider implements AiProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(apiKey: string, options: GeminiProviderOptions = {}) {
    this.apiKey = apiKey;
    this.model = options.model ?? DEFAULT_MODEL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchFn = options.fetchFn ?? fetch.bind(globalThis);
  }

  async fillForm(context: string, fields: FormField[]): Promise<FieldValue[]> {
    if (fields.length === 0) {
      return [];
    }

    const { system, user } = buildFillPrompt(context, fields);
    const allowedSelectors = new Set(fields.map((f) => f.selector));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      // Prefer header auth so the key is not embedded in the request URL.
      response = await this.fetchFn(buildGeminiUrl(this.model), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: system }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: user }],
            },
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
          },
        }),
        signal: controller.signal,
      });
    } catch (error) {
      throw mapNetworkError(error);
    } finally {
      clearTimeout(timer);
    }

    const bodyText = await response.text();

    if (!response.ok) {
      throw mapHttpError(response.status, bodyText);
    }

    let content: string;
    try {
      const body = JSON.parse(bodyText) as unknown;
      content = extractCandidateText(body);
    } catch (cause) {
      throw new AiProviderError(
        'parse',
        'Resposta inesperada do Gemini. Tente novamente.',
        { cause },
      );
    }

    if (!content) {
      throw new AiProviderError(
        'parse',
        'A IA retornou uma resposta vazia. Tente novamente.',
      );
    }

    return parseFieldValuesResponse(
      unwrapJsonContent(content),
      allowedSelectors,
    );
  }
}
