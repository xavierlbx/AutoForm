/** AI providers supported by the extension (OpenAI + Gemini; Groq reserved). */
export type AiProviderId = 'openai' | 'gemini' | 'groq';

/** Persisted user settings and context in chrome.storage.local. */
export interface LocalStorageData {
  apiKey: string;
  aiProvider: AiProviderId;
  /** Consolidated text from uploaded files + free-form paste. */
  rawContext: string;
  /** ISO-8601 timestamp of the last successful save. */
  updatedAt: string;
}

/** Common fillable control kinds detected by the form scanner. */
export type FormFieldType =
  | 'text'
  | 'email'
  | 'tel'
  | 'url'
  | 'number'
  | 'password'
  | 'search'
  | 'textarea'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'date'
  | 'datetime-local'
  | 'time'
  | 'contenteditable'
  | 'other';

/** Structured description of a fillable field (never raw HTML). */
export interface FormField {
  /** Stable CSS/DOM selector used later to apply a value. */
  selector: string;
  label: string;
  type: FormFieldType;
  /** Option labels/values for select and radio groups. */
  options?: string[];
}

/** AI-suggested (or user-reviewed) value for a single field. */
export interface FieldValue {
  selector: string;
  value: string;
}

/** Result of applying values to the page DOM. */
export interface ApplyValuesResult {
  applied: number;
  failed: number;
}

/**
 * Final fill outcome surfaced to the popup after orchestration.
 * `errorMessage` is set when the flow fails before or during apply.
 */
export interface AiFillResult {
  filled: number;
  skipped: number;
  errorMessage?: string;
}

/** Empty defaults used when storage has never been written. */
export const DEFAULT_STORAGE: LocalStorageData = {
  apiKey: '',
  aiProvider: 'openai',
  rawContext: '',
  updatedAt: '',
};

const AI_PROVIDER_IDS: ReadonlySet<string> = new Set<AiProviderId>([
  'openai',
  'gemini',
  'groq',
]);

export function isAiProviderId(value: unknown): value is AiProviderId {
  return typeof value === 'string' && AI_PROVIDER_IDS.has(value);
}

/** Runtime shape check for values read from chrome.storage.local. */
export function isLocalStorageData(value: unknown): value is LocalStorageData {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const data = value as Record<string, unknown>;
  return (
    typeof data.apiKey === 'string' &&
    isAiProviderId(data.aiProvider) &&
    typeof data.rawContext === 'string' &&
    typeof data.updatedAt === 'string'
  );
}

/** True when both API key and context text are present (fill button can enable). */
export function hasConfiguredContext(data: LocalStorageData): boolean {
  return data.apiKey.trim().length > 0 && data.rawContext.trim().length > 0;
}
