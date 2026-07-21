import { applyValues } from '../core/apply-values';
import { scanFormFields } from '../core/form-scanner';
import {
  isExtensionMessage,
  MessageType,
  type ExtensionMessage,
  type FillDoneMessage,
  type FillErrorMessage,
  type FormFieldsMessage,
} from '../shared/messages';

/**
 * Content script: scans fillable fields and applies AI values on the page DOM.
 * Injected via manifest content_scripts (http/https).
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isExtensionMessage(message)) {
    return;
  }

  try {
    const response = handleMessage(message);
    sendResponse(response);
  } catch {
    const error: FillErrorMessage = {
      type: MessageType.FILL_ERROR,
      message: 'Não foi possível processar o formulário nesta página.',
    };
    sendResponse(error);
  }
});

function handleMessage(
  message: ExtensionMessage,
): FormFieldsMessage | FillDoneMessage | FillErrorMessage | undefined {
  if (message.type === MessageType.SCAN_FORM) {
    const fields = scanFormFields(document);
    return { type: MessageType.FORM_FIELDS, fields };
  }

  if (message.type === MessageType.APPLY_VALUES) {
    const result = applyValues(message.values, document);
    return { type: MessageType.FILL_DONE, count: result.applied };
  }

  return undefined;
}
