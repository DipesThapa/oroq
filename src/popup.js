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
const profileListEl = document.getElementById('profileList');
const profileMessageEl = document.getElementById('profileMessage');
const profileApplyBtn = document.getElementById('profileApply');
const profileResetBtn = document.getElementById('profileReset');
const profileDetailsEl = document.getElementById('profileDetails');
const profileDescriptionEl = document.getElementById('profileDescription');
const profileSummaryEl = document.getElementById('profileSummary');
const siteToggle = document.getElementById('siteToggle');
const siteHostLabel = document.getElementById('siteHost');
const metricAllowed = document.getElementById('metricAllowed');
const metricBlocked = document.getElementById('metricBlocked');
const requirePinEl = document.getElementById('requirePin');
const pinControls = document.getElementById('pinControls');
const pinMessage = document.getElementById('pinMessage');
const pinUpdateBtn = document.getElementById('pinUpdate');
const pinRemoveBtn = document.getElementById('pinRemove');
const overrideListEl = document.getElementById('overrideList');
const overrideMessageEl = document.getElementById('overrideMessage');
const overrideExportBtn = document.getElementById('overrideExport');
const overrideClearBtn = document.getElementById('overrideClear');
const sectionSelect = document.getElementById('sectionSelect');
const digestDownloadBtn = document.getElementById('digestDownload');
const digestMessageEl = document.getElementById('digestMessage');
const alertEnabledEl = document.getElementById('alertEnabled');
const alertWebhookInput = document.getElementById('alertWebhook');
const alertSaveBtn = document.getElementById('alertSave');
const alertMessageEl = document.getElementById('alertMessage');
const approverPromptEnabledEl = document.getElementById('approverPromptEnabled');
const approverMessageEl = document.getElementById('approverMessage');
const SECTION_IDS = ['cardProtection', 'cardProfiles', 'cardAllowlist', 'cardBlocklist', 'cardOverrides', 'cardReports', 'cardApprover'];

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
let currentOverrideLog = [];
let availableProfiles = [];
let selectedProfileId = null;
let appliedProfileId = null;
let currentSensitivity = 60;
let currentAggressive = false;
let overrideAlertsEnabled = false;
let overrideAlertWebhook = '';
let approverPromptEnabled = false;

if (profileApplyBtn) profileApplyBtn.disabled = true;
if (profileDetailsEl) profileDetailsEl.hidden = true;
setProfileMessage('Select a profile to preview recommended settings.', 'muted');

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

function setOverrideMessage(text, tone = 'muted'){
  if (!overrideMessageEl) return;
  overrideMessageEl.textContent = text;
  overrideMessageEl.classList.remove('message--success', 'message--error');
  if (tone === 'success') overrideMessageEl.classList.add('message--success');
  else if (tone === 'error') overrideMessageEl.classList.add('message--error');
}

function setProfileMessage(text, tone = 'muted'){
  if (!profileMessageEl) return;
  profileMessageEl.textContent = text;
  profileMessageEl.classList.remove('message--success', 'message--error');
  if (tone === 'success') profileMessageEl.classList.add('message--success');
  else if (tone === 'error') profileMessageEl.classList.add('message--error');
}

function setDigestMessage(text, tone = 'muted'){
  if (!digestMessageEl) return;
  digestMessageEl.textContent = text;
  digestMessageEl.classList.remove('message--success', 'message--error');
  if (tone === 'success') digestMessageEl.classList.add('message--success');
  else if (tone === 'error') digestMessageEl.classList.add('message--error');
}

function setAlertMessage(text, tone = 'muted'){
  if (!alertMessageEl) return;
  alertMessageEl.textContent = text;
  alertMessageEl.classList.remove('message--success', 'message--error');
  if (tone === 'success') alertMessageEl.classList.add('message--success');
  else if (tone === 'error') alertMessageEl.classList.add('message--error');
}

function setApproverMessage(text, tone = 'muted'){
  if (!approverMessageEl) return;
  approverMessageEl.textContent = text;
  approverMessageEl.classList.remove('message--success', 'message--error');
  if (tone === 'success') approverMessageEl.classList.add('message--success');
  else if (tone === 'error') approverMessageEl.classList.add('message--error');
}

function showSection(sectionId){
  SECTION_IDS.forEach((id)=>{
    const el = document.getElementById(id);
    if (!el) return;
    if (id === sectionId){
      el.removeAttribute('hidden');
    } else {
      el.setAttribute('hidden', 'hidden');
    }
  });
}

if (sectionSelect){
  sectionSelect.addEventListener('change', ()=>{
    showSection(sectionSelect.value);
  });
  if (!sectionSelect.value){
    sectionSelect.value = SECTION_IDS[0];
  }
  showSection(sectionSelect.value);
} else {
  showSection(SECTION_IDS[0]);
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

async function ensureAllowlistPin(actionLabel){
  if (!requirePinEl || !requirePinEl.checked) return true;
  if (!storedPin){
    const notice = 'Enable PIN protection to lock allowlist edits.';
    setAllowMessage(notice, 'error');
    setPinMessage(notice, 'error');
    return false;
  }
  const label = actionLabel || 'continue';
  const { ok, cancelled } = await requestPinConfirmation(`Enter your PIN to ${label}`);
  if (!ok){
    if (cancelled){
      setAllowMessage('Action cancelled.', 'muted');
    } else {
      setAllowMessage('Incorrect PIN.', 'error');
    }
    return false;
  }
  return true;
}

async function ensureLogPin(actionLabel){
  if (!requirePinEl || !requirePinEl.checked) return true;
  if (!storedPin){
    const notice = 'Enable PIN protection to manage override logs.';
    setOverrideMessage(notice, 'error');
    setPinMessage(notice, 'error');
    return false;
  }
  const label = actionLabel || 'continue';
  const { ok, cancelled } = await requestPinConfirmation(`Enter your PIN to ${label}`);
  if (!ok){
    if (cancelled){
      setOverrideMessage('Action cancelled.', 'muted');
    } else {
      setOverrideMessage('Incorrect PIN.', 'error');
    }
    return false;
  }
  return true;
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
    rm.onclick = async ()=>{
      if (!(await ensureAllowlistPin(`remove ${host} from the allowlist`))) return;
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

function renderOverrideLog(list){
  currentOverrideLog = Array.isArray(list) ? [...list] : [];
  if (!overrideListEl){
    return;
  }
  overrideListEl.innerHTML = '';
  if (!currentOverrideLog.length){
    setOverrideMessage('No overrides recorded yet.', 'muted');
    return;
  }
  const reversed = [...currentOverrideLog].reverse();
  reversed.forEach((entry)=>{
    if (!entry || typeof entry !== 'object') return;
    const li = document.createElement('li');
    li.className = 'log-item';
    const top = document.createElement('div');
    top.className = 'log-item__top';
    const host = document.createElement('span');
    host.className = 'log-item__host';
    host.textContent = entry.host || '(unknown)';
    if (entry.approver){
      const approver = document.createElement('span');
      approver.textContent = entry.approver;
      approver.style.fontWeight = '600';
      approver.style.fontSize = '11px';
      approver.style.color = '#16a34a';
      host.appendChild(document.createTextNode(' · '));
      host.appendChild(approver);
    }
    const ts = document.createElement('span');
    ts.textContent = formatTimestamp(entry.timestamp);
    top.appendChild(host);
    top.appendChild(ts);
    li.appendChild(top);
    const reason = document.createElement('p');
    reason.className = 'log-item__reason';
    reason.textContent = entry.reason ? entry.reason : '(no reason captured)';
    li.appendChild(reason);
    if (entry.url){
      const url = document.createElement('span');
      url.className = 'log-item__url';
      url.textContent = entry.url;
      li.appendChild(url);
    }
    overrideListEl.appendChild(li);
  });
  setOverrideMessage(`Logged ${currentOverrideLog.length} override${currentOverrideLog.length === 1 ? '' : 's'}.`, 'muted');
}

function formatTimestamp(value){
  if (!value) return '';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  } catch(_e){
    return '';
  }
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

function findProfile(id){
  return availableProfiles.find((profile)=>profile && profile.id === id) || null;
}

function renderProfileOptions(){
  if (!profileListEl) return;
  profileListEl.innerHTML = '';
  availableProfiles.forEach((profile)=>{
    if (!profile || !profile.id) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'profile-pill';
    if (profile.id === selectedProfileId) btn.classList.add('profile-pill--selected');
    if (profile.id === appliedProfileId) btn.classList.add('profile-pill--applied');
    btn.textContent = profile.label || profile.id;
    btn.addEventListener('click', ()=>{
      selectProfile(profile.id);
    });
    profileListEl.appendChild(btn);
  });
}

function updateProfileSummary(profile){
  if (!profileSummaryEl || !profileDetailsEl) return;
  if (!profile){
    profileDetailsEl.hidden = true;
    profileSummaryEl.innerHTML = '';
    if (profileDescriptionEl) profileDescriptionEl.textContent = '';
    return;
  }
  profileDetailsEl.hidden = false;
  if (profileDescriptionEl) profileDescriptionEl.textContent = profile.description || '';
  const items = [
    { label: 'Sensitivity', value: String(profile.sensitivity ?? '—') },
    { label: 'Aggressive mode', value: profile.aggressive ? 'On' : 'Off' },
    { label: 'Allowlist entries', value: String(Array.isArray(profile.allowlist) ? profile.allowlist.length : 0) },
    { label: 'Blocklist entries', value: String(Array.isArray(profile.blocklist) ? profile.blocklist.length : 0) },
    { label: 'PIN required', value: profile.requirePin ? 'Yes' : 'Optional' }
  ];
  profileSummaryEl.innerHTML = '';
  items.forEach((item)=>{
    const row = document.createElement('div');
    row.className = 'profile-summary__item';
    const label = document.createElement('span');
    label.className = 'profile-summary__label';
    label.textContent = item.label;
    const value = document.createElement('span');
    value.className = 'profile-summary__value';
    value.textContent = item.value;
    row.appendChild(label);
    row.appendChild(value);
    profileSummaryEl.appendChild(row);
  });
}

function selectProfile(id){
  selectedProfileId = id;
  const profile = findProfile(id);
  updateProfileSummary(profile);
  if (profileApplyBtn) profileApplyBtn.disabled = !profile;
  if (!profile){
    setProfileMessage('Select a profile to preview recommended settings.', 'muted');
  } else if (profile.id === appliedProfileId){
    setProfileMessage(`"${profile.label || profile.id}" is applied. Reapply to reset any manual tweaks.`, 'muted');
  } else {
    setProfileMessage(`Applying "${profile.label || profile.id}" will overwrite current allow/block lists and sensitivity.`, 'muted');
  }
  renderProfileOptions();
}

function clearProfileSelection(){
  selectedProfileId = null;
  updateProfileSummary(null);
  if (profileApplyBtn) profileApplyBtn.disabled = true;
  renderProfileOptions();
  setProfileMessage('Select a profile to preview recommended settings.', 'muted');
}

function markProfileCustomised(){
  if (!appliedProfileId) return;
  const profile = findProfile(appliedProfileId);
  if (!profile) return;
  selectedProfileId = appliedProfileId;
  updateProfileSummary(profile);
  if (profileApplyBtn) profileApplyBtn.disabled = false;
  renderProfileOptions();
  setProfileMessage(`"${profile.label || profile.id}" applied with custom adjustments.`, 'muted');
}

async function ensureProfilePinAuthorization(actionLabel){
  const label = actionLabel || 'change profiles';
  if (storedPin){
    const { ok, cancelled } = await requestPinConfirmation(`Enter your PIN to ${label}`);
    if (!ok){
      if (cancelled){
        setProfileMessage('Action cancelled.', 'muted');
      } else {
        setProfileMessage('Incorrect PIN.', 'error');
      }
    }
    return ok;
  }
  const newPin = await promptForNewPin();
  if (!newPin){
    setProfileMessage('PIN required to change profiles.', 'error');
    return false;
  }
  storedPin = newPin;
  await new Promise((resolve)=>chrome.storage.local.set({
    overridePinHash: newPin.hash,
    overridePinSalt: newPin.salt,
    overridePinIterations: newPin.iterations
  }, resolve));
  syncPinControls();
  setPinMessage('PIN saved. Toggle override protection when you need it.', 'muted');
  return true;
}

async function ensureAlertPinAuthorization(actionLabel){
  const label = actionLabel || 'change alert settings';
  if (storedPin){
    const { ok, cancelled } = await requestPinConfirmation(`Enter your PIN to ${label}`);
    if (!ok){
      if (cancelled){
        setAlertMessage('Action cancelled.', 'muted');
      } else {
        setAlertMessage('Incorrect PIN.', 'error');
      }
    }
    return ok;
  }
  const newPin = await promptForNewPin();
  if (!newPin){
    setAlertMessage('PIN required to manage alerts.', 'error');
    return false;
  }
  storedPin = newPin;
  await new Promise((resolve)=>chrome.storage.local.set({
    overridePinHash: newPin.hash,
    overridePinSalt: newPin.salt,
    overridePinIterations: newPin.iterations
  }, resolve));
  syncPinControls();
  setPinMessage('PIN saved. Toggle override protection when you need it.', 'muted');
  return true;
}

async function loadProfiles(){
  if (!profileListEl) return;
  try {
    setProfileMessage('Loading profiles…', 'muted');
    const url = chrome.runtime.getURL('data/presets.json');
    const res = await fetch(url);
    if (!res.ok){
      setProfileMessage('Failed to load profiles.', 'error');
      return;
    }
    const data = await res.json();
   const profiles = data && Array.isArray(data.profiles) ? data.profiles : [];
   availableProfiles = profiles.filter((item)=>item && item.id);
   renderProfileOptions();
    if (appliedProfileId && findProfile(appliedProfileId)){
      selectProfile(appliedProfileId);
    } else {
      clearProfileSelection();
    }
  } catch(_e){
    setProfileMessage('Failed to load profiles.', 'error');
  }
}

async function applySelectedProfile(){
  if (!selectedProfileId){
    setProfileMessage('Select a profile first.', 'error');
    return;
  }
  const profile = findProfile(selectedProfileId);
  if (!profile){
    setProfileMessage('Profile not found.', 'error');
    return;
  }
  if (!(await ensureProfilePinAuthorization(`apply the "${profile.label || profile.id}" profile`))){
    return;
  }
  const allowDomains = sanitizeDomains(profile.allowlist || []);
  const blockDomains = sanitizeDomains(profile.blocklist || []);
  await new Promise((resolve)=>chrome.storage.sync.set({
    allowlist: allowDomains,
    sensitivity: profile.sensitivity,
    aggressive: Boolean(profile.aggressive),
    selectedProfileId: profile.id
  }, resolve));
  render(allowDomains);
  setAllowMessage('Allowlisted domains updated from profile.', 'success');
  sensitivityEl.value = String(profile.sensitivity);
  updateSensitivityDisplay(profile.sensitivity);
  aggressiveEl.checked = Boolean(profile.aggressive);
  const requirePinValue = profile.requirePin ? true : Boolean(requirePinEl && requirePinEl.checked && storedPin);
  const localPayload = {
    userBlocklist: blockDomains,
    requirePin: requirePinValue
  };
  await new Promise((resolve)=>chrome.storage.local.set(localPayload, resolve));
  currentBlocklist = [...blockDomains];
  updateBlockCount(blockDomains.length);
  updateMetrics();
  if (blocklistInput) blocklistInput.value = blockDomains.join('\n');
  if (requirePinEl){
    requirePinEl.checked = requirePinValue;
  }
  syncPinControls();
  appliedProfileId = profile.id;
  renderProfileOptions();
  setProfileMessage(`Applied profile "${profile.label || profile.id}".`, 'success');
  updateProfileSummary(profile);
  setTimeout(()=>{
    const applied = findProfile(appliedProfileId);
    if (applied){
      setProfileMessage(`Applied profile: ${applied.label || applied.id}.`, 'muted');
    }
  }, 2500);
}

chrome.storage.sync.get({enabled:true, allowlist:[], aggressive:false, sensitivity:60, selectedProfileId: null, [TOUR_KEY]: false}, (cfg)=>{
  enabledEl.checked = cfg.enabled;
  setStatus(Boolean(cfg.enabled));
  render(cfg.allowlist||[]);
  setAllowMessage((cfg.allowlist && cfg.allowlist.length) ? 'Allowlisted domains' : 'Enter hostnames without http/https.');
  currentAggressive = Boolean(cfg.aggressive);
  aggressiveEl.checked = currentAggressive;
  if (typeof cfg.sensitivity === 'number'){
    currentSensitivity = cfg.sensitivity;
    sensitivityEl.value = String(currentSensitivity);
    updateSensitivityDisplay(currentSensitivity);
  }
  appliedProfileId = cfg.selectedProfileId || null;
  if (!cfg[TOUR_KEY]){
    startTour();
  }
  renderProfileOptions();
});
chrome.storage.local.get({
  userBlocklist: [],
  requirePin: false,
  overridePinHash: null,
  overridePinSalt: null,
  overridePinIterations: 0,
  overrideLog: [],
  overrideAlertEnabled: false,
  overrideAlertWebhook: '',
  approverPromptEnabled: false
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
    setPinMessage((requirePinEl && requirePinEl.checked) ? 'PIN required for overrides and allowlist edits.' : 'PIN saved. Toggle on PIN protection when you need it.');
  } else {
    setPinMessage('Set a PIN to guard overrides and allowlist edits. Nothing leaves this device.', 'muted');
  }
  if (pinControls) pinControls.classList.add('pin-controls--visible');
  renderOverrideLog(Array.isArray(cfg.overrideLog) ? cfg.overrideLog : []);
  overrideAlertsEnabled = Boolean(cfg.overrideAlertEnabled);
  overrideAlertWebhook = typeof cfg.overrideAlertWebhook === 'string' ? cfg.overrideAlertWebhook : '';
  if (alertEnabledEl) alertEnabledEl.checked = overrideAlertsEnabled;
  if (alertWebhookInput) alertWebhookInput.value = overrideAlertWebhook;
  if (overrideAlertsEnabled){
    setAlertMessage('Alerts enabled. Overrides will notify your webhook.', 'success');
  } else {
    setAlertMessage('Alerts stay on-device until you enable them.', 'muted');
  }
  approverPromptEnabled = Boolean(cfg.approverPromptEnabled);
  if (approverPromptEnabledEl) approverPromptEnabledEl.checked = approverPromptEnabled;
  setApproverMessage(approverPromptEnabled ? 'Approver prompt enabled. Staff must enter their name when overriding.' : 'Enable to record who approves each override.', approverPromptEnabled ? 'success' : 'muted');
});

enabledEl.addEventListener('change', async ()=>{
  const enabled = enabledEl.checked;
  setStatus(enabled);
  chrome.storage.sync.set({enabled});
});

aggressiveEl.addEventListener('change', ()=>{
  chrome.storage.sync.set({ aggressive: aggressiveEl.checked });
  markProfileCustomised();
});

sensitivityEl.addEventListener('input', ()=>{
  const v = Math.max(10, Math.min(100, Number(sensitivityEl.value)||60));
  chrome.storage.sync.set({ sensitivity: v });
  updateSensitivityDisplay(v);
  markProfileCustomised();
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
          setPinMessage('PIN required for overrides and allowlist edits.', 'success');
          markProfileCustomised();
        });
      } else {
        chrome.storage.local.set({ requirePin: true }, ()=>{
          setPinMessage('PIN required for overrides and allowlist edits.', 'success');
          markProfileCustomised();
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
        setPinMessage('PIN saved; overrides and allowlist edits are unlocked until you re-enable.', 'muted');
        syncPinControls();
        markProfileCustomised();
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
      setPinMessage((requirePinEl && requirePinEl.checked) ? 'PIN updated.' : 'PIN updated. Toggle on PIN protection when you need it.', 'success');
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
      setPinMessage('PIN removed. Manual overrides and allowlist edits are unprotected.', 'success');
    });
  });
}

addAllow.addEventListener('click', async ()=>{
  const host = normalizeHost(allowHost.value);
  if(!validHostname(host)){
    setAllowMessage('Invalid hostname. Use a format like example.com.', 'error');
    return;
  }
  if (!(await ensureAllowlistPin(`allow ${host}`))) return;
  chrome.storage.sync.get({allowlist:[]}, (cfg)=>{
    const set = new Set(cfg.allowlist||[]);
    set.add(host);
    const next = Array.from(set);
    chrome.storage.sync.set({allowlist: next}, ()=>{
      allowHost.value='';
      setAllowMessage('Allowlisted domains');
      render(next);
      markProfileCustomised();
    });
  });
});

clearAllow.addEventListener('click', async ()=>{
  if (!(await ensureAllowlistPin('clear the allowlist'))) return;
  chrome.storage.sync.set({allowlist: []}, ()=>{
    render([]);
    setAllowMessage('Allowlist cleared. Enter hostnames without http/https.','muted');
    markProfileCustomised();
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
    markProfileCustomised();
  });
});

clearBlocklist.addEventListener('click', ()=>{
  chrome.storage.local.set({ userBlocklist: [] }, ()=>{
    currentBlocklist = [];
    updateBlockCount(0);
    setBlockMessage('Blocklist cleared.', 'muted');
    updateMetrics();
    markProfileCustomised();
  });
});

if (siteToggle){
  siteToggle.addEventListener('change', async ()=>{
    if (!currentHost) return;
    const action = siteToggle.checked ? `allow ${currentHost}` : `remove ${currentHost} from the allowlist`;
    if (!(await ensureAllowlistPin(action))){
      siteToggle.checked = !siteToggle.checked;
      return;
    }
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
        markProfileCustomised();
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
    reader.onload = async ()=>{
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
      if (!(await ensureAllowlistPin('replace the allowlist from file'))) return;
      chrome.storage.sync.set({ allowlist: domains }, ()=>{
        render(domains);
        setAllowMessage(`Uploaded ${domains.length} domain${domains.length===1?'':'s'} from file.`, 'success');
        markProfileCustomised();
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
        markProfileCustomised();
      });
    };
    reader.onerror = ()=>{
      setBlockMessage('Failed to read file.', 'error');
    };
    reader.readAsText(file);
  });
}

if (alertEnabledEl){
  alertEnabledEl.addEventListener('change', async ()=>{
    const wantsEnable = alertEnabledEl.checked;
    if (!(await ensureAlertPinAuthorization(wantsEnable ? 'enable alerts' : 'disable alerts'))){
      alertEnabledEl.checked = overrideAlertsEnabled;
      return;
    }
    overrideAlertsEnabled = wantsEnable;
    chrome.storage.local.set({ overrideAlertEnabled: overrideAlertsEnabled }, ()=>{
      setAlertMessage(overrideAlertsEnabled ? 'Alerts enabled. Save a webhook to deliver notifications.' : 'Alerts disabled.', overrideAlertsEnabled ? 'success' : 'muted');
    });
  });
}

if (alertSaveBtn){
  alertSaveBtn.addEventListener('click', async ()=>{
    if (!(await ensureAlertPinAuthorization('update the alert webhook'))) return;
    const url = (alertWebhookInput && alertWebhookInput.value ? alertWebhookInput.value.trim() : '');
    if (!/^https?:\/\//i.test(url)){
      setAlertMessage('Webhook must start with http:// or https://', 'error');
      return;
    }
    overrideAlertWebhook = url;
    chrome.storage.local.set({ overrideAlertWebhook: overrideAlertWebhook }, ()=>{
      setAlertMessage('Webhook saved.', 'success');
    });
  });
}

if (approverPromptEnabledEl){
  approverPromptEnabledEl.addEventListener('change', async ()=>{
    const wantsEnable = approverPromptEnabledEl.checked;
    if (!(await ensureAlertPinAuthorization(wantsEnable ? 'enable approver prompt' : 'disable approver prompt'))){
      approverPromptEnabledEl.checked = approverPromptEnabled;
      return;
    }
    approverPromptEnabled = wantsEnable;
    chrome.storage.local.set({ approverPromptEnabled }, ()=>{
      setApproverMessage(approverPromptEnabled ? 'Approver prompt enabled. Staff must enter their name when overriding.' : 'Override approver prompt disabled.', approverPromptEnabled ? 'success' : 'muted');
    });
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

if (overrideExportBtn){
  overrideExportBtn.addEventListener('click', async ()=>{
    if (!currentOverrideLog.length){
      setOverrideMessage('No overrides recorded yet.', 'muted');
      return;
    }
    if (!(await ensureLogPin('download the override log'))) return;
    downloadJson(`safeguard-overrides-${new Date().toISOString().slice(0,10)}.json`, {
      exportedAt: new Date().toISOString(),
      count: currentOverrideLog.length,
      entries: currentOverrideLog
    });
    setOverrideMessage('Override log downloaded.', 'success');
  });
}

if (overrideClearBtn){
  overrideClearBtn.addEventListener('click', async ()=>{
    if (!currentOverrideLog.length){
      setOverrideMessage('Override log is already empty.', 'muted');
      return;
    }
    if (!(await ensureLogPin('clear the override log'))) return;
    chrome.storage.local.set({ overrideLog: [] }, ()=>{
      renderOverrideLog([]);
      setOverrideMessage('Override log cleared.', 'success');
    });
  });
}

chrome.storage.onChanged.addListener((changes, area)=>{
  if (area === 'local' && changes.overrideLog){
    const value = changes.overrideLog.newValue;
    renderOverrideLog(Array.isArray(value) ? value : []);
  }
  if (area === 'sync' && changes.selectedProfileId){
    appliedProfileId = changes.selectedProfileId.newValue || null;
    renderProfileOptions();
    if (!selectedProfileId){
      const profile = findProfile(appliedProfileId);
      if (profile){
        setProfileMessage(`Applied profile: ${profile.label || profile.id}.`, 'muted');
      } else {
        setProfileMessage('Select a profile to preview recommended settings.', 'muted');
      }
    }
  }
  if (area === 'sync' && changes.sensitivity){
    currentSensitivity = Number(changes.sensitivity.newValue) || currentSensitivity;
    sensitivityEl.value = String(currentSensitivity);
    updateSensitivityDisplay(currentSensitivity);
  }
  if (area === 'sync' && changes.aggressive){
    currentAggressive = Boolean(changes.aggressive.newValue);
    aggressiveEl.checked = currentAggressive;
  }
  if (area === 'local' && changes.overrideAlertEnabled){
    overrideAlertsEnabled = Boolean(changes.overrideAlertEnabled.newValue);
    if (alertEnabledEl) alertEnabledEl.checked = overrideAlertsEnabled;
    setAlertMessage(overrideAlertsEnabled ? 'Alerts enabled. Save a webhook to deliver notifications.' : 'Alerts disabled.', overrideAlertsEnabled ? 'success' : 'muted');
  }
  if (area === 'local' && changes.overrideAlertWebhook){
    overrideAlertWebhook = typeof changes.overrideAlertWebhook.newValue === 'string' ? changes.overrideAlertWebhook.newValue : '';
    if (alertWebhookInput) alertWebhookInput.value = overrideAlertWebhook;
  }
  if (area === 'local' && changes.approverPromptEnabled){
    approverPromptEnabled = Boolean(changes.approverPromptEnabled.newValue);
    if (approverPromptEnabledEl) approverPromptEnabledEl.checked = approverPromptEnabled;
    setApproverMessage(approverPromptEnabled ? 'Approver prompt enabled. Staff must enter their name when overriding.' : 'Enable to record who approves each override.', approverPromptEnabled ? 'success' : 'muted');
  }
});

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

if (profileApplyBtn){
  profileApplyBtn.addEventListener('click', ()=>{
    applySelectedProfile();
  });
}

if (profileResetBtn){
  profileResetBtn.addEventListener('click', async ()=>{
    if (!(await ensureProfilePinAuthorization('reset the profile selection'))) return;
    clearProfileSelection();
  });
}

function csvEscape(value){
  if (value == null) return '';
  const text = String(value);
  if (/[" ,\n\r]/.test(text)){
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildDigestCsv(){
  const now = new Date();
  const rows = [];
  const appliedProfile = appliedProfileId ? findProfile(appliedProfileId) : null;
  rows.push(['Safeguard digest generated', now.toISOString()]);
  rows.push([]);
  rows.push(['Settings']);
  rows.push(['Profile', appliedProfile ? appliedProfile.label || appliedProfile.id : 'Custom']);
  rows.push(['Sensitivity', currentSensitivity]);
  rows.push(['Aggressive mode', currentAggressive ? 'On' : 'Off']);
  rows.push(['Allowlist entries', currentAllowlist.length]);
  rows.push(['Blocklist entries', currentBlocklist.length]);
  rows.push(['Alerts', overrideAlertsEnabled ? 'Enabled' : 'Disabled']);
  rows.push(['Approver prompt', approverPromptEnabled ? 'Enabled' : 'Disabled']);
  rows.push([]);
  rows.push(['Override summary']);
  const totalOverrides = currentOverrideLog.length;
  const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const recentOverrides = currentOverrideLog.filter((entry)=>entry && entry.timestamp && entry.timestamp >= weekAgo);
  rows.push(['Total overrides (all time)', totalOverrides]);
  rows.push(['Overrides in last 7 days', recentOverrides.length]);
  rows.push([]);
  rows.push(['Override detail']);
  rows.push(['Timestamp', 'Host', 'Approver', 'Reason', 'URL']);
  currentOverrideLog.slice().reverse().forEach((entry)=>{
    const ts = entry && entry.timestamp ? new Date(entry.timestamp).toISOString() : '';
    rows.push([
      ts,
      entry && entry.host ? entry.host : '',
      entry && entry.approver ? entry.approver : '',
      entry && entry.reason ? entry.reason : '',
      entry && entry.url ? entry.url : ''
    ]);
  });
  return rows.map((row)=>row.map(csvEscape).join(',')).join('\r\n');
}

if (digestDownloadBtn){
  digestDownloadBtn.addEventListener('click', ()=>{
    try {
      const csv = buildDigestCsv();
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `safeguard-digest-${new Date().toISOString().slice(0,10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDigestMessage('Digest downloaded.', 'success');
    } catch(_e){
      setDigestMessage('Failed to build digest.', 'error');
    }
  });
}

loadProfiles();
