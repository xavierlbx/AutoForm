import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearContext,
  getContext,
  getStorage,
  isContextReady,
  saveContext,
  STORAGE_KEY,
} from './storage';
import { DEFAULT_STORAGE, type LocalStorageData } from './types';

type StorageLocal = {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
};

function installChromeStorageMock(): {
  store: Record<string, unknown>;
  local: StorageLocal;
} {
  const store: Record<string, unknown> = {};

  const local: StorageLocal = {
    get: vi.fn(async (keys?: string | string[] | null) => {
      if (keys == null) {
        return { ...store };
      }
      const keyList = Array.isArray(keys) ? keys : [keys];
      const result: Record<string, unknown> = {};
      for (const key of keyList) {
        if (key in store) {
          result[key] = store[key];
        }
      }
      return result;
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(store, items);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      const keyList = Array.isArray(keys) ? keys : [keys];
      for (const key of keyList) {
        delete store[key];
      }
    }),
  };

  vi.stubGlobal('chrome', {
    storage: { local },
  });

  return { store, local };
}

describe('storage', () => {
  let store: Record<string, unknown>;
  let local: StorageLocal;

  beforeEach(() => {
    vi.unstubAllGlobals();
    ({ store, local } = installChromeStorageMock());
  });

  it('getContext returns null when storage is empty', async () => {
    await expect(getContext()).resolves.toBeNull();
    expect(local.get).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it('getStorage returns defaults when empty', async () => {
    await expect(getStorage()).resolves.toEqual(DEFAULT_STORAGE);
  });

  it('saveContext persists data and getContext reads it back', async () => {
    const data: LocalStorageData = {
      apiKey: 'sk-test',
      aiProvider: 'openai',
      rawContext: 'My bio',
      updatedAt: '2026-01-15T12:00:00.000Z',
    };

    await saveContext(data);

    expect(local.set).toHaveBeenCalledWith({ [STORAGE_KEY]: data });
    await expect(getContext()).resolves.toEqual(data);
    await expect(getStorage()).resolves.toEqual(data);
  });

  it('saveContext fills updatedAt when missing', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T10:30:00.000Z'));

    await saveContext({
      apiKey: 'sk-test',
      aiProvider: 'openai',
      rawContext: 'Context text',
      updatedAt: '',
    });

    expect(store[STORAGE_KEY]).toEqual({
      apiKey: 'sk-test',
      aiProvider: 'openai',
      rawContext: 'Context text',
      updatedAt: '2026-07-21T10:30:00.000Z',
    });

    vi.useRealTimers();
  });

  it('clearContext removes the stored blob', async () => {
    await saveContext({
      apiKey: 'sk-test',
      aiProvider: 'gemini',
      rawContext: 'x',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    await clearContext();

    expect(local.remove).toHaveBeenCalledWith(STORAGE_KEY);
    await expect(getContext()).resolves.toBeNull();
    await expect(getStorage()).resolves.toEqual(DEFAULT_STORAGE);
  });

  it('getContext returns null for corrupt payloads', async () => {
    store[STORAGE_KEY] = { apiKey: 123, broken: true };
    await expect(getContext()).resolves.toBeNull();
  });

  it('isContextReady requires both apiKey and rawContext', async () => {
    await expect(isContextReady()).resolves.toBe(false);

    await saveContext({
      apiKey: 'sk-test',
      aiProvider: 'openai',
      rawContext: '',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await expect(isContextReady()).resolves.toBe(false);

    await saveContext({
      apiKey: 'sk-test',
      aiProvider: 'openai',
      rawContext: 'Ready',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await expect(isContextReady()).resolves.toBe(true);
  });

  it('never uses chrome.storage.sync', async () => {
    const chromeGlobal = globalThis.chrome as unknown as {
      storage: { local: StorageLocal; sync?: unknown };
    };
    expect(chromeGlobal.storage.sync).toBeUndefined();

    await saveContext({
      apiKey: 'sk',
      aiProvider: 'openai',
      rawContext: 'c',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await getContext();
    await clearContext();

    expect(Object.keys(chromeGlobal.storage)).toEqual(['local']);
  });
});
