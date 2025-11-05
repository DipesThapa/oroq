const enabledEl = document.getElementById('enabled');
const statusBadge = document.getElementById('statusBadge');
const allowHost = document.getElementById('allowHost');
const addAllow = document.getElementById('addAllow');
const clearAllow = document.getElementById('clearAllow');
const allowList = document.getElementById('allowList');
const allowMessage = document.getElementById('allowMessage');
const aggressiveEl = document.getElementById('aggressive');
const sensitivityEl = document.getElementById('sensitivity');
const sensitivityValue = document.getElementById('sensitivityValue');
const blocklistInput = document.getElementById('blocklistInput');
const importBlocklist = document.getElementById('importBlocklist');
const clearBlocklist = document.getElementById('clearBlocklist');
const blockMessage = document.getElementById('blockMessage');
const blockCount = document.getElementById('blockCount');
const tourOverlay = document.getElementById('tour');
const tourTitle = document.getElementById('tourTitle');
const tourBody = document.getElementById('tourBody');
const tourProgress = document.getElementById('tourProgress');
const tourNext = document.getElementById('tourNext');
const tourSkip = document.getElementById('tourSkip');
const tourReplay = document.getElementById('tourReplay');
const allowUpload = document.getElementById('allowUpload');
const allowExport = document.getElementById('allowExport');
const allowFileInput = document.getElementById('allowFileInput');
const blockUpload = document.getElementById('blockUpload');
const exportBlocklist = document.getElementById('exportBlocklist');
const blockFileInput = document.getElementById('blockFileInput');
const siteToggle = document.getElementById('siteToggle');
const siteHostLabel = document.getElementById('siteHost');
const metricAllowed = document.getElementById('metricAllowed');
const metricBlocked = document.getElementById('metricBlocked');
const requirePinEl = document.getElementById('requirePin');
const pinControls = document.getElementById('pinControls');
const pinMessage = document.getElementById('pinMessage');
const pinUpdateBtn = document.getElementById('pinUpdate');
const pinRemoveBtn = document.getElementById('pinRemove');

const TOUR_KEY = 'onboardingComplete';
const TOUR_STEPS = [
  {
    target: document.getElementById('cardProtection'),
    title: 'Enable core protection',
    body: 'Use the master toggle and aggressive mode to decide how Safeguard protects each site.'
  },
  {
    target: document.getElementById('cardAllowlist'),
    title: 'Allow trusted domains',
    body: 'Add internal portals or education sites to the allowlist so they bypass filtering.'
  },
  {
    target: document.getElementById('cardBlocklist'),
    title: 'Import policy blocklists',
    body: 'Paste domains or import exports from your policy team to block them across every user.'
  }
];

const PIN_SALT_BYTES = 16;
const PIN_ITERATIONS = 200000;

let tourIndex = 0;
let tourActive = false;
let currentAllowlist = [];
let currentBlocklist = [];
let currentHost = null;
let storedPin = null;

function setStatus(enabled){
  if (!statusBadge) return;
  statusBadge.textContent = enabled ? 'Active' : 'Paused';
  statusBadge.classList.toggle('status--off', !enabled);
}

function updateSensitivityDisplay(value){
  if (sensitivityValue) sensitivityValue.textContent = String(value);
}

function setAllowMessage(text, tone = 'muted'){
  if (!allowMessage) return;
  allowMessage.textContent = text;
  allowMessage.classList.remove('message--success', 'message--error');
  if (tone === 'success') allowMessage.classList.add('message--success');
  else if (tone === 'error') allowMessage.classList.add('message--error');
}

function setBlockMessage(text, tone = 'muted'){
  if (!blockMessage) return;
  blockMessage.textContent = text;
  blockMessage.classList.remove('message--success', 'message--error');
  if (tone === 'success') blockMessage.classList.add('message--success');
  else if (tone === 'error') blockMessage.classList.add('message--error');
}

function setPinMessage(text, tone = 'muted'){
  if (!pinMessage) return;
  pinMessage.textContent = text;
  pinMessage.classList.remove('message--success', 'message--error');
  if (tone === 'success') pinMessage.classList.add('message--success');
  else if (tone === 'error') pinMessage.classList.add('message--error');
}

function bufferToBase64(buffer){
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((b)=>{ binary += String.fromCharCode(b); });
  return btoa(binary);
}

function base64ToUint8Array(base64){
  if (!base64) return null;
  try {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1){
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch(_e){
    return null;
  }
}

async function derivePinHash(pin, reuse = {}){
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(pin), { name: 'PBKDF2' }, false, ['deriveBits']);
  let saltArray = base64ToUint8Array(reuse.salt);
  if (!saltArray){
    saltArray = new Uint8Array(PIN_SALT_BYTES);
    crypto.getRandomValues(saltArray);
  }
  const iterations = Number(reuse.iterations) > 10000 ? Number(reuse.iterations) : PIN_ITERATIONS;
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    salt: saltArray.buffer,
    iterations,
    hash: 'SHA-256'
  }, keyMaterial, 256);
  return {
    hash: bufferToBase64(bits),
    salt: bufferToBase64(saltArray.buffer),
    iterations
  };
}

async function verifyPinInput(value, stored){
  if (!stored || !stored.hash || !stored.salt) return false;
  const result = await derivePinHash(value, { salt: stored.salt, iterations: stored.iterations });
  return result.hash === stored.hash;
}

function syncPinControls(){
  if (!pinControls) return;
  pinControls.classList.add('pin-controls--visible');
  const hasPin = Boolean(storedPin && storedPin.hash && storedPin.salt);
  if (pinUpdateBtn) pinUpdateBtn.textContent = hasPin ? 'Change PIN' : 'Set PIN';
  if (pinRemoveBtn){
    pinRemoveBtn.hidden = !hasPin;
    pinRemoveBtn.disabled = !hasPin;
  }
}

async function promptForNewPin(){
  const first = window.prompt('Enter a new PIN (4-8 digits)');
  if (first === null) return null;
  const primary = first.trim();
  if (!/^\d{4,8}$/.test(primary)){
    setPinMessage('PIN must be 4-8 digits.', 'error');
    return null;
  }
  const second = window.prompt('Confirm the new PIN');
  if (second === null){
    setPinMessage('PIN setup cancelled.', 'muted');
    return null;
  }
  const confirm = second.trim();
  if (primary !== confirm){
    setPinMessage('PIN entries did not match.', 'error');
    return null;
  }
  const hashed = await derivePinHash(primary);
  return hashed;
}

async function requestPinConfirmation(message){
  if (!storedPin) return { ok: false, cancelled: true };
  const attempt = window.prompt(message || 'Enter your PIN to continue');
  if (attempt === null) return { ok: false, cancelled: true };
  const value = attempt.trim();
  if (!value){
    setPinMessage('PIN cannot be empty.', 'error');
    return { ok: false, cancelled: false };
  }
  const valid = await verifyPinInput(value, storedPin);
  if (!valid){
    setPinMessage('Incorrect PIN.', 'error');
    return { ok: false, cancelled: false };
  }
  return { ok: true, cancelled: false };
}

function clearHighlights(){
  document.querySelectorAll('.tour-highlight').forEach((el)=>el.classList.remove('tour-highlight'));
}

function renderTourStep(index){
  if (!tourOverlay) return;
  const step = TOUR_STEPS[index];
  if (!step){
    endTour(true);
    return;
  }
  clearHighlights();
  if (step.target) step.target.classList.add('tour-highlight');
  if (tourTitle) tourTitle.textContent = step.title;
  if (tourBody) tourBody.textContent = step.body;
  if (tourProgress) tourProgress.textContent = `Step ${index + 1} of ${TOUR_STEPS.length}`;
  if (tourNext) tourNext.textContent = index === TOUR_STEPS.length - 1 ? 'Finish' : 'Next';
}

function startTour(){
  if (!tourOverlay) return;
  tourActive = true;
  tourIndex = 0;
  tourOverlay.classList.remove('tour--hidden');
  renderTourStep(tourIndex);
}

function endTour(completed){
  clearHighlights();
  if (tourOverlay) tourOverlay.classList.add('tour--hidden');
  tourActive = false;
  if (completed){
    chrome.storage.sync.set({ [TOUR_KEY]: true });
  }
}

function render(list){
  currentAllowlist = Array.isArray(list) ? [...list] : [];
  allowList.innerHTML = '';
  (list||[]).forEach((host, idx)=>{
    const li = document.createElement('li');
    li.className = 'pill';
    const label = document.createElement('span');
    label.textContent = host;
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'pill__remove';
    rm.textContent = '×';
    rm.onclick = ()=>{
      const next = list.slice(0, idx).concat(list.slice(idx + 1));
      chrome.storage.sync.set({ allowlist: next }, ()=>{
        render(next);
        setAllowMessage(next.length ? 'Allowlisted domains' : 'Enter hostnames without http/https.');
      });
    };
    li.appendChild(label);
    li.appendChild(rm);
    allowList.appendChild(li);
  });
  clearAllow.disabled = !(list && list.length);
  updateMetrics();
  updateSiteToggle();
}

function normalizeHost(raw){
  let s = (raw||'').trim().toLowerCase();
  s = s.replace(/^https?:\/\//,'').replace(/^www\./,'').replace(/\/.*$/,'');
  return s;
}

function validHostname(s){
  // letters, digits, dashes + dots, 1–253 chars, no spaces
  if(!s || s.length>253 || /\s/.test(s)) return false;
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(s);
}

chrome.storage.sync.get({enabled:true, allowlist:[], aggressive:false, sensitivity:60, [TOUR_KEY]: false}, (cfg)=>{
  enabledEl.checked = cfg.enabled;
  setStatus(Boolean(cfg.enabled));
  render(cfg.allowlist||[]);
  setAllowMessage((cfg.allowlist && cfg.allowlist.length) ? 'Allowlisted domains' : 'Enter hostnames without http/https.');
  aggressiveEl.checked = Boolean(cfg.aggressive);
  if (typeof cfg.sensitivity === 'number'){
    sensitivityEl.value = String(cfg.sensitivity);
    updateSensitivityDisplay(cfg.sensitivity);
  }
  if (!cfg[TOUR_KEY]){
    startTour();
  }
});
chrome.storage.local.get({
  userBlocklist: [],
  requirePin: false,
  overridePinHash: null,
  overridePinSalt: null,
  overridePinIterations: 0
}, (cfg)=>{
  const list = Array.isArray(cfg.userBlocklist) ? cfg.userBlocklist : [];
  currentBlocklist = [...list];
  updateBlockCount(list.length);
  updateMetrics();

  storedPin = (cfg.overridePinHash && cfg.overridePinSalt) ? {
    hash: cfg.overridePinHash,
    salt: cfg.overridePinSalt,
    iterations: Number(cfg.overridePinIterations) || PIN_ITERATIONS
  } : null;

  if (requirePinEl){
    const shouldEnable = Boolean(cfg.requirePin && storedPin);
    requirePinEl.checked = shouldEnable;
    if (cfg.requirePin && !storedPin){
      chrome.storage.local.set({ requirePin: false });
    }
  }
  syncPinControls();
  if (storedPin){
    setPinMessage((requirePinEl && requirePinEl.checked) ? 'PIN required for overrides.' : 'PIN saved. Toggle on when you need it.');
  } else {
    setPinMessage('Set a PIN to guard overrides. Nothing leaves this device.', 'muted');
  }
  if (pinControls) pinControls.classList.add('pin-controls--visible');
});

enabledEl.addEventListener('change', async ()=>{
  const enabled = enabledEl.checked;
  setStatus(enabled);
  chrome.storage.sync.set({enabled});
});

aggressiveEl.addEventListener('change', ()=>{
  chrome.storage.sync.set({ aggressive: aggressiveEl.checked });
});

sensitivityEl.addEventListener('input', ()=>{
  const v = Math.max(10, Math.min(100, Number(sensitivityEl.value)||60));
  chrome.storage.sync.set({ sensitivity: v });
  updateSensitivityDisplay(v);
});

if (requirePinEl){
  requirePinEl.addEventListener('change', async ()=>{
    const wantsEnable = requirePinEl.checked;
    if (wantsEnable){
      if (!storedPin){
        const newPin = await promptForNewPin();
        if (!newPin){
          requirePinEl.checked = false;
          syncPinControls();
          return;
        }
        storedPin = newPin;
        chrome.storage.local.set({
          overridePinHash: newPin.hash,
          overridePinSalt: newPin.salt,
          overridePinIterations: newPin.iterations,
          requirePin: true
        }, ()=>{
          syncPinControls();
          setPinMessage('PIN required for overrides.', 'success');
        });
      } else {
        chrome.storage.local.set({ requirePin: true }, ()=>{
          setPinMessage('PIN required for overrides.', 'success');
        });
        syncPinControls();
      }
    } else {
      const { ok } = await requestPinConfirmation('Enter your PIN to disable override protection');
      if (!ok){
        requirePinEl.checked = true;
        syncPinControls();
        return;
      }
      chrome.storage.local.set({ requirePin: false }, ()=>{
        setPinMessage('PIN saved, but overrides are unlocked until you re-enable.', 'muted');
        syncPinControls();
      });
    }
  });
}

if (pinUpdateBtn){
  pinUpdateBtn.addEventListener('click', async ()=>{
    if (storedPin){
      const { ok } = await requestPinConfirmation('Enter your current PIN to change it');
      if (!ok) return;
    }
    const newPin = await promptForNewPin();
    if (!newPin) return;
    storedPin = newPin;
    const payload = {
      overridePinHash: newPin.hash,
      overridePinSalt: newPin.salt,
      overridePinIterations: newPin.iterations
    };
    if (requirePinEl && requirePinEl.checked){
      payload.requirePin = true;
    }
    chrome.storage.local.set(payload, ()=>{
      syncPinControls();
      setPinMessage((requirePinEl && requirePinEl.checked) ? 'PIN updated.' : 'PIN updated. Toggle on override protection when you need it.', 'success');
    });
  });
}

if (pinRemoveBtn){
  pinRemoveBtn.addEventListener('click', async ()=>{
    if (!storedPin){
      setPinMessage('No PIN saved yet.', 'muted');
      return;
    }
    const { ok } = await requestPinConfirmation('Enter your PIN to remove it');
    if (!ok) return;
    storedPin = null;
    if (requirePinEl) requirePinEl.checked = false;
    chrome.storage.local.set({
      overridePinHash: null,
      overridePinSalt: null,
      overridePinIterations: 0,
      requirePin: false
    }, ()=>{
      syncPinControls();
      setPinMessage('PIN removed. Manual overrides are unprotected.', 'success');
    });
  });
}

addAllow.addEventListener('click', async ()=>{
  const host = normalizeHost(allowHost.value);
  if(!validHostname(host)){
    setAllowMessage('Invalid hostname. Use a format like example.com.', 'error');
    return;
  }
  chrome.storage.sync.get({allowlist:[]}, (cfg)=>{
    const set = new Set(cfg.allowlist||[]);
    set.add(host);
    const next = Array.from(set);
    chrome.storage.sync.set({allowlist: next}, ()=>{
      allowHost.value='';
      setAllowMessage('Allowlisted domains');
      render(next);
    });
  });
});

clearAllow.addEventListener('click', async ()=>{
  chrome.storage.sync.set({allowlist: []}, ()=>{
    render([]);
    setAllowMessage('Allowlist cleared. Enter hostnames without http/https.','muted');
  });
});

// ----- Domain list helpers -----
function parseDomainList(text){
  const out = [];
  const seen = new Set();
  (text||'').split(/\r?\n/).forEach(line=>{
    const t = normalizeHost(line.replace(/^#.*$/,'').trim());
    if(!t) return;
    if(!validHostname(t)) return;
    if(!seen.has(t)) { seen.add(t); out.push(t); }
  });
  return out;
}

function sanitizeDomains(domains){
  const out = [];
  const seen = new Set();
  (Array.isArray(domains) ? domains : []).forEach((item)=>{
    const host = normalizeHost(String(item||''));
    if (!host) return;
    if (!validHostname(host)) return;
    if (seen.has(host)) return;
    seen.add(host);
    out.push(host);
  });
  return out;
}

function parseDomainJson(text, key){
  try {
    const data = JSON.parse(text);
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data[key])) return data[key];
    return [];
  } catch(_e){
    return null;
  }
}

function downloadJson(filename, payload){
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function updateMetrics(){
  if (metricAllowed) metricAllowed.textContent = String(currentAllowlist.length);
  if (metricBlocked) metricBlocked.textContent = String(currentBlocklist.length);
}

function extractHost(url){
  try {
    return new URL(url).hostname.replace(/^www\./,'').toLowerCase();
  } catch(_e){
    return null;
  }
}

function updateSiteToggle(){
  if (!siteToggle || !siteHostLabel){
    return;
  }
  if (!currentHost){
    siteToggle.checked = false;
    siteToggle.disabled = true;
    siteHostLabel.textContent = 'this domain';
    return;
  }
  siteHostLabel.textContent = currentHost;
  siteToggle.disabled = false;
  const allowed = currentAllowlist.includes(currentHost);
  siteToggle.checked = allowed;
}

function initActiveHost(){
  if (!chrome.tabs || !siteToggle) return;
  try {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs)=>{
      if (chrome.runtime.lastError){
        currentHost = null;
        updateSiteToggle();
        return;
      }
      const tab = tabs && tabs[0];
      currentHost = tab ? extractHost(tab.url) : null;
      updateSiteToggle();
    });
  } catch (_e) {
    currentHost = null;
    updateSiteToggle();
  }
}

initActiveHost();
function updateBlockCount(n){
  if (blockCount) blockCount.textContent = `${n} domain${n===1?'':'s'}`;
}

importBlocklist.addEventListener('click', ()=>{
  const list = parseDomainList(blocklistInput.value);
  chrome.storage.local.set({ userBlocklist: list }, ()=>{
    currentBlocklist = [...list];
    updateBlockCount(list.length);
    setBlockMessage(`Imported ${list.length} domain${list.length===1?'':'s'}.`, 'success');
    setTimeout(()=>{ setBlockMessage('Paste or import domains to replace the current list.'); }, 2500);
    updateMetrics();
  });
});

clearBlocklist.addEventListener('click', ()=>{
  chrome.storage.local.set({ userBlocklist: [] }, ()=>{
    currentBlocklist = [];
    updateBlockCount(0);
    setBlockMessage('Blocklist cleared.', 'muted');
    updateMetrics();
  });
});

if (siteToggle){
  siteToggle.addEventListener('change', ()=>{
    if (!currentHost) return;
    chrome.storage.sync.get({ allowlist: [] }, (cfg)=>{
      const set = new Set(Array.isArray(cfg.allowlist) ? cfg.allowlist : []);
      let message;
      let tone = 'success';
      if (siteToggle.checked){
        set.add(currentHost);
        message = `${currentHost} added to allowlist.`;
      } else {
        set.delete(currentHost);
        message = `${currentHost} removed from allowlist.`;
        tone = 'muted';
      }
      const next = Array.from(set);
      chrome.storage.sync.set({ allowlist: next }, ()=>{
        render(next);
        setAllowMessage(message, tone);
      });
    });
  });
}

if (allowExport){
  allowExport.addEventListener('click', ()=>{
    if (!currentAllowlist.length){
      setAllowMessage('Allowlist is empty.', 'muted');
      return;
    }
    downloadJson(`safeguard-allowlist-${new Date().toISOString().slice(0,10)}.json`, {
      exportedAt: new Date().toISOString(),
      type: 'allowlist',
      domains: currentAllowlist
    });
    setAllowMessage(`Downloaded ${currentAllowlist.length} domain${currentAllowlist.length===1?'':'s'}.`, 'success');
  });
}

if (exportBlocklist){
  exportBlocklist.addEventListener('click', ()=>{
    if (!currentBlocklist.length){
      setBlockMessage('Blocklist is empty.', 'muted');
      return;
    }
    downloadJson(`safeguard-blocklist-${new Date().toISOString().slice(0,10)}.json`, {
      exportedAt: new Date().toISOString(),
      type: 'blocklist',
      domains: currentBlocklist
    });
    setBlockMessage(`Downloaded ${currentBlocklist.length} domain${currentBlocklist.length===1?'':'s'}.`, 'success');
  });
}

if (allowUpload && allowFileInput){
  allowUpload.addEventListener('click', ()=>{
    allowFileInput.value = '';
    allowFileInput.click();
  });
  allowFileInput.addEventListener('change', (event)=>{
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ()=>{
      const text = String(reader.result || '');
      const ext = file.name.toLowerCase();
      let domains = [];
      if (ext.endsWith('.json')){
        const jsonList = parseDomainJson(text, 'allowlist');
        domains = sanitizeDomains(jsonList);
      }
      if (!domains.length){
        domains = parseDomainList(text.replace(/,/g, '\n'));
      }
      if (!domains.length){
        setAllowMessage('No valid domains found in file.', 'error');
        return;
      }
      chrome.storage.sync.set({ allowlist: domains }, ()=>{
        render(domains);
        setAllowMessage(`Uploaded ${domains.length} domain${domains.length===1?'':'s'} from file.`, 'success');
      });
    };
    reader.onerror = ()=>{
      setAllowMessage('Failed to read file.', 'error');
    };
    reader.readAsText(file);
  });
}

if (blockUpload && blockFileInput){
  blockUpload.addEventListener('click', ()=>{
    blockFileInput.value = '';
    blockFileInput.click();
  });
  blockFileInput.addEventListener('change', (event)=>{
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ()=>{
      const text = String(reader.result || '');
      const ext = file.name.toLowerCase();
      let domains = [];
      if (ext.endsWith('.json')){
        const jsonList = parseDomainJson(text, 'blocklist');
        domains = sanitizeDomains(jsonList);
      }
      if (!domains.length){
        domains = parseDomainList(text.replace(/,/g, '\n'));
      }
      if (!domains.length){
        setBlockMessage('No valid domains found in file.', 'error');
        return;
      }
      chrome.storage.local.set({ userBlocklist: domains }, ()=>{
        currentBlocklist = [...domains];
        updateBlockCount(domains.length);
        setBlockMessage(`Uploaded ${domains.length} domain${domains.length===1?'':'s'} from file.`, 'success');
        updateMetrics();
      });
    };
    reader.onerror = ()=>{
      setBlockMessage('Failed to read file.', 'error');
    };
    reader.readAsText(file);
  });
}

if (tourNext){
  tourNext.addEventListener('click', ()=>{
    if (!tourActive) return;
    if (tourIndex >= TOUR_STEPS.length - 1){
      endTour(true);
    } else {
      tourIndex += 1;
      renderTourStep(tourIndex);
    }
  });
}

if (tourSkip){
  tourSkip.addEventListener('click', ()=>{
    if (!tourActive) return;
    endTour(true);
  });
}

if (tourReplay){
  tourReplay.addEventListener('click', ()=>{
    chrome.storage.sync.set({ [TOUR_KEY]: false }, ()=>{
      startTour();
    });
  });
}
