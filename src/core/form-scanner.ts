import type { FormField, FormFieldType } from './types';

/** Synthetic attribute used when id/name are missing or unstable. */
export const AUTOFORM_ATTR = 'data-autoform-field';

const SKIP_INPUT_TYPES = new Set([
  'hidden',
  'submit',
  'button',
  'reset',
  'file',
  'image',
  'range',
  'color',
]);

const INPUT_TYPE_MAP: Record<string, FormFieldType> = {
  text: 'text',
  email: 'email',
  tel: 'tel',
  url: 'url',
  number: 'number',
  password: 'password',
  search: 'search',
  date: 'date',
  'datetime-local': 'datetime-local',
  time: 'time',
  checkbox: 'checkbox',
  radio: 'radio',
};

let syntheticCounter = 0;

/** Reset synthetic id counter (useful in tests). */
export function resetSyntheticCounter(): void {
  syntheticCounter = 0;
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * True when the element is visible enough to fill (best-effort).
 * Avoids opacity/size checks — many custom widgets hide native controls
 * with opacity:0 or zero box while remaining fillable.
 */
export function isElementVisible(el: Element): boolean {
  if (!(el instanceof HTMLElement)) {
    return false;
  }
  if (el.hidden || el.getAttribute('aria-hidden') === 'true') {
    return false;
  }
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return false;
  }
  return true;
}

function isEnabledControl(el: HTMLElement): boolean {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return !el.disabled && !el.readOnly;
  }
  if (el instanceof HTMLSelectElement) {
    return !el.disabled;
  }
  if (el.isContentEditable) {
    return el.getAttribute('contenteditable') !== 'false';
  }
  return !el.hasAttribute('disabled');
}

function mapInputType(raw: string): FormFieldType {
  const key = raw.toLowerCase() || 'text';
  return INPUT_TYPE_MAP[key] ?? 'other';
}

/**
 * Resolve a human-readable label for a control.
 * Order: label[for], wrapping <label>, aria-label, aria-labelledby,
 * nearby text, placeholder, name.
 */
export function resolveFieldLabel(el: HTMLElement): string {
  if (el.id) {
    const byFor = el.ownerDocument.querySelector(
      `label[for="${cssEscape(el.id)}"]`,
    );
    if (byFor) {
      const text = normalizeWhitespace(byFor.textContent ?? '');
      if (text) {
        return text;
      }
    }
  }

  const wrapping = el.closest('label');
  if (wrapping) {
    const clone = wrapping.cloneNode(true) as HTMLLabelElement;
    clone.querySelectorAll('input, select, textarea').forEach((n) => n.remove());
    const text = normalizeWhitespace(clone.textContent ?? '');
    if (text) {
      return text;
    }
  }

  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.trim()) {
    return normalizeWhitespace(ariaLabel);
  }

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const parts = labelledBy
      .split(/\s+/)
      .map((id) => el.ownerDocument.getElementById(id)?.textContent ?? '')
      .map(normalizeWhitespace)
      .filter(Boolean);
    if (parts.length > 0) {
      return parts.join(' ');
    }
  }

  const nearby = findNearbyText(el);
  if (nearby) {
    return nearby;
  }

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const placeholder = el.placeholder?.trim();
    if (placeholder) {
      return placeholder;
    }
  }

  const name =
    el.getAttribute('name') ||
    (el instanceof HTMLInputElement ? el.name : '') ||
    '';
  if (name.trim()) {
    return name.trim();
  }

  return '';
}

function findNearbyText(el: HTMLElement): string {
  const prev = el.previousElementSibling;
  if (prev && !isFormControl(prev)) {
    const text = normalizeWhitespace(prev.textContent ?? '');
    if (text && text.length < 200) {
      return text;
    }
  }

  const parent = el.parentElement;
  if (parent && parent !== el.ownerDocument.body) {
    for (const child of Array.from(parent.childNodes)) {
      if (child === el) {
        break;
      }
      if (child.nodeType === Node.TEXT_NODE) {
        const text = normalizeWhitespace(child.textContent ?? '');
        if (text && text.length < 200) {
          return text;
        }
      }
      if (child instanceof HTMLElement && !isFormControl(child)) {
        const tag = child.tagName.toLowerCase();
        if (tag === 'span' || tag === 'div' || tag === 'p' || tag === 'strong' || tag === 'b' || tag === 'label') {
          const text = normalizeWhitespace(child.textContent ?? '');
          if (text && text.length < 200) {
            return text;
          }
        }
      }
    }
  }

  return '';
}

function isFormControl(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'select' ||
    tag === 'textarea' ||
    tag === 'button'
  );
}

/**
 * Build a stable selector for later apply. Prefers #id, then [name],
 * otherwise stamps a synthetic data-* attribute.
 */
export function ensureStableSelector(el: HTMLElement): string {
  const existing = el.getAttribute(AUTOFORM_ATTR);
  if (existing) {
    return `[${AUTOFORM_ATTR}="${cssEscape(existing)}"]`;
  }

  if (el.id) {
    const matches = el.ownerDocument.querySelectorAll(`#${cssEscape(el.id)}`);
    if (matches.length === 1) {
      return `#${cssEscape(el.id)}`;
    }
  }

  if (el instanceof HTMLInputElement && el.type === 'radio' && el.name) {
    return `input[type="radio"][name="${cssEscape(el.name)}"]`;
  }

  if (
    (el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement) &&
    el.name
  ) {
    const tag = el.tagName.toLowerCase();
    const nameSel = `${tag}[name="${cssEscape(el.name)}"]`;
    const matches = el.ownerDocument.querySelectorAll(nameSel);
    if (matches.length === 1) {
      return nameSel;
    }
    if (el instanceof HTMLInputElement && el.type === 'checkbox' && el.value) {
      const withValue = `input[type="checkbox"][name="${cssEscape(el.name)}"][value="${cssEscape(el.value)}"]`;
      if (el.ownerDocument.querySelectorAll(withValue).length === 1) {
        return withValue;
      }
    }
  }

  syntheticCounter += 1;
  const syntheticId = `af-${syntheticCounter}`;
  el.setAttribute(AUTOFORM_ATTR, syntheticId);
  return `[${AUTOFORM_ATTR}="${cssEscape(syntheticId)}"]`;
}

function collectSelectOptions(select: HTMLSelectElement): string[] {
  return Array.from(select.options)
    .map((opt) => normalizeWhitespace(opt.label || opt.text || opt.value))
    .filter(Boolean);
}

function collectRadioOptions(
  root: ParentNode,
  name: string,
): string[] {
  const radios = root.querySelectorAll(
    `input[type="radio"][name="${cssEscape(name)}"]`,
  );
  const options: string[] = [];
  radios.forEach((node) => {
    if (!(node instanceof HTMLInputElement)) {
      return;
    }
    const label = resolveFieldLabel(node);
    const value = node.value;
    const entry = label && label !== name ? `${label} (${value})` : value;
    if (entry && !options.includes(entry)) {
      options.push(entry);
    }
  });
  return options;
}

function shouldSkipInput(input: HTMLInputElement): boolean {
  const type = (input.type || 'text').toLowerCase();
  if (SKIP_INPUT_TYPES.has(type)) {
    return true;
  }
  if (!isEnabledControl(input) || !isElementVisible(input)) {
    return true;
  }
  return false;
}

/**
 * Scans the DOM under `root` for visible, enabled fillable fields.
 * Returns structured FormField[] only — never raw page HTML.
 */
export function scanFormFields(root: ParentNode = document): FormField[] {
  const fields: FormField[] = [];
  const seenRadioNames = new Set<string>();
  const seenSelectors = new Set<string>();

  const candidates = root.querySelectorAll(
    'input, textarea, select, [contenteditable="true"]',
  );

  for (const node of Array.from(candidates)) {
    if (!(node instanceof HTMLElement)) {
      continue;
    }

    if (node instanceof HTMLInputElement) {
      if (shouldSkipInput(node)) {
        continue;
      }

      const type = mapInputType(node.type || 'text');

      if (type === 'radio') {
        const name = node.name;
        if (name) {
          if (seenRadioNames.has(name)) {
            continue;
          }
          seenRadioNames.add(name);
        }

        let representative = node;
        if (name) {
          const group = root.querySelectorAll(
            `input[type="radio"][name="${cssEscape(name)}"]`,
          );
          for (const r of Array.from(group)) {
            if (
              r instanceof HTMLInputElement &&
              isEnabledControl(r) &&
              isElementVisible(r)
            ) {
              representative = r;
              break;
            }
          }
        }

        const selector = ensureStableSelector(representative);
        if (seenSelectors.has(selector)) {
          continue;
        }
        seenSelectors.add(selector);
        fields.push({
          selector,
          label: name
            ? resolveRadioGroupLabel(representative, name)
            : resolveFieldLabel(representative),
          type: 'radio',
          options: name
            ? collectRadioOptions(root, name)
            : [representative.value].filter(Boolean),
        });
        continue;
      }

      const selector = ensureStableSelector(node);
      if (seenSelectors.has(selector)) {
        continue;
      }
      seenSelectors.add(selector);
      fields.push({
        selector,
        label: resolveFieldLabel(node),
        type,
      });
      continue;
    }

    if (node instanceof HTMLTextAreaElement) {
      if (!isEnabledControl(node) || !isElementVisible(node)) {
        continue;
      }
      const selector = ensureStableSelector(node);
      if (seenSelectors.has(selector)) {
        continue;
      }
      seenSelectors.add(selector);
      fields.push({
        selector,
        label: resolveFieldLabel(node),
        type: 'textarea',
      });
      continue;
    }

    if (node instanceof HTMLSelectElement) {
      if (!isEnabledControl(node) || !isElementVisible(node)) {
        continue;
      }
      const selector = ensureStableSelector(node);
      if (seenSelectors.has(selector)) {
        continue;
      }
      seenSelectors.add(selector);
      fields.push({
        selector,
        label: resolveFieldLabel(node),
        type: 'select',
        options: collectSelectOptions(node),
      });
      continue;
    }

    // contenteditable (not already an input/textarea)
    if (
      node.isContentEditable &&
      !(node instanceof HTMLInputElement) &&
      !(node instanceof HTMLTextAreaElement)
    ) {
      if (!isEnabledControl(node) || !isElementVisible(node)) {
        continue;
      }
      const selector = ensureStableSelector(node);
      if (seenSelectors.has(selector)) {
        continue;
      }
      seenSelectors.add(selector);
      fields.push({
        selector,
        label: resolveFieldLabel(node),
        type: 'contenteditable',
      });
    }
  }

  return fields;
}

function resolveRadioGroupLabel(
  representative: HTMLInputElement,
  name: string,
): string {
  const fieldset = representative.closest('fieldset');
  const legend = fieldset?.querySelector('legend');
  if (legend) {
    const text = normalizeWhitespace(legend.textContent ?? '');
    if (text) {
      return text;
    }
  }
  const aria = representative
    .closest('[role="radiogroup"]')
    ?.getAttribute('aria-label');
  if (aria?.trim()) {
    return normalizeWhitespace(aria);
  }
  // Prefer group-level label over the option's own label
  const labelledBy = representative
    .closest('[role="radiogroup"]')
    ?.getAttribute('aria-labelledby');
  if (labelledBy) {
    const doc = representative.ownerDocument;
    const parts = labelledBy
      .split(/\s+/)
      .map((id) => doc.getElementById(id)?.textContent ?? '')
      .map(normalizeWhitespace)
      .filter(Boolean);
    if (parts.length > 0) {
      return parts.join(' ');
    }
  }
  return name;
}
