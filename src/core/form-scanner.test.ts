/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest';

import {
  AUTOFORM_ATTR,
  ensureStableSelector,
  isElementVisible,
  resetSyntheticCounter,
  resolveFieldLabel,
  scanFormFields,
} from './form-scanner';

beforeEach(() => {
  document.body.innerHTML = '';
  resetSyntheticCounter();
});

describe('resolveFieldLabel', () => {
  it('uses label[for]', () => {
    document.body.innerHTML = `
      <label for="email">E-mail</label>
      <input id="email" type="email" />
    `;
    const input = document.getElementById('email') as HTMLInputElement;
    expect(resolveFieldLabel(input)).toBe('E-mail');
  });

  it('uses wrapping label text without the control', () => {
    document.body.innerHTML = `
      <label>Nome completo <input id="name" type="text" /></label>
    `;
    const input = document.getElementById('name') as HTMLInputElement;
    expect(resolveFieldLabel(input)).toBe('Nome completo');
  });

  it('falls back to aria-label then placeholder', () => {
    document.body.innerHTML = `<input id="a" type="text" aria-label="Telefone" />`;
    expect(resolveFieldLabel(document.getElementById('a') as HTMLInputElement)).toBe(
      'Telefone',
    );

    document.body.innerHTML = `<input id="b" type="text" placeholder="Cidade" />`;
    expect(resolveFieldLabel(document.getElementById('b') as HTMLInputElement)).toBe(
      'Cidade',
    );
  });
});

describe('ensureStableSelector', () => {
  it('prefers unique id', () => {
    document.body.innerHTML = `<input id="first-name" type="text" />`;
    const el = document.getElementById('first-name') as HTMLInputElement;
    expect(ensureStableSelector(el)).toBe('#first-name');
  });

  it('uses name when unique', () => {
    document.body.innerHTML = `<input name="company" type="text" />`;
    const el = document.querySelector('input') as HTMLInputElement;
    expect(ensureStableSelector(el)).toBe('input[name="company"]');
  });

  it('stamps synthetic data attribute when needed', () => {
    document.body.innerHTML = `<input type="text" /><input type="text" />`;
    const el = document.querySelector('input') as HTMLInputElement;
    const selector = ensureStableSelector(el);
    expect(selector).toMatch(new RegExp(`\\[${AUTOFORM_ATTR}="af-\\d+"\\]`));
    expect(el.getAttribute(AUTOFORM_ATTR)).toBeTruthy();
  });
});

describe('isElementVisible', () => {
  it('skips display:none and hidden', () => {
    document.body.innerHTML = `
      <input id="ok" type="text" />
      <input id="gone" type="text" style="display:none" />
      <input id="hid" type="text" hidden />
    `;
    expect(isElementVisible(document.getElementById('ok')!)).toBe(true);
    expect(isElementVisible(document.getElementById('gone')!)).toBe(false);
    expect(isElementVisible(document.getElementById('hid')!)).toBe(false);
  });
});

describe('scanFormFields', () => {
  it('returns structured fields without raw HTML', () => {
    document.body.innerHTML = `
      <form>
        <label for="email">Email</label>
        <input id="email" name="email" type="email" />
        <label for="bio">Bio</label>
        <textarea id="bio" name="bio"></textarea>
        <label for="role">Cargo</label>
        <select id="role" name="role">
          <option value="">—</option>
          <option value="dev">Developer</option>
          <option value="pm">PM</option>
        </select>
        <fieldset>
          <legend>Disponibilidade</legend>
          <label><input type="radio" name="avail" value="full" /> Integral</label>
          <label><input type="radio" name="avail" value="part" /> Parcial</label>
        </fieldset>
        <label><input type="checkbox" name="remote" value="yes" /> Remoto</label>
        <input type="hidden" name="csrf" value="x" />
        <input type="submit" value="Enviar" />
        <input id="disabled" type="text" disabled />
      </form>
    `;

    const fields = scanFormFields(document);
    const types = fields.map((f) => f.type).sort();
    expect(types).toEqual([
      'checkbox',
      'email',
      'radio',
      'select',
      'textarea',
    ]);

    const email = fields.find((f) => f.type === 'email');
    expect(email?.label).toBe('Email');
    expect(email?.selector).toBe('#email');

    const select = fields.find((f) => f.type === 'select');
    expect(select?.options).toEqual(
      expect.arrayContaining(['Developer', 'PM']),
    );

    const radio = fields.find((f) => f.type === 'radio');
    expect(radio?.label).toBe('Disponibilidade');
    expect(radio?.options?.length).toBeGreaterThanOrEqual(2);

    // Never serialize page HTML
    const serialized = JSON.stringify(fields);
    expect(serialized).not.toContain('<form');
    expect(serialized).not.toContain('<input');
  });

  it('skips disabled and hidden inputs', () => {
    document.body.innerHTML = `
      <input id="a" type="text" />
      <input id="b" type="text" disabled />
      <input id="c" type="text" style="display:none" />
      <input id="d" type="hidden" name="tok" />
    `;
    const fields = scanFormFields(document);
    expect(fields).toHaveLength(1);
    expect(fields[0]?.selector).toBe('#a');
  });
});
