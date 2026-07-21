import type { FieldValue, FormField } from '../../types';
import type { AiProvider } from '../ai-provider';

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_TIMEOUT_MS = 60_000;

/** Prompt field payload sent to the model (no raw HTML). */
export interface PromptField {
  selector: string;
  label: string;
  type: string;
  options?: string[];
}

export class AiProviderError extends Error {
  readonly code: 'invalid_key' | 'rate_limit' | 'network' | 'parse' | 'api';

  constructor(
    code: AiProviderError['code'],
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'AiProviderError';
    this.code = code;
  }
}

export interface OpenAiProviderOptions {
  model?: string;
  timeoutMs?: number;
  /** Injected for tests; defaults to global fetch. */
  fetchFn?: typeof fetch;
}

/**
 * Builds the user prompt: structured fields + rawContext only.
 * Exported for unit tests.
 */
export function buildFillPrompt(
  context: string,
  fields: FormField[],
): { system: string; user: string } {
  const promptFields: PromptField[] = fields.map((field) => ({
    selector: field.selector,
    label: field.label,
    type: field.type,
    ...(field.options && field.options.length > 0
      ? { options: field.options }
      : {}),
  }));

  const system = [
    'You fill web form fields from the user context.',
    'Respond with a JSON object only, shape: {"values":[{"selector":"...","value":"..."}]}',
    'Use only selectors from the provided fields list.',
    'If a value cannot be inferred from the context, omit that field.',
    'Do not invent facts not present in the context.',
    'For select/radio, value must match one of the given options when options exist.',
    'For checkbox, use "true" or "false".',
  ].join(' ');

  const user = [
    '## User context',
    context,
    '',
    '## Form fields (JSON)',
    JSON.stringify(promptFields),
  ].join('\n');

  return { system, user };
}

/**
 * Parses and validates the model JSON into FieldValue[],
 * dropping unknown selectors and malformed entries.
 * Exported for unit tests.
 */
export function parseFieldValuesResponse(
  raw: string,
  allowedSelectors: ReadonlySet<string>,
): FieldValue[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (cause) {
    throw new AiProviderError(
      'parse',
      'A resposta da IA não é um JSON válido. Tente novamente.',
      { cause },
    );
  }

  const values = extractValuesArray(parsed);
  if (values === null) {
    throw new AiProviderError(
      'parse',
      'A resposta da IA não segue o formato esperado. Tente novamente.',
    );
  }

  const result: FieldValue[] = [];
  for (const entry of values) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const selector = record.selector;
    const value = record.value;
    if (typeof selector !== 'string' || typeof value !== 'string') {
      continue;
    }
    if (!allowedSelectors.has(selector)) {
      continue;
    }
    result.push({ selector, value });
  }

  return result;
}

function extractValuesArray(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (typeof parsed === 'object' && parsed !== null) {
    const record = parsed as Record<string, unknown>;
    if (Array.isArray(record.values)) {
      return record.values;
    }
    // Some models wrap once more: { values: { values: [...] } } — ignore.
  }
  return null;
}

function mapHttpError(status: number, bodyText: string): AiProviderError {
  if (status === 401 || status === 403) {
    return new AiProviderError(
      'invalid_key',
      'API key inválida ou sem permissão. Revise a chave em Configurar Contexto.',
    );
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
    `Erro na API da OpenAI (HTTP ${status})${detail}. Tente novamente.`,
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
      'Falha de rede ao chamar a OpenAI. Verifique sua conexão e tente novamente.',
      { cause: error },
    );
  }
  return new AiProviderError(
    'network',
    'Não foi possível contactar a OpenAI. Tente novamente.',
    { cause: error },
  );
}

export class OpenAiProvider implements AiProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(apiKey: string, options: OpenAiProviderOptions = {}) {
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
      response = await this.fetchFn(OPENAI_CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
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
      const body = JSON.parse(bodyText) as {
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      content = body.choices?.[0]?.message?.content?.trim() ?? '';
    } catch (cause) {
      throw new AiProviderError(
        'parse',
        'Resposta inesperada da OpenAI. Tente novamente.',
        { cause },
      );
    }

    if (!content) {
      throw new AiProviderError(
        'parse',
        'A IA retornou uma resposta vazia. Tente novamente.',
      );
    }

    return parseFieldValuesResponse(content, allowedSelectors);
  }
}
