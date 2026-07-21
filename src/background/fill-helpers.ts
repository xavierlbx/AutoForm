import { AiProviderError } from '../core/ai/providers/openai-provider';
import type { FormField } from '../core/types';
import { MessageType, type FillErrorMessage } from '../shared/messages';

/** User-facing orchestration failures (safe to show in the popup). */
export class FillOrchestrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FillOrchestrationError';
  }
}

/** Result of scanning fillable fields in a single frame. */
export interface FrameScanResult {
  frameId: number;
  fields: FormField[];
}

/**
 * Chooses the frame most likely to hold the target form (most fillable fields).
 * Prefer this over the top frame alone — job pages often embed ATS forms in iframes
 * (e.g. Pipefy) while the parent only has a newsletter signup.
 */
export function pickPrimaryFrameScan(
  results: FrameScanResult[],
): FrameScanResult | null {
  if (results.length === 0) {
    return null;
  }

  let best = results[0]!;
  for (let i = 1; i < results.length; i += 1) {
    const candidate = results[i]!;
    if (candidate.fields.length > best.fields.length) {
      best = candidate;
    }
  }

  return best.fields.length > 0 ? best : null;
}

/**
 * True when the tab URL can receive a content script (http/https pages,
 * excluding the Chrome Web Store).
 */
export function isScriptableUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  const host = parsed.hostname.toLowerCase();
  if (host === 'chromewebstore.google.com') {
    return false;
  }
  if (host === 'chrome.google.com' && parsed.pathname.startsWith('/webstore')) {
    return false;
  }

  return true;
}

/** Maps unknown failures to a typed FILL_ERROR without leaking secrets. */
export function mapOrchestrationError(error: unknown): FillErrorMessage {
  if (error instanceof FillOrchestrationError) {
    return { type: MessageType.FILL_ERROR, message: error.message };
  }
  if (error instanceof AiProviderError) {
    return { type: MessageType.FILL_ERROR, message: error.message };
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return {
      type: MessageType.FILL_ERROR,
      message: 'A operação demorou demais. Tente novamente.',
    };
  }
  return {
    type: MessageType.FILL_ERROR,
    message: 'Não foi possível preencher o formulário. Tente novamente.',
  };
}

/** Rejects if `promise` does not settle within `timeoutMs`. */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new FillOrchestrationError(timeoutMessage));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (reason: unknown) => {
        clearTimeout(timer);
        reject(reason);
      },
    );
  });
}

/** Chrome "no receiving end" errors when the content script is not loaded. */
export function isNoReceiverError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /receiving end does not exist/i.test(message) ||
    /could not establish connection/i.test(message)
  );
}
