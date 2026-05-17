import { describe, it, expect, beforeEach } from 'vitest';
import { setupLevelSelector } from '../public/assets/level-selector.js';

function setupDom() {
  document.body.innerHTML = `
    <section id="step-level">
      <button class="level-card" data-level="kids" aria-pressed="false">Kids</button>
      <button class="level-card" data-level="teens" aria-pressed="false">Teens</button>
      <button class="level-card" data-level="family" aria-pressed="false">Family</button>
    </section>
    <section id="step-install" hidden></section>
    <section id="step-verify" hidden></section>
  `;
}

describe('level selector', () => {
  beforeEach(setupDom);

  it('sets aria-pressed on the clicked card and unsets others', () => {
    setupLevelSelector(() => {});
    document.querySelector('[data-level="teens"]').click();
    expect(document.querySelector('[data-level="kids"]').getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('[data-level="teens"]').getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('[data-level="family"]').getAttribute('aria-pressed')).toBe('false');
  });

  it('reveals step-install and step-verify on selection', () => {
    setupLevelSelector(() => {});
    expect(document.getElementById('step-install').hidden).toBe(true);
    document.querySelector('[data-level="kids"]').click();
    expect(document.getElementById('step-install').hidden).toBe(false);
    expect(document.getElementById('step-verify').hidden).toBe(false);
  });

  it('invokes the callback with the chosen level', () => {
    const calls = [];
    setupLevelSelector((level) => calls.push(level));
    document.querySelector('[data-level="family"]').click();
    expect(calls).toEqual(['family']);
  });

  it('allows changing selection (callback fires again)', () => {
    const calls = [];
    setupLevelSelector((level) => calls.push(level));
    document.querySelector('[data-level="kids"]').click();
    document.querySelector('[data-level="teens"]').click();
    expect(calls).toEqual(['kids', 'teens']);
  });
});
