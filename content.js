(() => {
  const BLOCK_DOMAINS = [
    /paypal[-.]?login/i,
    /secure[-.]?bank/i,
    /gift[-.]?card/i,
    /login[-.]?verify/i,
    /\.ru$/i, /\.cn$/i, /\.top$/i
  ];
  const SUSPICIOUS_WORDS = [
    /verify your account/i, /unusual login/i, /urgent/i,
    /update billing/i, /win a gift/i
  ];

  function isSuspiciousUrl(u) {
    try {
      const url = new URL(u, location.href);
      if (url.protocol !== 'https:') return true;
      const host = url.hostname;
      return BLOCK_DOMAINS.some(rx => rx.test(host));
    } catch { return false; }
  }

  function textLooksPhishy(text) {
    return SUSPICIOUS_WORDS.some(rx => rx.test(text || ''));
  }

  function flag(el, reason) {
    if (el.hasAttribute('data-safebrowse-flag')) return; // avoid re-flagging
    el.style.outline = '3px solid red';
    el.setAttribute('data-safebrowse-flag', reason);
    // Use log (not warn) to avoid extension warning noise
    try { console.log('[Safeguard]', reason, el); } catch(_) {}
  }

  function scan() {
    let hits = 0;

    // links
    document.querySelectorAll('a[href]').forEach(a => {
      const reason = [];
      if (isSuspiciousUrl(a.href)) reason.push('suspicious link');
      if (textLooksPhishy(a.textContent)) reason.push('phishy text');
      if (reason.length && !a.hasAttribute('data-safebrowse-flag')) {
        flag(a, reason.join(', '));
        hits++;
      }
    });

    // forms
    document.querySelectorAll('form[action]').forEach(f => {
      if (!f.hasAttribute('data-safebrowse-flag') && isSuspiciousUrl(f.action)) {
        flag(f, 'suspicious form action');
        hits++;
      }
    });

    if (hits) banner(`${hits} suspicious item(s) detected`);
  }

  function banner(msg) {
    const existing = document.getElementById('safebrowse-banner');
    if (existing) { existing.textContent = `⚠ Safeguard: ${msg}`; return; }
    const bar = document.createElement('div');
    bar.id = 'safebrowse-banner';
    bar.textContent = `⚠ Safeguard: ${msg}`;
    Object.assign(bar.style, {
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 999999,
      background: '#b91c1c', color: 'white', padding: '8px',
      fontFamily: 'system-ui, sans-serif', fontSize: '14px'
    });
    document.body.appendChild(bar);
  }

  // initial + mutation
  // Debounce scans to avoid spam on heavy DOM changes
  let scanTimer = null;
  const schedule = () => {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(() => { scanTimer = null; run(); }, 200);
  };

  const run = () => { try { scan(); } catch(e){ try{ console.error(e); }catch(_){} } };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else { run(); }
  new MutationObserver(() => schedule()).observe(document.documentElement, {subtree:true, childList:true});
})();
