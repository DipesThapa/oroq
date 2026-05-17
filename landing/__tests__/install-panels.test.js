import { describe, it, expect, beforeEach } from 'vitest';
import { setupInstallPanels, detectPlatform } from '../public/assets/install-panels.js';

function setupDom() {
  document.body.innerHTML = `
    <div class="platform-tabs">
      <button class="platform-tab" role="tab" aria-selected="false" data-platform="ios">iOS</button>
      <button class="platform-tab" role="tab" aria-selected="false" data-platform="android">Android</button>
      <button class="platform-tab" role="tab" aria-selected="false" data-platform="desktop">Desktop</button>
    </div>
    <div class="platform-panel" data-platform="ios" data-active="false" role="tabpanel"></div>
    <div class="platform-panel" data-platform="android" data-active="false" role="tabpanel"></div>
    <div class="platform-panel" data-platform="desktop" data-active="false" role="tabpanel"></div>
    <a id="ios-download" href="#">Download</a>
    <span id="android-hostname"></span>
    <button id="android-copy"></button>
    <span id="router-hostname"></span>
  `;
}

describe('detectPlatform', () => {
  it('detects iOS user agents', () => {
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605')).toBe('ios');
    expect(detectPlatform('Mozilla/5.0 (iPad; CPU OS 16_0)')).toBe('ios');
  });

  it('detects Android user agents', () => {
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 13; Pixel 7)')).toBe('android');
  });

  it('defaults to desktop for other UAs', () => {
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0)')).toBe('desktop');
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0)')).toBe('desktop');
  });
});

describe('install panels', () => {
  beforeEach(setupDom);

  it('activates the auto-detected platform tab', () => {
    setupInstallPanels({ platform: 'android', level: 'kids' });
    expect(document.querySelector('[data-platform="android"][role="tabpanel"]').dataset.active).toBe('true');
    expect(document.querySelector('[data-platform="android"][role="tab"]').getAttribute('aria-selected')).toBe('true');
  });

  it('switches panel when a tab is clicked', () => {
    setupInstallPanels({ platform: 'android', level: 'kids' });
    document.querySelector('[data-platform="ios"][role="tab"]').click();
    expect(document.querySelector('[data-platform="ios"][role="tabpanel"]').dataset.active).toBe('true');
    expect(document.querySelector('[data-platform="android"][role="tabpanel"]').dataset.active).toBe('false');
  });

  it('points iOS download link at the chosen level\'s profile', () => {
    setupInstallPanels({ platform: 'ios', level: 'teens' });
    expect(document.getElementById('ios-download').getAttribute('href')).toBe('/profiles/teens.mobileconfig');
  });

  it('updates iOS link when level changes', () => {
    const handle = setupInstallPanels({ platform: 'ios', level: 'kids' });
    handle.setLevel('family');
    expect(document.getElementById('ios-download').getAttribute('href')).toBe('/profiles/family.mobileconfig');
  });

  it('shows correct Android hostname for chosen level', () => {
    setupInstallPanels({ platform: 'android', level: 'family' });
    expect(document.getElementById('android-hostname').textContent).toBe('family.dns.cyberheroez.co.uk');
  });

  it('updates Android hostname when level changes', () => {
    const handle = setupInstallPanels({ platform: 'android', level: 'kids' });
    handle.setLevel('teens');
    expect(document.getElementById('android-hostname').textContent).toBe('teens.dns.cyberheroez.co.uk');
  });

  it('mirrors hostname into router-hostname element', () => {
    const handle = setupInstallPanels({ platform: 'desktop', level: 'kids' });
    expect(document.getElementById('router-hostname').textContent).toBe('kids.dns.cyberheroez.co.uk');
    handle.setLevel('family');
    expect(document.getElementById('router-hostname').textContent).toBe('family.dns.cyberheroez.co.uk');
  });

  it('copy button writes hostname to clipboard', async () => {
    let written = '';
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async (s) => { written = s; } },
      configurable: true,
    });
    setupInstallPanels({ platform: 'android', level: 'kids' });
    document.getElementById('android-copy').click();
    await Promise.resolve();
    await Promise.resolve();
    expect(written).toBe('kids.dns.cyberheroez.co.uk');
  });
});
