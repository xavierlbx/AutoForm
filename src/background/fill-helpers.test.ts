import { describe, expect, it, vi } from 'vitest';
import { AiProviderError } from '../core/ai/providers/openai-provider';
import { MessageType } from '../shared/messages';
import {
  FillOrchestrationError,
  isNoReceiverError,
  isScriptableUrl,
  mapOrchestrationError,
  pickPrimaryFrameScan,
  withTimeout,
} from './fill-helpers';

describe('isScriptableUrl', () => {
  it('allows normal http(s) pages', () => {
    expect(isScriptableUrl('https://example.com/form')).toBe(true);
    expect(isScriptableUrl('http://localhost:3000/')).toBe(true);
  });

  it('rejects chrome internals and missing urls', () => {
    expect(isScriptableUrl(undefined)).toBe(false);
    expect(isScriptableUrl('chrome://extensions')).toBe(false);
    expect(isScriptableUrl('chrome-extension://abc/popup.html')).toBe(false);
    expect(isScriptableUrl('about:blank')).toBe(false);
    expect(isScriptableUrl('not a url')).toBe(false);
  });

  it('rejects Chrome Web Store', () => {
    expect(
      isScriptableUrl('https://chromewebstore.google.com/detail/foo'),
    ).toBe(false);
    expect(
      isScriptableUrl('https://chrome.google.com/webstore/detail/foo'),
    ).toBe(false);
  });
});

describe('mapOrchestrationError', () => {
  it('preserves FillOrchestrationError and AiProviderError messages', () => {
    expect(
      mapOrchestrationError(new FillOrchestrationError('sem campos')),
    ).toEqual({ type: MessageType.FILL_ERROR, message: 'sem campos' });

    expect(
      mapOrchestrationError(
        new AiProviderError('invalid_key', 'API key inválida'),
      ),
    ).toEqual({ type: MessageType.FILL_ERROR, message: 'API key inválida' });
  });

  it('maps abort and unknown errors to safe messages', () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    expect(mapOrchestrationError(abort).message).toMatch(/demorou demais/i);
    expect(mapOrchestrationError(new Error('boom')).message).toMatch(
      /Não foi possível preencher/i,
    );
    expect(mapOrchestrationError('raw').type).toBe(MessageType.FILL_ERROR);
  });
});

describe('isNoReceiverError', () => {
  it('detects chrome connection errors', () => {
    expect(
      isNoReceiverError(
        new Error('Could not establish connection. Receiving end does not exist.'),
      ),
    ).toBe(true);
    expect(isNoReceiverError(new Error('timeout'))).toBe(false);
  });
});

describe('pickPrimaryFrameScan', () => {
  it('returns null for empty input', () => {
    expect(pickPrimaryFrameScan([])).toBeNull();
  });

  it('returns null when every frame has zero fields', () => {
    expect(
      pickPrimaryFrameScan([
        { frameId: 0, fields: [] },
        { frameId: 2, fields: [] },
      ]),
    ).toBeNull();
  });

  it('picks the frame with the most fillable fields (iframe over newsletter)', () => {
    const newsletter = {
      frameId: 0,
      fields: [
        {
          selector: '#email',
          label: 'E-mail',
          type: 'email' as const,
        },
      ],
    };
    const pipefy = {
      frameId: 15,
      fields: [
        { selector: '#nome', label: 'Nome', type: 'text' as const },
        { selector: '#email', label: 'Email', type: 'email' as const },
        { selector: '#telefone', label: 'Telefone', type: 'tel' as const },
      ],
    };

    expect(pickPrimaryFrameScan([newsletter, pipefy])).toEqual(pipefy);
    expect(pickPrimaryFrameScan([pipefy, newsletter])).toEqual(pipefy);
  });
});

describe('withTimeout', () => {
  it('resolves when the promise settles in time', async () => {
    await expect(withTimeout(Promise.resolve(42), 1000, 'late')).resolves.toBe(
      42,
    );
  });

  it('rejects with FillOrchestrationError on timeout', async () => {
    vi.useFakeTimers();
    const pending = withTimeout(new Promise(() => undefined), 50, 'late');
    const assertion = expect(pending).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof FillOrchestrationError && err.message === 'late',
    );
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
    vi.useRealTimers();
  });
});
