/**
 * @file p1588-description-checklist.test.ts
 * @description P1588: a ticked task list ("- [x] …") in an event description renders as list items
 * that start with a checked, disabled checkbox, which the `.event-description` checklist rules style
 * as an indented, bullet-free, tight checklist. Ordinary bullet lists are untouched.
 */
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderEventDescription } from '@/lib/markdown';

const render = (md: string) => {
  const div = document.createElement('div');
  div.innerHTML = renderEventDescription(md, []);
  return div;
};

const ITEM = "li:has(> input[type='checkbox'], > p:first-child > input[type='checkbox'])";

describe('P1588 description checklist', () => {
  it('a ticked task list renders checked, disabled checkboxes the item rule matches', () => {
    const items = [...render('- [x] You own it.\n- [x] You sell it.').querySelectorAll('li')];
    expect(items).toHaveLength(2);
    for (const li of items) {
      expect(li.matches(ITEM)).toBe(true);
      const box = li.querySelector('input') as HTMLInputElement;
      expect(box.checked).toBe(true);
      expect(box.disabled).toBe(true);
    }
  });

  it('a loose task list (blank lines between items) still matches', () => {
    const items = [...render('- [x] One.\n\n- [ ] Two.').querySelectorAll('li')];
    expect(items.map(li => li.matches(ITEM))).toEqual([true, true]);
  });

  it('in a mixed list only the task item is a checklist item; plain bullets stay', () => {
    const items = [...render('- [x] Done.\n- Plain note.').querySelectorAll('li')];
    expect(items.map(li => li.matches(ITEM))).toEqual([true, false]);
  });

  it('an ordinary bullet list is untouched', () => {
    expect([...render('- one\n- two').querySelectorAll('li')].some(li => li.matches(ITEM))).toBe(false);
  });

  it('the checklist rules are in the stylesheet, scoped to event descriptions', () => {
    const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
    expect(css).toContain(`.event-description ${ITEM} {`);
    expect(css).toMatch(/\.event-description li > input\[type='checkbox'\]:checked,/);
  });
});
