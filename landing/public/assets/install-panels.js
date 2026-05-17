const PLATFORMS = ['ios', 'android', 'desktop'];

export function detectPlatform(ua = navigator.userAgent) {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

function activatePlatform(p) {
  PLATFORMS.forEach((name) => {
    const tab = document.querySelector(`.platform-tab[data-platform="${name}"]`);
    const panel = document.querySelector(`.platform-panel[data-platform="${name}"]`);
    const selected = name === p;
    if (tab) tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    if (panel) panel.dataset.active = selected ? 'true' : 'false';
  });
}

function updateIosDownload(level) {
  const link = document.getElementById('ios-download');
  if (link) link.setAttribute('href', `/profiles/${level}.mobileconfig`);
}

function hostnameFor(level) {
  return `${level}.dns.cyberheroez.co.uk`;
}

function updateHostnames(level) {
  const text = document.getElementById('android-hostname');
  if (text) text.textContent = hostnameFor(level);
  const router = document.getElementById('router-hostname');
  if (router) router.textContent = hostnameFor(level);
}

function wireAndroidCopy() {
  const btn = document.getElementById('android-copy');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const text = document.getElementById('android-hostname')?.textContent ?? '';
    try {
      await navigator.clipboard.writeText(text);
      const original = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = original; }, 1500);
    } catch {
      btn.textContent = 'Press Cmd/Ctrl+C';
    }
  });
}

/**
 * Wire the install-step tabs and the per-platform link / hostname state.
 * Returns a handle with `setLevel(level)` so the caller can update
 * the link and hostname when the user changes their level pick.
 */
export function setupInstallPanels({ platform, level }) {
  activatePlatform(platform);
  updateIosDownload(level);
  updateHostnames(level);
  wireAndroidCopy();

  document.querySelectorAll('.platform-tab').forEach((tab) => {
    tab.addEventListener('click', () => activatePlatform(tab.dataset.platform));
  });

  return {
    setLevel(newLevel) {
      updateIosDownload(newLevel);
      updateHostnames(newLevel);
    },
  };
}
