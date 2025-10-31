chrome.runtime.onInstalled.addListener(()=>{
  console.log('Safeguard installed');
  initBadge();
  rebuildDynamicRules();
});

function setBadge(enabled){
  const text = enabled ? 'ON' : '';
  try {
    chrome.action.setBadgeText({ text });
    if (enabled) chrome.action.setBadgeBackgroundColor({ color: '#16a34a' }); // green
  } catch(_e) {}
}

async function initBadge(){
  const { enabled = true } = await new Promise(r => chrome.storage.sync.get({ enabled: true }, r));
  setBadge(enabled);
}

chrome.storage.onChanged.addListener((changes, area)=>{
  if (area === 'sync'){
    if (Object.prototype.hasOwnProperty.call(changes, 'enabled')){
      setBadge(Boolean(changes.enabled.newValue));
    }
    if (Object.prototype.hasOwnProperty.call(changes, 'allowlist')){
      rebuildDynamicRules();
    }
  }
  if (area === 'local'){
    if (Object.prototype.hasOwnProperty.call(changes, 'userBlocklist')){
      rebuildDynamicRules();
    }
  }
});

// Also set badge when the service worker starts
initBadge();
// Rebuild dynamic rules on service worker start to ensure rules are present
try { rebuildDynamicRules(); } catch(_e) {}

// ---- DNR dynamic rules (blocklist + allowlist) ----
async function loadJsonResource(path){
  try{
    const url = chrome.runtime.getURL(path);
    const res = await fetch(url);
    if(!res.ok) return null;
    return await res.json();
  }catch(_e){ return null; }
}

function domainToRegex(domain){
  // Match domain and all subdomains, http/https
  const esc = domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return `^https?://([a-z0-9-]+\\.)*${esc}(/|$)`;
}

async function rebuildDynamicRules(){
  try{
    const cfg = await new Promise(r => chrome.storage.sync.get({ allowlist: [] }, r));
    const allowlist = Array.isArray(cfg.allowlist) ? cfg.allowlist : [];
    const local = await new Promise(r => chrome.storage.local.get({ userBlocklist: [] }, r));
    const userBlocklist = Array.isArray(local.userBlocklist) ? local.userBlocklist : [];
    const block = await loadJsonResource('data/blocklist.json');
    const blockDomains = (block && Array.isArray(block.domains)) ? block.domains : [];

    let id = 20000; // dynamic IDs start here
    const rules = [];

    // Allow rules take precedence via higher priority
    for(const d of allowlist){
      const rx = domainToRegex(String(d).trim().toLowerCase());
      rules.push({
        id: id++,
        priority: 10000,
        action: { type: 'allow' },
        condition: { regexFilter: rx, resourceTypes: ['main_frame'] }
      });
    }

    // Block rules for domains: packaged + user list (truncated to fit DNR limits)
    const MAX_DYNAMIC = 29000; // conservative safety margin under Chrome's dynamic rule cap
    const uniq = Array.from(new Set([ ...blockDomains, ...userBlocklist ]))
      .map(s => String(s).trim().toLowerCase())
      .filter(Boolean);
    const room = MAX_DYNAMIC - rules.length - 100; // reserve a small buffer
    const take = room > 0 ? uniq.slice(0, room) : [];
    for(const d of take){
      const rx = domainToRegex(d);
      rules.push({
        id: id++,
        priority: 10,
        action: { type: 'block' },
        condition: { regexFilter: rx, resourceTypes: ['main_frame'] }
      });
    }
    if (uniq.length > take.length){
      console.warn('[Safeguard] Blocklist truncated for DNR capacity:', take.length, '/', uniq.length);
    }

    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = existing.map(r => r.id);
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules: rules });
    console.log('[Safeguard] DNR dynamic rules updated:', rules.length);
  }catch(e){
    console.error('[Safeguard] Failed to rebuild DNR rules', e);
  }
}
