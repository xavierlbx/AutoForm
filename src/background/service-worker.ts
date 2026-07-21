import { createAiProvider } from '../core/ai/ai-provider';
import { getContext } from '../core/storage';
import { hasConfiguredContext } from '../core/types';
import {
  isExtensionMessage,
  MessageType,
  type ExtensionMessage,
  type FillDoneMessage,
  type FillErrorMessage,
  type FillResultMessage,
  type FormFieldsMessage,
} from '../shared/messages';
import {
  FillOrchestrationError,
  isNoReceiverError,
  isScriptableUrl,
  mapOrchestrationError,
  pickPrimaryFrameScan,
  withTimeout,
  type FrameScanResult,
} from './fill-helpers';

/** Per content-script round-trip (scan / apply). */
const TAB_MESSAGE_TIMEOUT_MS = 15_000;
/** Whole FILL_REQUEST including AI call. */
const FILL_ORCHESTRATION_TIMEOUT_MS = 90_000;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isExtensionMessage(message)) {
    return;
  }

  if (message.type !== MessageType.FILL_REQUEST) {
    return;
  }

  void handleFillRequest()
    .then((result) => {
      sendResponse(result);
    })
    .catch((error: unknown) => {
      // Metadata only — never log apiKey, rawContext, or AI payloads.
      console.error('[autoForm] FILL_REQUEST failed', {
        name: error instanceof Error ? error.name : 'unknown',
      });
      sendResponse(mapOrchestrationError(error));
    });

  // Keep the message channel open for the async response.
  return true;
});

async function handleFillRequest(): Promise<
  FillResultMessage | FillErrorMessage
> {
  try {
    return await withTimeout(
      runFillOrchestration(),
      FILL_ORCHESTRATION_TIMEOUT_MS,
      'A operação demorou demais. Tente novamente.',
    );
  } catch (error) {
    return mapOrchestrationError(error);
  }
}

async function runFillOrchestration(): Promise<FillResultMessage> {
  const tab = await getActiveTab();
  if (tab.id === undefined) {
    throw new FillOrchestrationError('Nenhuma aba ativa encontrada.');
  }
  if (!isScriptableUrl(tab.url)) {
    throw new FillOrchestrationError(
      'Não é possível preencher formulários nesta página (ex.: chrome:// ou Chrome Web Store).',
    );
  }

  const tabId = tab.id;

  const primary = await scanPrimaryFormFrame(tabId);
  if (!primary) {
    throw new FillOrchestrationError(
      'Nenhum campo preenchível encontrado nesta página.',
    );
  }

  const { frameId, fields } = primary;

  const context = await getContext();
  if (context === null || !hasConfiguredContext(context)) {
    throw new FillOrchestrationError(
      'Configure a API key e o contexto em Configurar Contexto antes de preencher.',
    );
  }

  // Metadata only (lengths), never contents.
  console.info('[autoForm] calling AI', {
    provider: context.aiProvider,
    fieldCount: fields.length,
    frameId,
    contextChars: context.rawContext.length,
  });

  const provider = createAiProvider(context.aiProvider, context.apiKey);
  const values = await provider.fillForm(context.rawContext, fields);

  if (values.length === 0) {
    return {
      type: MessageType.FILL_RESULT,
      filled: 0,
      skipped: fields.length,
    };
  }

  const applyResponse = await sendToContent(
    tabId,
    {
      type: MessageType.APPLY_VALUES,
      values,
    },
    frameId,
  );

  if (applyResponse.type === MessageType.FILL_ERROR) {
    throw new FillOrchestrationError(applyResponse.message);
  }
  if (applyResponse.type !== MessageType.FILL_DONE) {
    throw new FillOrchestrationError(
      'Resposta inesperada ao aplicar valores. Recarregue a aba e tente novamente.',
    );
  }

  const filled = (applyResponse as FillDoneMessage).count;
  const skipped = Math.max(0, fields.length - filled);

  return {
    type: MessageType.FILL_RESULT,
    filled,
    skipped,
  };
}

/**
 * Scans every scriptable frame (top page + iframes, including cross-origin
 * embeds like Pipefy) and returns the frame with the most fillable fields.
 */
async function scanPrimaryFormFrame(
  tabId: number,
): Promise<FrameScanResult | null> {
  const frameIds = await listScriptableFrameIds(tabId);
  const scans: FrameScanResult[] = [];
  let unreachableFrames = 0;

  for (const frameId of frameIds) {
    try {
      const response = await sendToContent(
        tabId,
        { type: MessageType.SCAN_FORM },
        frameId,
      );
      if (response.type === MessageType.FORM_FIELDS) {
        scans.push({
          frameId,
          fields: (response as FormFieldsMessage).fields,
        });
      } else {
        unreachableFrames += 1;
      }
    } catch {
      // Cross-origin embeds need the declarative content script (all_frames).
      // Programmatic inject may fail without host permission — count and continue.
      unreachableFrames += 1;
    }
  }

  const primary = pickPrimaryFrameScan(scans);

  // Parent page often has a tiny form (newsletter) while the real application
  // lives in an iframe we could not reach — ask for a reload so all_frames attaches.
  if (
    frameIds.length > 1 &&
    unreachableFrames > 0 &&
    (primary === null || primary.fields.length <= 2)
  ) {
    throw new FillOrchestrationError(
      'O formulário parece estar em um iframe. Recarregue a aba e tente novamente.',
    );
  }

  return primary;
}

async function listScriptableFrameIds(tabId: number): Promise<number[]> {
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    if (!frames || frames.length === 0) {
      return [0];
    }

    const ids = frames
      .filter((frame) => !frame.errorOccurred && isScriptableUrl(frame.url))
      .map((frame) => frame.frameId);

    return ids.length > 0 ? ids : [0];
  } catch {
    return [0];
  }
}

async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab) {
    throw new FillOrchestrationError('Nenhuma aba ativa encontrada.');
  }
  return tab;
}

/**
 * Sends a message to the content script in a specific frame, injecting the
 * registered script on-demand when the receiving end is missing.
 */
async function sendToContent(
  tabId: number,
  message: ExtensionMessage,
  frameId: number,
): Promise<ExtensionMessage> {
  try {
    return await sendTabMessage(tabId, message, frameId);
  } catch (error) {
    if (!isNoReceiverError(error)) {
      if (error instanceof FillOrchestrationError) {
        throw error;
      }
      throw new FillOrchestrationError(
        'Não foi possível acessar esta página. Recarregue a aba e tente novamente.',
      );
    }

    try {
      await injectRegisteredContentScripts(tabId, frameId);
    } catch {
      throw new FillOrchestrationError(
        'Não foi possível acessar esta página. Recarregue a aba e tente novamente.',
      );
    }

    try {
      return await sendTabMessage(tabId, message, frameId);
    } catch (retryError) {
      if (retryError instanceof FillOrchestrationError) {
        throw retryError;
      }
      throw new FillOrchestrationError(
        'Não foi possível acessar esta página. Recarregue a aba e tente novamente.',
      );
    }
  }
}

async function sendTabMessage(
  tabId: number,
  message: ExtensionMessage,
  frameId: number,
): Promise<ExtensionMessage> {
  const response: unknown = await withTimeout(
    chrome.tabs.sendMessage(tabId, message, { frameId }),
    TAB_MESSAGE_TIMEOUT_MS,
    'A página demorou demais para responder. Tente novamente.',
  );

  if (!isExtensionMessage(response)) {
    throw new FillOrchestrationError(
      'Resposta inesperada da página. Recarregue a aba e tente novamente.',
    );
  }

  return response;
}

/** Injects content script paths from the extension manifest (hashed CRX build). */
async function injectRegisteredContentScripts(
  tabId: number,
  frameId: number,
): Promise<void> {
  const manifest = chrome.runtime.getManifest();
  const files = (manifest.content_scripts ?? []).flatMap(
    (entry) => entry.js ?? [],
  );

  if (files.length === 0) {
    throw new FillOrchestrationError(
      'Content script não registrado no manifest.',
    );
  }

  await chrome.scripting.executeScript({
    target: { tabId, frameIds: [frameId] },
    files,
  });
}
