const enabledEl = document.getElementById('enabled');
const allowHost = document.getElementById('allowHost');
const addAllow = document.getElementById('addAllow');
const clearAllow = document.getElementById('clearAllow');
const allowList = document.getElementById('allowList');
const hint = document.getElementById('hint');
const aggressiveEl = document.getElementById('aggressive');
const sensitivityEl = document.getElementById('sensitivity');
const blocklistInput = document.getElementById('blocklistInput');
const importBlocklist = document.getElementById('importBlocklist');
const clearBlocklist = document.getElementById('clearBlocklist');
const blockCount = document.getElementById('blockCount');
// PIN removed — simplified UI

function render(list){
  allowList.innerHTML = '';
  (list||[]).forEach((h, idx)=>{
    const li = document.createElement('li');
    li.textContent = h + ' ';
    const rm = document.createElement('button');
    rm.textContent = '×';
    rm.onclick = async ()=>{
      const next = list.slice(0, idx).concat(list.slice(idx+1));
      chrome.storage.sync.set({allowlist: next}, ()=>render(next));
    };
    li.appendChild(rm);
    allowList.appendChild(li);
  });
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

chrome.storage.sync.get({enabled:true, allowlist:[], aggressive:false, sensitivity:60}, (cfg)=>{
  enabledEl.checked = cfg.enabled;
  render(cfg.allowlist||[]);
  aggressiveEl.checked = Boolean(cfg.aggressive);
  if (typeof cfg.sensitivity === 'number') sensitivityEl.value = String(cfg.sensitivity);
});
chrome.storage.local.get({userBlocklist:[]}, (cfg)=>{
  updateBlockCount(Array.isArray(cfg.userBlocklist)? cfg.userBlocklist.length : 0);
});

enabledEl.addEventListener('change', async ()=>{
  chrome.storage.sync.set({enabled: enabledEl.checked});
});

aggressiveEl.addEventListener('change', ()=>{
  chrome.storage.sync.set({ aggressive: aggressiveEl.checked });
});

sensitivityEl.addEventListener('input', ()=>{
  const v = Math.max(10, Math.min(100, Number(sensitivityEl.value)||60));
  chrome.storage.sync.set({ sensitivity: v });
});

addAllow.addEventListener('click', async ()=>{
  const host = normalizeHost(allowHost.value);
  if(!validHostname(host)){
    hint.style.color = '#a00';
    hint.textContent = 'invalid hostname — use e.g. example.com';
    return;
  }
  chrome.storage.sync.get({allowlist:[]}, (cfg)=>{
    const set = new Set(cfg.allowlist||[]);
    set.add(host);
    const next = Array.from(set);
    chrome.storage.sync.set({allowlist: next}, ()=>{
      allowHost.value=''; hint.style.color='#666'; hint.textContent='enter a hostname only (no http/https)';
      render(next);
    });
  });
});

clearAllow.addEventListener('click', async ()=>{
  chrome.storage.sync.set({allowlist: []}, ()=>render([]));
});

// ----- Blocklist import (local storage) -----
function parseBlocklist(text){
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
function updateBlockCount(n){
  if (blockCount) blockCount.textContent = `${n} domain${n===1?'':'s'}`;
}

importBlocklist.addEventListener('click', ()=>{
  const list = parseBlocklist(blocklistInput.value);
  chrome.storage.local.set({ userBlocklist: list }, ()=>{
    updateBlockCount(list.length);
    hint.style.color = '#166534';
    hint.textContent = `Imported ${list.length} domains`;
    setTimeout(()=>{ hint.style.color='#666'; hint.textContent='enter a hostname only (no http/https)'; }, 2500);
  });
});

clearBlocklist.addEventListener('click', ()=>{
  chrome.storage.local.set({ userBlocklist: [] }, ()=>{
    updateBlockCount(0);
  });
});
