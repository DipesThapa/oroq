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

let tourIndex = 0;
let tourActive = false;
let currentAllowlist = [];
let currentBlocklist = [];
let currentHost = null;

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
chrome.storage.local.get({userBlocklist:[]}, (cfg)=>{
  const list = Array.isArray(cfg.userBlocklist) ? cfg.userBlocklist : [];
  currentBlocklist = [...list];
  updateBlockCount(list.length);
  updateMetrics();
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
