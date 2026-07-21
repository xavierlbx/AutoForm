import type { ApplyValuesResult, FieldValue } from './types';

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function dispatchInputEvents(el: HTMLElement): void {
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Set a control's value in a way frameworks (React/Vue) notice:
 * native prototype setter + bubbling input/change events.
 */
function setNativeValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  if (descriptor?.set) {
    descriptor.set.call(el, value);
  } else {
    el.value = value;
  }
  dispatchInputEvents(el);
}

function parseBooleanish(value: string): boolean | null {
  const v = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'on', 'checked'].includes(v)) {
    return true;
  }
  if (['false', '0', 'no', 'off', 'unchecked', ''].includes(v)) {
    return false;
  }
  return null;
}

function matchSelectOption(
  select: HTMLSelectElement,
  value: string,
): HTMLOptionElement | null {
  const normalized = value.trim().toLowerCase();
  const byValue = Array.from(select.options).find(
    (opt) => opt.value === value || opt.value.toLowerCase() === normalized,
  );
  if (byValue) {
    return byValue;
  }
  return (
    Array.from(select.options).find((opt) => {
      const label = (opt.label || opt.textContent || '').trim().toLowerCase();
      return label === normalized;
    }) ?? null
  );
}

function applyToCheckbox(input: HTMLInputElement, value: string): boolean {
  const bool = parseBooleanish(value);
  if (bool !== null) {
    if (input.checked !== bool) {
      input.click();
    }
    // click() already fires events; ensure change if already in desired state
    if (input.checked !== bool) {
      input.checked = bool;
      dispatchInputEvents(input);
    }
    return input.checked === bool;
  }
  // Match by value attribute (checkbox groups)
  const shouldCheck =
    input.value === value || input.value.toLowerCase() === value.trim().toLowerCase();
  if (input.checked !== shouldCheck) {
    input.click();
  }
  if (input.checked !== shouldCheck) {
    input.checked = shouldCheck;
    dispatchInputEvents(input);
  }
  return input.checked === shouldCheck;
}

function applyToRadio(input: HTMLInputElement, value: string): boolean {
  const name = input.name;
  const root = input.ownerDocument;
  const group = name
    ? root.querySelectorAll(`input[type="radio"][name="${cssEscape(name)}"]`)
    : [input];

  const normalized = value.trim().toLowerCase();
  for (const node of Array.from(group)) {
    if (!(node instanceof HTMLInputElement)) {
      continue;
    }
    const labelEl =
      (node.id && root.querySelector(`label[for="${cssEscape(node.id)}"]`)) ||
      node.closest('label');
    const labelText = (labelEl?.textContent ?? '').trim().toLowerCase();
    const matches =
      node.value === value ||
      node.value.toLowerCase() === normalized ||
      labelText === normalized ||
      (labelText.includes(normalized) && normalized.length > 0);

    if (matches) {
      if (!node.checked) {
        node.click();
      }
      if (!node.checked) {
        node.checked = true;
        dispatchInputEvents(node);
      }
      return node.checked;
    }
  }
  return false;
}

function applyToElement(el: Element, value: string): boolean {
  if (el instanceof HTMLSelectElement) {
    const option = matchSelectOption(el, value);
    if (!option) {
      return false;
    }
    el.value = option.value;
    dispatchInputEvents(el);
    return el.value === option.value;
  }

  if (el instanceof HTMLTextAreaElement) {
    setNativeValue(el, value);
    return el.value === value;
  }

  if (el instanceof HTMLInputElement) {
    const type = (el.type || 'text').toLowerCase();
    if (type === 'checkbox') {
      return applyToCheckbox(el, value);
    }
    if (type === 'radio') {
      return applyToRadio(el, value);
    }
    setNativeValue(el, value);
    return el.value === value;
  }

  if (
    el instanceof HTMLElement &&
    (el.isContentEditable || el.getAttribute('contenteditable') === 'true')
  ) {
    // textContent avoids interpreting value as HTML (XSS-safe)
    el.textContent = value;
    dispatchInputEvents(el);
    return (el.textContent ?? '') === value;
  }

  return false;
}

/**
 * Apply AI-suggested FieldValue[] to the DOM.
 * Uses selectors from the scanner; returns applied/failed counts.
 */
export function applyValues(
  values: FieldValue[],
  root: ParentNode = document,
): ApplyValuesResult {
  let applied = 0;
  let failed = 0;

  for (const { selector, value } of values) {
    if (!selector || value === undefined || value === null) {
      failed += 1;
      continue;
    }

    let el: Element | null = null;
    try {
      el = root.querySelector(selector);
    } catch {
      failed += 1;
      continue;
    }

    if (!el) {
      failed += 1;
      continue;
    }

    try {
      if (applyToElement(el, value)) {
        applied += 1;
      } else {
        failed += 1;
      }
    } catch {
      failed += 1;
    }
  }

  return { applied, failed };
}
