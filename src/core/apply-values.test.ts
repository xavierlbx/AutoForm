/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { applyValues } from './apply-values';
import { scanFormFields } from './form-scanner';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('applyValues', () => {
  it('fills text, textarea and select and counts success', () => {
    document.body.innerHTML = `
      <input id="name" type="text" />
      <textarea id="bio"></textarea>
      <select id="role">
        <option value="">—</option>
        <option value="dev">Developer</option>
        <option value="pm">PM</option>
      </select>
    `;

    const result = applyValues([
      { selector: '#name', value: 'Ada Lovelace' },
      { selector: '#bio', value: 'Matemática' },
      { selector: '#role', value: 'Developer' },
      { selector: '#missing', value: 'x' },
    ]);

    expect(result).toEqual({ applied: 3, failed: 1 });
    expect((document.getElementById('name') as HTMLInputElement).value).toBe(
      'Ada Lovelace',
    );
    expect((document.getElementById('bio') as HTMLTextAreaElement).value).toBe(
      'Matemática',
    );
    expect((document.getElementById('role') as HTMLSelectElement).value).toBe(
      'dev',
    );
  });

  it('checks checkbox and selects matching radio', () => {
    document.body.innerHTML = `
      <input id="remote" type="checkbox" name="remote" value="yes" />
      <input type="radio" name="avail" value="full" id="full" />
      <input type="radio" name="avail" value="part" id="part" />
    `;

    const result = applyValues([
      { selector: '#remote', value: 'true' },
      { selector: 'input[type="radio"][name="avail"]', value: 'part' },
    ]);

    expect(result.applied).toBe(2);
    expect(result.failed).toBe(0);
    expect((document.getElementById('remote') as HTMLInputElement).checked).toBe(
      true,
    );
    expect((document.getElementById('part') as HTMLInputElement).checked).toBe(
      true,
    );
  });

  it('dispatches input and change events', () => {
    document.body.innerHTML = `<input id="x" type="text" />`;
    const input = document.getElementById('x') as HTMLInputElement;
    const events: string[] = [];
    input.addEventListener('input', () => events.push('input'));
    input.addEventListener('change', () => events.push('change'));

    applyValues([{ selector: '#x', value: 'hi' }]);
    expect(events).toEqual(['input', 'change']);
  });

  it('sets contenteditable via textContent (not HTML)', () => {
    document.body.innerHTML = `<div id="ed" contenteditable="true"></div>`;
    const result = applyValues([
      { selector: '#ed', value: '<script>alert(1)</script>safe' },
    ]);
    expect(result.applied).toBe(1);
    const ed = document.getElementById('ed')!;
    expect(ed.innerHTML).not.toContain('<script>');
    expect(ed.textContent).toBe('<script>alert(1)</script>safe');
  });

  it('round-trips scan selectors with apply', () => {
    document.body.innerHTML = `
      <label for="email">Email</label>
      <input id="email" name="email" type="email" />
      <label><input type="checkbox" name="ok" value="1" /> OK</label>
    `;
    const fields = scanFormFields(document);
    const values = fields.map((f) => ({
      selector: f.selector,
      value: f.type === 'checkbox' ? 'true' : 'a@b.com',
    }));
    const result = applyValues(values);
    expect(result.failed).toBe(0);
    expect(result.applied).toBe(fields.length);
  });
});
