import { describe, expect, it } from 'vitest';

import { isExtensionMessage, MessageType } from '../shared/messages';
import {
  hasConfiguredContext,
  isAiProviderId,
  isLocalStorageData,
  type LocalStorageData,
} from './types';

describe('types helpers', () => {
  it('isAiProviderId accepts known providers', () => {
    expect(isAiProviderId('openai')).toBe(true);
    expect(isAiProviderId('gemini')).toBe(true);
    expect(isAiProviderId('groq')).toBe(true);
    expect(isAiProviderId('anthropic')).toBe(false);
    expect(isAiProviderId(null)).toBe(false);
  });

  it('isLocalStorageData validates shape', () => {
    const valid: LocalStorageData = {
      apiKey: 'sk',
      aiProvider: 'openai',
      rawContext: 'bio',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    expect(isLocalStorageData(valid)).toBe(true);
    expect(isLocalStorageData({ ...valid, aiProvider: 'nope' })).toBe(false);
    expect(isLocalStorageData(null)).toBe(false);
  });

  it('hasConfiguredContext requires non-empty key and context', () => {
    expect(
      hasConfiguredContext({
        apiKey: 'sk',
        aiProvider: 'openai',
        rawContext: 'x',
        updatedAt: '',
      }),
    ).toBe(true);
    expect(
      hasConfiguredContext({
        apiKey: '  ',
        aiProvider: 'openai',
        rawContext: 'x',
        updatedAt: '',
      }),
    ).toBe(false);
  });
});

describe('isExtensionMessage', () => {
  it('accepts fill flow messages', () => {
    expect(isExtensionMessage({ type: MessageType.FILL_REQUEST })).toBe(true);
    expect(isExtensionMessage({ type: MessageType.SCAN_FORM })).toBe(true);
    expect(
      isExtensionMessage({
        type: MessageType.FORM_FIELDS,
        fields: [
          {
            selector: '#name',
            label: 'Name',
            type: 'text',
          },
        ],
      }),
    ).toBe(true);
    expect(
      isExtensionMessage({
        type: MessageType.APPLY_VALUES,
        values: [{ selector: '#name', value: 'Ada' }],
      }),
    ).toBe(true);
    expect(isExtensionMessage({ type: MessageType.FILL_DONE, count: 3 })).toBe(
      true,
    );
    expect(
      isExtensionMessage({
        type: MessageType.FILL_RESULT,
        filled: 2,
        skipped: 1,
      }),
    ).toBe(true);
    expect(
      isExtensionMessage({
        type: MessageType.FILL_ERROR,
        message: 'Falha',
      }),
    ).toBe(true);
  });

  it('rejects malformed payloads', () => {
    expect(isExtensionMessage(null)).toBe(false);
    expect(isExtensionMessage({ type: 'UNKNOWN' })).toBe(false);
    expect(isExtensionMessage({ type: MessageType.FORM_FIELDS })).toBe(false);
    expect(
      isExtensionMessage({
        type: MessageType.APPLY_VALUES,
        values: [{ selector: 1, value: 'x' }],
      }),
    ).toBe(false);
    expect(isExtensionMessage({ type: MessageType.FILL_DONE, count: '1' })).toBe(
      false,
    );
    expect(
      isExtensionMessage({ type: MessageType.FILL_RESULT, filled: 1 }),
    ).toBe(false);
  });
});
