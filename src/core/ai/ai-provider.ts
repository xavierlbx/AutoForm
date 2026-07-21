import type { AiProviderId } from '../types';
import type { FieldValue, FormField } from '../types';
import { GeminiProvider } from './providers/gemini-provider';
import { OpenAiProvider } from './providers/openai-provider';

export interface AiProvider {
  fillForm(context: string, fields: FormField[]): Promise<FieldValue[]>;
}

/**
 * Creates an AI provider instance for the given id.
 * OpenAI and Gemini are implemented; Groq is reserved.
 */
export function createAiProvider(id: AiProviderId, apiKey: string): AiProvider {
  switch (id) {
    case 'openai':
      return new OpenAiProvider(apiKey);
    case 'gemini':
      return new GeminiProvider(apiKey);
    case 'groq':
      throw new Error(
        'Provedor "groq" ainda não está disponível neste MVP. Use OpenAI ou Gemini.',
      );
    default: {
      const _exhaustive: never = id;
      throw new Error(`Provedor de IA desconhecido: ${String(_exhaustive)}`);
    }
  }
}
