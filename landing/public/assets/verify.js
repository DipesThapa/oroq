const LEVELS = ['kids', 'teens', 'family'];

export function interpretResults({ allow, kids, teens, family }) {
  if (!allow) return { status: 'network', level: null };
  const levelResults = { kids, teens, family };
  const blocked = LEVELS.filter((l) => !levelResults[l]);
  if (blocked.length === 0) return { status: 'no-filter', level: null };
  if (blocked.length === 1) return { status: 'protected', level: blocked[0] };
  return { status: 'unknown', level: null };
}

/**
 * Probe a URL by attempting to load it as an Image. Resolves with true
 * if the image loaded, false on error or timeout. Cache-busts to avoid
 * stale results across visits.
 */
export function probeImage(url, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const img = new Image();
    const bust = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
    const timer = setTimeout(() => resolve(false), timeoutMs);
    img.onload = () => { clearTimeout(timer); resolve(true); };
    img.onerror = () => { clearTimeout(timer); resolve(false); };
    img.src = bust;
  });
}

const PROBES = {
  allow:  'https://safebrowse-allow-test.cyberheroez.co.uk/pixel.png',
  kids:   'https://safebrowse-kids-test.cyberheroez.co.uk/pixel.png',
  teens:  'https://safebrowse-teens-test.cyberheroez.co.uk/pixel.png',
  family: 'https://safebrowse-family-test.cyberheroez.co.uk/pixel.png',
};

export async function runProbes() {
  const entries = await Promise.all(
    Object.entries(PROBES).map(async ([name, url]) => [name, await probeImage(url)])
  );
  return Object.fromEntries(entries);
}

function render(result) {
  const root = document.getElementById('verify-result');
  if (!root) return;
  root.hidden = false;

  const messages = {
    network: {
      cls: 'notice--warn',
      title: '⚠ Network problem',
      body: 'We couldn\'t reach our test endpoint. SafeBrowse can\'t be detected. Check your internet and try again.',
    },
    'no-filter': {
      cls: 'notice--warn',
      title: '❌ SafeBrowse is not active',
      body: 'No SafeBrowse filter detected on this device. Install a profile from the home page and re-test.',
    },
    protected: {
      cls: 'notice notice--info',
      title: `✅ SafeBrowse is active — ${result.level?.toUpperCase()} filter`,
      body: `This device is currently using the ${result.level} filter. Browsing is being protected.`,
    },
    unknown: {
      cls: 'notice--warn',
      title: '⚠ Unexpected result',
      body: 'Multiple filters appear to be blocking, which we did not expect. Try removing existing SafeBrowse profiles and re-installing one.',
    },
  };
  const msg = messages[result.status];
  root.className = `notice ${msg.cls}`;
  root.innerHTML = `<p class="notice__title">${msg.title}</p><p class="notice__body">${msg.body}</p>`;
}

export async function main() {
  const result = interpretResults(await runProbes());
  render(result);
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', main);
}
