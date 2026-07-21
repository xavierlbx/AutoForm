import type { FieldValue, FormField } from '../core/types';

/** Discriminant string literals for runtime messaging. */
export const MessageType = {
  FILL_REQUEST: 'FILL_REQUEST',
  SCAN_FORM: 'SCAN_FORM',
  FORM_FIELDS: 'FORM_FIELDS',
  APPLY_VALUES: 'APPLY_VALUES',
  FILL_DONE: 'FILL_DONE',
  FILL_RESULT: 'FILL_RESULT',
  FILL_ERROR: 'FILL_ERROR',
} as const;

export type MessageTypeId = (typeof MessageType)[keyof typeof MessageType];

/** popup → background: start the fill orchestration. */
export interface FillRequestMessage {
  type: typeof MessageType.FILL_REQUEST;
}

/** background → content: ask for visible fillable fields. */
export interface ScanFormMessage {
  type: typeof MessageType.SCAN_FORM;
}

/** content → background: structured field list (no raw HTML). */
export interface FormFieldsMessage {
  type: typeof MessageType.FORM_FIELDS;
  fields: FormField[];
}

/** background → content: apply AI-suggested values to the DOM. */
export interface ApplyValuesMessage {
  type: typeof MessageType.APPLY_VALUES;
  values: FieldValue[];
}

/** content → background: how many fields were written successfully. */
export interface FillDoneMessage {
  type: typeof MessageType.FILL_DONE;
  count: number;
}

/**
 * background → popup: successful end-to-end fill summary.
 * `skipped` = fields left blank (AI could not infer or apply failed).
 */
export interface FillResultMessage {
  type: typeof MessageType.FILL_RESULT;
  filled: number;
  skipped: number;
}

/** Any direction: user-facing failure (no stack traces / no secrets). */
export interface FillErrorMessage {
  type: typeof MessageType.FILL_ERROR;
  message: string;
}

/**
 * Discriminated union for popup ↔ background ↔ content messaging.
 * Flow: FILL_REQUEST → SCAN_FORM → FORM_FIELDS → (AI) → APPLY_VALUES →
 * FILL_DONE → FILL_RESULT | FILL_ERROR.
 */
export type ExtensionMessage =
  | FillRequestMessage
  | ScanFormMessage
  | FormFieldsMessage
  | ApplyValuesMessage
  | FillDoneMessage
  | FillResultMessage
  | FillErrorMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFormFieldLike(value: unknown): value is FormField {
  if (!isRecord(value)) {
    return false;
  }
  const optionsOk =
    value.options === undefined ||
    (Array.isArray(value.options) &&
      value.options.every((item) => typeof item === 'string'));
  return (
    typeof value.selector === 'string' &&
    typeof value.label === 'string' &&
    typeof value.type === 'string' &&
    optionsOk
  );
}

function isFieldValueLike(value: unknown): value is FieldValue {
  return (
    isRecord(value) &&
    typeof value.selector === 'string' &&
    typeof value.value === 'string'
  );
}

/** Narrow unknown chrome.runtime payloads to ExtensionMessage. */
export function isExtensionMessage(value: unknown): value is ExtensionMessage {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false;
  }

  switch (value.type) {
    case MessageType.FILL_REQUEST:
    case MessageType.SCAN_FORM:
      return true;
    case MessageType.FORM_FIELDS:
      return (
        Array.isArray(value.fields) && value.fields.every(isFormFieldLike)
      );
    case MessageType.APPLY_VALUES:
      return (
        Array.isArray(value.values) && value.values.every(isFieldValueLike)
      );
    case MessageType.FILL_DONE:
      return typeof value.count === 'number' && Number.isFinite(value.count);
    case MessageType.FILL_RESULT:
      return (
        typeof value.filled === 'number' &&
        Number.isFinite(value.filled) &&
        typeof value.skipped === 'number' &&
        Number.isFinite(value.skipped)
      );
    case MessageType.FILL_ERROR:
      return typeof value.message === 'string';
    default:
      return false;
  }
}
