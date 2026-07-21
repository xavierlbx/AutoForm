import {
  DEFAULT_STORAGE,
  hasConfiguredContext,
  isLocalStorageData,
  type LocalStorageData,
} from './types';

/** Single key holding the whole LocalStorageData blob in chrome.storage.local. */
export const STORAGE_KEY = 'autoFormData' as const;

/**
 * Returns persisted context, or `null` when nothing valid is stored.
 * Never logs apiKey / rawContext contents.
 */
export async function getContext(): Promise<LocalStorageData | null> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const data = result[STORAGE_KEY];
  if (!isLocalStorageData(data)) {
    return null;
  }
  return data;
}

/**
 * Returns storage with safe defaults when empty or corrupt.
 * Prefer `getContext` when you need to distinguish "never saved".
 */
export async function getStorage(): Promise<LocalStorageData> {
  const context = await getContext();
  return context ?? { ...DEFAULT_STORAGE };
}

/**
 * Persists the full context blob. Sets `updatedAt` when missing/empty.
 * Uses chrome.storage.local only (never sync).
 */
export async function saveContext(data: LocalStorageData): Promise<void> {
  const toSave: LocalStorageData = {
    apiKey: data.apiKey,
    aiProvider: data.aiProvider,
    rawContext: data.rawContext,
    updatedAt: data.updatedAt.trim() || new Date().toISOString(),
  };
  await chrome.storage.local.set({ [STORAGE_KEY]: toSave });
}

/** Removes all autoForm data from chrome.storage.local. */
export async function clearContext(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
}

/** Convenience check for popup Home (fill button enablement). */
export async function isContextReady(): Promise<boolean> {
  const context = await getContext();
  return context !== null && hasConfiguredContext(context);
}
