// Apply stored or system theme immediately (allowed by extension CSP: script-src 'self')
(function(){
  try {
    const stored = localStorage.getItem('sgThemePreference');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = (stored === 'dark' || stored === 'light') ? stored : (prefersDark ? 'dark' : 'light');
    document.documentElement.dataset.theme = initialTheme;
  } catch (_e){
    document.documentElement.dataset.theme = 'light';
  }
})();

// ── Element references ────────────────────────────────────────────────────────
const enabledEl = document.getElementById('enabled');
const statusBadge = document.getElementById('statusBadge');
const aggressiveEl = document.getElementById('aggressive');
const nudgeEnabledEl = document.getElementById('nudgeEnabled');
const sensitivityEl = document.getElementById('sensitivity');
const sensitivityValue = document.getElementById('sensitivityValue');
const tourOverlay = document.getElementById('tour');
const tourTitle = document.getElementById('tourTitle');
const tourBody = document.getElementById('tourBody');
const tourProgress = document.getElementById('tourProgress');
const tourNext = document.getElementById('tourNext');
const tourSkip = document.getElementById('tourSkip');
const tourReplay = document.getElementById('tourReplay');
const siteToggle = document.getElementById('siteToggle');
const siteHostLabel = document.getElementById('siteHost');
const metricAllowed = document.getElementById('metricAllowed');
const metricBlocked = document.getElementById('metricBlocked');
const requirePinEl = document.getElementById('requirePin');
const pinControls = document.getElementById('pinControls');
const pinMessage = document.getElementById('pinMessage');
const pinUpdateBtn = document.getElementById('pinUpdate');
const pinRemoveBtn = document.getElementById('pinRemove');
const themeToggleBtn = document.getElementById('themeToggle');
const themeToggleIcon = document.getElementById('themeToggleIcon');
const kidReportBtn = document.getElementById('kidReportBtn');
const kidReportMessageEl = document.getElementById('kidReportMessage');
const kidReportNoteInput = document.getElementById('kidReportNote');

// OroQ Pro elements
const proStatusBadgeEl = document.getElementById('proStatusBadge');
const proStatusTextEl = document.getElementById('proStatusText');
const proUpgradeRowEl = document.getElementById('proUpgradeRow');
const proUpgradeBtn = document.getElementById('proUpgradeBtn');
const proLicenseInput = document.getElementById('proLicenseInput');
const proActivateBtn = document.getElementById('proActivateBtn');
const proDeactivateBtn = document.getElementById('proDeactivateBtn');
const proLicenseMsg = document.getElementById('proLicenseMsg');
const proControlsEl = document.getElementById('proControls');
const committedLockToggle = document.getElementById('committedLockToggle');
const committedLockCooldownEl = document.getElementById('committedLockCooldown');
const committedLockStatusEl = document.getElementById('committedLockStatus');
const committedLockCountdownEl = document.getElementById('committedLockCountdown');
const committedLockConfirmBtn = document.getElementById('committedLockConfirm');
const committedLockCancelBtn = document.getElementById('committedLockCancel');
const focusDurationSelect = document.getElementById('focusDurationSelect');
const focusStartBtn = document.getElementById('focusStartBtn');
const focusStopBtn = document.getElementById('focusStopBtn');
const focusStatusBadge = document.getElementById('focusStatusBadge');
const focusStatusText = document.getElementById('focusStatusText');
let focusPollTimer = null;
const proCustomDurationEl = document.getElementById('proCustomDuration');
const proDurationApplyBtn = document.getElementById('proDurationApply');
const proDurationMsgEl = document.getElementById('proDurationMsg');
const scheduleListEl = document.getElementById('scheduleList');
const scheduleDaysEl = document.getElementById('scheduleDays');
const scheduleStartEl = document.getElementById('scheduleStart');
const scheduleEndEl = document.getElementById('scheduleEnd');
const scheduleAddBtn = document.getElementById('scheduleAdd');
const scheduleMsgEl = document.getElementById('scheduleMsg');

// TODO(owner): replace with your real checkout link (Gumroad / LemonSqueezy / etc.).
const CHECKOUT_URL = 'https://oroq.gumroad.com/l/pro';
const PRO_FOCUS_MIN = 15;
const PRO_FOCUS_MAX = 480;

const TOUR_KEY = 'onboardingComplete';
const TOUR_STEPS = [
  {
    target: document.getElementById('cardProtection'),
    title: 'Turn on protection',
    body: 'Use the master toggle and aggressive mode to decide how OroQ blocks distracting and unsafe pages.'
  },
  {
    target: document.getElementById('pinControls'),
    title: 'Lock your settings',
    body: 'Set a private PIN so you can\'t undo your own limits in a weak moment. It never leaves this device.'
  },
  {
    target: document.getElementById('proSection'),
    title: 'Commit to focus',
    body: 'OroQ Pro adds a Committed Lock cooldown, custom Focus durations, and scheduled Focus windows.'
  }
];

const PIN_SALT_BYTES = 16;
const PIN_ITERATIONS = 200000;
const pinModalEl = document.getElementById('pinModal');
const pinModalTitle = document.getElementById('pinModalTitle');
const pinModalMessage = document.getElementById('pinModalMessage');
const pinModalInput = document.getElementById('pinModalInput');
const pinModalConfirmGroup = document.getElementById('pinModalConfirmGroup');
const pinModalConfirm = document.getElementById('pinModalConfirm');
const pinModalError = document.getElementById('pinModalError');
const pinModalCancel = document.getElementById('pinModalCancel');
const pinModalSubmit = document.getElementById('pinModalSubmit');
const THEME_KEY = 'themePreference';
const TOUR_PENDING_KEY = 'onboardingPending';

const prefersDarkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
const cachedThemePreference = (() => {
  try {
    const stored = localStorage.getItem('sgThemePreference');
    if (stored === 'dark' || stored === 'light' || stored === 'system') return stored;
    return 'system';
  } catch (_e) {
    return 'system';
  }
})();

try {
  chrome.runtime.sendMessage({ type: 'sg-analytics-activity', source: 'popup' });
} catch(_e){}

// ── Usage events ─────────────────────────────────────────────────────────────
// Google Analytics (GA4) was removed for privacy — no third-party analytics.
// sgTrack is a no-op kept so call sites stay simple; meaningful events are still
// logged on-device by the background worker.
const _sgPopupOpenedAt = Date.now();

function sgTrack() { /* no-op: GA4 removed */ }

sgTrack('popup_opened');

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    sgTrack('popup_closed', { engagement_time_msec: String(Date.now() - _sgPopupOpenedAt) });
  }
});
window.addEventListener('beforeunload', () => {
  sgTrack('popup_closed', { engagement_time_msec: String(Date.now() - _sgPopupOpenedAt) });
});

// ── State ─────────────────────────────────────────────────────────────────────
let tourIndex = 0;
let tourActive = false;
let currentAllowlist = [];
let currentBlocklist = [];
let currentHost = null;
let storedPin = null;
let currentSensitivity = 60;
let currentAggressive = false;
let pinSetupPrompted = false;
let focusDurationChoice = 45;
// OroQ Pro state (mirrors chrome.storage.local)
let proTier = false;
let proEmail = '';
let committedLock = { enabled: false, cooldownMinutes: 10 };
let committedLockCooldown = null; // { active, startedAt, endsAt } persisted across popup close / SW restart
let focusSchedules = [];
let commitTicker = null;
let themePreference = cachedThemePreference;
let appliedTheme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
let syncTourComplete = null;
let localTourPending = null;
let tourDecisionMade = false;
let kidReportEnabled = true;
let kidReportNoteVisible = false;

initThemeToggle();

function setStatus(enabled){
  if (!statusBadge) return;
  statusBadge.textContent = enabled ? 'Active' : 'Paused';
  statusBadge.classList.toggle('status--off', !enabled);
  const hero = document.querySelector('.status-hero');
  const heroState = document.querySelector('.status-hero__state');
  const heroDesc  = document.querySelector('.status-hero__desc');
  if (hero)      hero.classList.toggle('is-off', !enabled);
  if (heroState) heroState.textContent = enabled ? 'Protected' : 'Not protected';
  if (heroDesc)  heroDesc.textContent  = enabled ? 'Filtering active on all sites' : 'Protection is currently paused';
}

function resolveTheme(pref){
  if (pref === 'dark' || pref === 'light') return pref;
  return (prefersDarkQuery && prefersDarkQuery.matches) ? 'dark' : 'light';
}

function updateThemeToggleUi(theme){
  if (themeToggleIcon) themeToggleIcon.textContent = theme === 'dark' ? '☀' : '🌙';
  if (themeToggleBtn) themeToggleBtn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  if (themeToggleBtn) themeToggleBtn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
}

function applyThemePreference(pref){
  themePreference = (pref === 'dark' || pref === 'light') ? pref : 'system';
  appliedTheme = resolveTheme(themePreference);
  document.documentElement.dataset.theme = appliedTheme;
  updateThemeToggleUi(appliedTheme);
  try {
    localStorage.setItem('sgThemePreference', themePreference);
  } catch(_e){}
}

function initThemeToggle(){
  applyThemePreference(themePreference);
  chrome.storage.sync.get({ [THEME_KEY]: themePreference }, (cfg)=>{
    applyThemePreference(cfg[THEME_KEY] || 'system');
  });
  if (themeToggleBtn){
    themeToggleBtn.addEventListener('click', ()=>{
      const next = appliedTheme === 'dark' ? 'light' : 'dark';
      applyThemePreference(next);
      chrome.storage.sync.set({ [THEME_KEY]: next });
    });
  }
  if (prefersDarkQuery){
    const handleSystemTheme = ()=>{
      if (themePreference === 'system'){
        applyThemePreference('system');
      }
    };
    if (typeof prefersDarkQuery.addEventListener === 'function'){
      prefersDarkQuery.addEventListener('change', handleSystemTheme);
    } else if (typeof prefersDarkQuery.addListener === 'function'){
      prefersDarkQuery.addListener(handleSystemTheme);
    }
  }
}

function updateSensitivityDisplay(value){
  if (sensitivityValue) sensitivityValue.textContent = String(value);
}

function setPinMessage(text, tone = 'muted'){
  if (!pinMessage) return;
  pinMessage.textContent = text;
  pinMessage.classList.remove('message--success', 'message--error');
  if (tone === 'success') pinMessage.classList.add('message--success');
  else if (tone === 'error') pinMessage.classList.add('message--error');
}

function sendMessagePromise(payload){
  return new Promise((resolve)=>{
    try{
      chrome.runtime.sendMessage(payload, (resp)=>{
        if (chrome.runtime.lastError){
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(resp || { ok: false });
      });
    }catch(_err){
      resolve({ ok: false });
    }
  });
}

function formatFocusCountdown(ms){
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) return `${minutes} min left`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s left`;
  if (seconds > 0) return `${seconds}s left`;
  return 'Ending now';
}

// ── OroQ Pro: license, committed lock, custom durations, scheduled focus ────
function resolveDurationChoice(minutes){
  const v = Number(minutes);
  if (proTier){
    if (!Number.isFinite(v)) return 45;
    return Math.max(PRO_FOCUS_MIN, Math.min(PRO_FOCUS_MAX, Math.round(v)));
  }
  if ([30, 45, 60].includes(v)) return v;
  return 45;
}

function setProLicenseMessage(text, tone = 'muted'){
  if (!proLicenseMsg) return;
  proLicenseMsg.textContent = text;
  proLicenseMsg.classList.remove('message--success', 'message--error');
  if (tone === 'success') proLicenseMsg.classList.add('message--success');
  else if (tone === 'error') proLicenseMsg.classList.add('message--error');
}

function renderProStatus(){
  if (proStatusBadgeEl){
    proStatusBadgeEl.textContent = proTier ? 'Pro active' : 'Locked';
    proStatusBadgeEl.classList.toggle('pro-badge--active', proTier);
    proStatusBadgeEl.classList.toggle('pro-badge--locked', !proTier);
  }
  if (proStatusTextEl){
    proStatusTextEl.textContent = proTier
      ? (proEmail ? `Pro active — licensed to ${proEmail}.` : 'Pro active — commitment tools unlocked.')
      : 'Commitment tools that make it harder to cheat on yourself.';
  }
  if (proControlsEl) proControlsEl.classList.toggle('pro-controls--locked', !proTier);
  if (proUpgradeRowEl) proUpgradeRowEl.hidden = proTier;
  if (proDeactivateBtn) proDeactivateBtn.hidden = !proTier;
  if (proLicenseInput) proLicenseInput.disabled = proTier;
  if (proActivateBtn) proActivateBtn.disabled = proTier;
  renderCommittedLock();
  renderSchedules();
  if (proCustomDurationEl && !proCustomDurationEl.value){
    proCustomDurationEl.value = String(focusDurationChoice);
  }
}

async function activateLicenseFromUi(){
  const key = proLicenseInput ? proLicenseInput.value.trim() : '';
  if (!key){
    setProLicenseMessage('Paste your license key first.', 'error');
    return;
  }
  setProLicenseMessage('Verifying…', 'muted');
  const resp = await sendMessagePromise({ type: 'sg-verify-license', key });
  if (!resp || !resp.ok){
    const reason = resp && resp.error ? resp.error : 'invalid';
    setProLicenseMessage(`Invalid license key (${reason}). Check it and try again.`, 'error');
    return;
  }
  proTier = true;
  proEmail = resp.proEmail || '';
  if (proLicenseInput) proLicenseInput.value = '';
  setProLicenseMessage('Pro activated. Enjoy the commitment tools.', 'success');
  renderProStatus();
}

async function deactivateLicense(){
  proTier = false;
  proEmail = '';
  await chrome.storage.local.set({ proTier: false, proLicense: '', proEmail: '' });
  setProLicenseMessage('License removed. Pro features are locked.', 'muted');
  renderProStatus();
}

// ── Committed Lock ──
function renderCommittedLock(){
  if (committedLockToggle){
    committedLockToggle.checked = Boolean(committedLock.enabled);
  }
  if (committedLockCooldownEl){
    committedLockCooldownEl.value = String(committedLock.cooldownMinutes || 10);
  }
  const now = Date.now();
  const cooling = committedLockCooldown
    && committedLockCooldown.active
    && Number(committedLockCooldown.endsAt) > 0;
  if (!cooling){
    if (committedLockStatusEl) committedLockStatusEl.hidden = true;
    stopCommitTicker();
    return;
  }
  if (committedLockStatusEl) committedLockStatusEl.hidden = false;
  const elapsed = now >= Number(committedLockCooldown.endsAt);
  if (committedLockConfirmBtn) committedLockConfirmBtn.hidden = !elapsed;
  if (committedLockCountdownEl){
    committedLockCountdownEl.textContent = elapsed
      ? 'Cooldown complete — enter your PIN to pause protection.'
      : `Cooldown: ${formatFocusCountdown(Number(committedLockCooldown.endsAt) - now)} before you can pause.`;
  }
  startCommitTicker();
}

function startCommitTicker(){
  if (commitTicker) return;
  commitTicker = setInterval(()=>{
    const now = Date.now();
    if (!committedLockCooldown || !committedLockCooldown.active || Number(committedLockCooldown.endsAt) <= 0){
      stopCommitTicker();
      return;
    }
    renderCommittedLock();
    if (now >= Number(committedLockCooldown.endsAt)) stopCommitTicker();
  }, 1000);
}

function stopCommitTicker(){
  if (commitTicker){
    clearInterval(commitTicker);
    commitTicker = null;
  }
}

async function beginCommitCooldown(){
  const minutes = committedLock.cooldownMinutes || 10;
  const now = Date.now();
  committedLockCooldown = { active: true, startedAt: now, endsAt: now + minutes * 60000 };
  await chrome.storage.local.set({ committedLockCooldown });
  setPinMessage(`Committed Lock: wait ${minutes} min, then enter your PIN to pause.`, 'muted');
  renderCommittedLock();
}

async function cancelCommitCooldown(){
  committedLockCooldown = null;
  await chrome.storage.local.set({ committedLockCooldown: null });
  setPinMessage('Protection stays on. Nice work sticking to it.', 'success');
  renderCommittedLock();
}

async function completeCommitDisable(){
  const now = Date.now();
  if (!committedLockCooldown || now < Number(committedLockCooldown.endsAt)){
    renderCommittedLock();
    return;
  }
  if (!storedPin){
    setPinMessage('Set a PIN first to complete the pause.', 'error');
    return;
  }
  const { ok, cancelled } = await requestPinConfirmation('Enter your PIN to pause OroQ protection');
  if (!ok){
    if (!cancelled) setPinMessage('Incorrect PIN.', 'error');
    return;
  }
  // Issue the one-time unlock token, then disable. Background consumes the token.
  await chrome.storage.local.set({ committedLockUnlockToken: Date.now() });
  committedLockCooldown = null;
  await chrome.storage.local.set({ committedLockCooldown: null });
  await chrome.storage.sync.set({ enabled: false });
  if (enabledEl) enabledEl.checked = false;
  setStatus(false);
  setPinMessage('Protection paused.', 'muted');
  renderCommittedLock();
}

// ── Scheduled Focus ──
const SCHEDULE_DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function describeSchedule(s){
  const days = Array.isArray(s.days) ? s.days.slice().sort((a, b)=>a - b) : [];
  const dayStr = days.map((d)=>SCHEDULE_DAY_LABELS[d] || '').filter(Boolean).join(', ');
  return `${dayStr} · ${s.startHHMM}–${s.endHHMM}`;
}

function renderSchedules(){
  if (!scheduleListEl) return;
  scheduleListEl.innerHTML = '';
  if (!focusSchedules.length){
    const empty = document.createElement('p');
    empty.className = 'pro-card__desc';
    empty.textContent = 'No windows yet.';
    scheduleListEl.appendChild(empty);
    return;
  }
  focusSchedules.forEach((s)=>{
    const row = document.createElement('div');
    row.className = 'schedule-item';
    const label = document.createElement('span');
    label.textContent = describeSchedule(s);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'schedule-item__remove';
    remove.textContent = 'Remove';
    remove.addEventListener('click', ()=>removeSchedule(s.id));
    row.appendChild(label);
    row.appendChild(remove);
    scheduleListEl.appendChild(row);
  });
}

function validHHMM(value){
  return /^(\d{1,2}):(\d{2})$/.test(String(value || '')) && (()=>{
    const [h, m] = value.split(':').map(Number);
    return h >= 0 && h <= 23 && m >= 0 && m <= 59;
  })();
}

async function addScheduleFromUi(){
  if (!proTier) return;
  const days = scheduleDaysEl
    ? Array.from(scheduleDaysEl.querySelectorAll('input[type="checkbox"]:checked')).map((cb)=>Number(cb.dataset.day))
    : [];
  const startHHMM = scheduleStartEl ? scheduleStartEl.value : '';
  const endHHMM = scheduleEndEl ? scheduleEndEl.value : '';
  if (!days.length){
    if (scheduleMsgEl) setScheduleMessage('Pick at least one day.', 'error');
    return;
  }
  if (!validHHMM(startHHMM) || !validHHMM(endHHMM)){
    setScheduleMessage('Enter a valid start and end time.', 'error');
    return;
  }
  const [sh, sm] = startHHMM.split(':').map(Number);
  const [eh, em] = endHHMM.split(':').map(Number);
  if ((eh * 60 + em) <= (sh * 60 + sm)){
    setScheduleMessage('End time must be after start time.', 'error');
    return;
  }
  const entry = {
    id: `sch_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    days: Array.from(new Set(days)).sort((a, b)=>a - b),
    startHHMM,
    endHHMM
  };
  focusSchedules = [...focusSchedules, entry].slice(0, 20);
  await chrome.storage.local.set({ focusSchedules });
  setScheduleMessage('Window added. Focus Mode will run automatically.', 'success');
  if (scheduleDaysEl) scheduleDaysEl.querySelectorAll('input[type="checkbox"]').forEach((cb)=>{ cb.checked = false; });
  renderSchedules();
}

async function removeSchedule(id){
  focusSchedules = focusSchedules.filter((s)=>s.id !== id);
  await chrome.storage.local.set({ focusSchedules });
  setScheduleMessage('Window removed.', 'muted');
  renderSchedules();
}

function setScheduleMessage(text, tone = 'muted'){
  if (!scheduleMsgEl) return;
  scheduleMsgEl.textContent = text;
  scheduleMsgEl.classList.remove('message--success', 'message--error');
  if (tone === 'success') scheduleMsgEl.classList.add('message--success');
  else if (tone === 'error') scheduleMsgEl.classList.add('message--error');
}

// ── PIN crypto + modal ────────────────────────────────────────────────────────
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
  const value = await openPinSetupModal();
  if (!value) return null;
  const hashed = await derivePinHash(value);
  return hashed;
}

async function requestPinConfirmation(message){
  if (!storedPin) return { ok: false, cancelled: true };
  const pin = await openPinVerifyModal(message || 'Enter your PIN to continue');
  if (!pin) return { ok: false, cancelled: true };
  const valid = await verifyPinInput(pin, storedPin);
  if (!valid){
    setPinMessage('Incorrect PIN.', 'error');
    return { ok: false, cancelled: false };
  }
  return { ok: true, cancelled: false };
}

async function ensureOverridePin(actionLabel){
  if (!requirePinEl || !requirePinEl.checked) return true;
  if (!storedPin){
    setPinMessage('Enable PIN protection to lock this action.', 'error');
    return false;
  }
  const label = actionLabel || 'continue';
  const { ok, cancelled } = await requestPinConfirmation(`Enter your PIN to ${label}`);
  if (!ok){
    if (!cancelled) setPinMessage('Incorrect PIN.', 'error');
    return false;
  }
  return true;
}

function ensurePinAfterOnboarding(){
  if (pinSetupPrompted || storedPin) return;
  pinSetupPrompted = true;
  setTimeout(async ()=>{
    if (storedPin) return;
    const newPin = await promptForNewPin();
    if (!newPin){
      setPinMessage('OroQ needs a PIN to secure overrides. You can set one anytime from the Protection card.', 'error');
      pinSetupPrompted = false;
      setTimeout(()=>ensurePinAfterOnboarding(), 4000);
      return;
    }
    storedPin = newPin;
    await new Promise((resolve)=>chrome.storage.local.set({
      overridePinHash: newPin.hash,
      overridePinSalt: newPin.salt,
      overridePinIterations: newPin.iterations,
      requirePin: true
    }, resolve));
    if (requirePinEl){
      requirePinEl.checked = true;
    }
    syncPinControls();
    setPinMessage('PIN saved. OroQ will request it for protection controls and overrides.', 'success');
  }, 250);
}

function onlyDigits(str){
  return (str || '').replace(/\D+/g, '');
}

function clampPin(value){
  const digits = onlyDigits(value).slice(0, 8);
  if (digits.length < 4) return null;
  return digits;
}

function openPinModal({ title, message, confirm = false }){
  if (!pinModalEl) return Promise.resolve(null);
  return new Promise((resolve)=>{
    const cleanup = (value)=>{
      pinModalEl.classList.add('modal--hidden');
      if (pinModalInput) pinModalInput.value = '';
      if (pinModalConfirm) pinModalConfirm.value = '';
      if (pinModalError) pinModalError.textContent = '';
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const showError = (text)=>{
      if (pinModalError) pinModalError.textContent = text || '';
    };
    const handleSubmit = ()=>{
      const primary = clampPin(pinModalInput ? pinModalInput.value : '');
      if (!primary){
        showError('PIN must be 4-8 digits.');
        return;
      }
      if (confirm){
        const confirmValue = clampPin(pinModalConfirm ? pinModalConfirm.value : '');
        if (!confirmValue){
          showError('Confirm your PIN (4-8 digits).');
          return;
        }
        if (primary !== confirmValue){
          showError('PIN entries do not match.');
          return;
        }
      }
      cleanup(primary);
    };
    const onKey = (e)=>{
      if (e.key === 'Escape'){
        e.preventDefault();
        cleanup(null);
      }
      if (e.key === 'Enter'){
        e.preventDefault();
        handleSubmit();
      }
    };
    if (pinModalTitle) pinModalTitle.textContent = title || 'Enter PIN';
    if (pinModalMessage) pinModalMessage.textContent = message || '';
    if (pinModalError) pinModalError.textContent = '';
    if (pinModalConfirmGroup) pinModalConfirmGroup.classList.toggle('modal__field--hidden', !confirm);
    pinModalEl.classList.remove('modal--hidden');
    if (pinModalInput){
      pinModalInput.value = '';
      pinModalInput.focus();
    }
    if (pinModalConfirm) pinModalConfirm.value = '';
    document.addEventListener('keydown', onKey);
    if (pinModalCancel){
      pinModalCancel.onclick = ()=>cleanup(null);
    }
    if (pinModalSubmit){
      pinModalSubmit.onclick = handleSubmit;
    }
  });
}

function openPinSetupModal(){
  return openPinModal({
    title: 'Enter a new PIN',
    message: 'Protect overrides with a 4-8 digit PIN (stays on this device).',
    confirm: true
  });
}

function openPinVerifyModal(message){
  return openPinModal({
    title: 'Enter PIN',
    message: message || 'Enter your PIN to continue.',
    confirm: false
  });
}

// ── Tour ──────────────────────────────────────────────────────────────────────
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

function maybeStartTour(){
  if (tourDecisionMade) return;
  if (syncTourComplete === null || localTourPending === null) return;
  const needsTour = !syncTourComplete || localTourPending;
  if (needsTour){
    startTour();
    if (localTourPending){
      chrome.storage.local.set({ [TOUR_PENDING_KEY]: false });
    }
  }
  tourDecisionMade = true;
}

function endTour(completed){
  clearHighlights();
  if (tourOverlay) tourOverlay.classList.add('tour--hidden');
  tourActive = false;
  if (completed){
    chrome.storage.sync.set({ [TOUR_KEY]: true }, ()=>{
      ensurePinAfterOnboarding();
    });
    chrome.storage.local.set({ [TOUR_PENDING_KEY]: false });
  }
}

// ── Allowlist / metrics / per-site toggle ──────────────────────────────────────
function render(list){
  currentAllowlist = Array.isArray(list) ? [...list] : [];
  updateMetrics();
  updateSiteToggle();
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

// ── Report unsafe page ──────────────────────────────────────────────────────────
function renderKidReportButton(){
  if (!kidReportBtn || !kidReportMessageEl) return;
  const visible = kidReportEnabled !== false;
  kidReportBtn.style.display = visible ? 'inline-flex' : 'none';
  kidReportMessageEl.style.display = visible ? 'block' : 'none';
  if (kidReportNoteInput){
    kidReportNoteInput.style.display = (visible && kidReportNoteVisible) ? 'block' : 'none';
  }
}

// ── Initial load ────────────────────────────────────────────────────────────────
chrome.storage.sync.get({
  enabled:true,
  allowlist:[],
  aggressive:false,
  nudgeEnabled:true,
  sensitivity:60,
  [TOUR_KEY]: false
}, (cfg)=>{
  enabledEl.checked = cfg.enabled;
  setStatus(Boolean(cfg.enabled));
  if (cfg.enabled === true){
    try {
      chrome.runtime.sendMessage({ type: 'sg-analytics-track-once', name: 'protection_enabled', source: 'popup' });
    } catch(_e){}
  }
  render(cfg.allowlist||[]);
  currentAggressive = Boolean(cfg.aggressive);
  aggressiveEl.checked = currentAggressive;
  if (nudgeEnabledEl) nudgeEnabledEl.checked = cfg.nudgeEnabled !== false;
  if (typeof cfg.sensitivity === 'number'){
    currentSensitivity = cfg.sensitivity;
    sensitivityEl.value = String(currentSensitivity);
    updateSensitivityDisplay(currentSensitivity);
  }
  syncTourComplete = Boolean(cfg[TOUR_KEY]);
  maybeStartTour();
});

chrome.storage.local.get({
  userBlocklist: [],
  requirePin: true,
  overridePinHash: null,
  overridePinSalt: null,
  overridePinIterations: 0,
  focusDurationMinutes: 45,
  proTier: false,
  proEmail: '',
  committedLock: { enabled: false, cooldownMinutes: 10 },
  committedLockCooldown: null,
  focusSchedules: [],
  [TOUR_PENDING_KEY]: false
}, (cfg)=>{
  const list = Array.isArray(cfg.userBlocklist) ? cfg.userBlocklist : [];
  currentBlocklist = [...list];
  updateMetrics();

  storedPin = (cfg.overridePinHash && cfg.overridePinSalt) ? {
   hash: cfg.overridePinHash,
   salt: cfg.overridePinSalt,
   iterations: Number(cfg.overridePinIterations) || PIN_ITERATIONS
 } : null;

  if (requirePinEl){
    requirePinEl.checked = Boolean(cfg.requirePin);
  }
  syncPinControls();
  if (storedPin){
    setPinMessage((requirePinEl && requirePinEl.checked) ? 'PIN required for overrides and settings edits.' : 'PIN saved. PIN protection defaults on; disable only if you must.', 'muted');
  } else {
    setPinMessage((requirePinEl && requirePinEl.checked) ? 'Set a PIN to enforce protection for overrides and settings edits.' : 'Set a PIN to guard overrides and settings edits. Nothing leaves this device.', (requirePinEl && requirePinEl.checked) ? 'error' : 'muted');
  }
  if (pinControls) pinControls.classList.add('pin-controls--visible');

  proTier = Boolean(cfg.proTier);
  proEmail = typeof cfg.proEmail === 'string' ? cfg.proEmail : '';
  committedLock = {
    enabled: Boolean(cfg.committedLock && cfg.committedLock.enabled),
    cooldownMinutes: Math.max(1, Math.min(120, Number(cfg.committedLock && cfg.committedLock.cooldownMinutes) || 10))
  };
  committedLockCooldown = cfg.committedLockCooldown && cfg.committedLockCooldown.active ? cfg.committedLockCooldown : null;
  focusSchedules = Array.isArray(cfg.focusSchedules) ? cfg.focusSchedules : [];
  focusDurationChoice = resolveDurationChoice(cfg.focusDurationMinutes || focusDurationChoice);
  renderProStatus();
  renderKidReportButton();
  localTourPending = Boolean(cfg[TOUR_PENDING_KEY]);
  maybeStartTour();
});

// ── Focus Mode (free: timed distraction block) ──────────────────────────────────
function renderFocusState(focusMode){
  const active = Boolean(focusMode && focusMode.active) && Number(focusMode.endsAt) > Date.now();
  if (focusStartBtn) focusStartBtn.hidden = active;
  if (focusDurationSelect) focusDurationSelect.disabled = active;
  if (focusStopBtn) focusStopBtn.hidden = !active;
  if (focusStatusBadge){
    focusStatusBadge.textContent = active ? 'On' : 'Off';
    focusStatusBadge.classList.toggle('pro-badge--locked', !active);
  }
  if (focusStatusText){
    if (active){
      const msLeft = Number(focusMode.endsAt) - Date.now();
      const mins = Math.floor(msLeft / 60000);
      const secs = Math.floor((msLeft % 60000) / 1000);
      focusStatusText.textContent = `Blocking distractions — ${mins}:${String(secs).padStart(2, '0')} left.`;
    } else {
      focusStatusText.textContent = 'Block social, gaming and streaming for a timed session.';
    }
  }
  if (active && !focusPollTimer){
    focusPollTimer = setInterval(()=>refreshFocusState(), 1000);
  } else if (!active && focusPollTimer){
    clearInterval(focusPollTimer);
    focusPollTimer = null;
  }
}

function refreshFocusState(){
  chrome.runtime.sendMessage({ type: 'sg-focus-get-state' }, (resp)=>{
    if (chrome.runtime.lastError) return;
    renderFocusState(resp && resp.state ? resp.state : null);
  });
}

if (focusStartBtn){
  focusStartBtn.addEventListener('click', ()=>{
    const duration = Number(focusDurationSelect ? focusDurationSelect.value : 45) || 45;
    focusStartBtn.disabled = true;
    chrome.runtime.sendMessage({ type: 'sg-focus-start', duration }, (resp)=>{
      focusStartBtn.disabled = false;
      if (chrome.runtime.lastError || !resp || resp.ok === false) return;
      renderFocusState(resp.state || null);
    });
  });
}
if (focusStopBtn){
  focusStopBtn.addEventListener('click', ()=>{
    chrome.runtime.sendMessage({ type: 'sg-focus-stop' }, (resp)=>{
      if (chrome.runtime.lastError) return;
      renderFocusState(resp && resp.state ? resp.state : null);
    });
  });
}
refreshFocusState();

// ── Event wiring ────────────────────────────────────────────────────────────────
enabledEl.addEventListener('change', async ()=>{
  const wantsEnabled = enabledEl.checked;
  // Pro Committed Lock: disabling requires a visible cooldown, then PIN.
  if (!wantsEnabled && proTier && committedLock.enabled){
    enabledEl.checked = true; // protection stays on until cooldown + PIN complete
    setStatus(true);
    if (!storedPin){
      setPinMessage('Set a PIN to use Committed Lock.', 'error');
      return;
    }
    if (committedLockCooldown && committedLockCooldown.active){
      renderCommittedLock();
      return;
    }
    await beginCommitCooldown();
    return;
  }
  if (!wantsEnabled && requirePinEl && requirePinEl.checked){
    if (!storedPin){
      setPinMessage('Set a PIN to guard protection toggles.', 'error');
      enabledEl.checked = true;
      setStatus(true);
      return;
    }
    const { ok, cancelled } = await requestPinConfirmation('Enter your PIN to pause OroQ protection');
    if (!ok){
      enabledEl.checked = true;
      setStatus(true);
      if (cancelled){
        setPinMessage('Protection remains active.', 'muted');
      }
      return;
    }
  }
  setStatus(wantsEnabled);
  chrome.storage.sync.set({ enabled: wantsEnabled });
});

aggressiveEl.addEventListener('change', ()=>{
  chrome.storage.sync.set({ aggressive: aggressiveEl.checked });
});

if (nudgeEnabledEl){
  nudgeEnabledEl.addEventListener('change', ()=>{
    chrome.storage.sync.set({ nudgeEnabled: Boolean(nudgeEnabledEl.checked) });
  });
}

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
          setPinMessage('PIN required for overrides and settings edits.', 'success');
        });
      } else {
        chrome.storage.local.set({ requirePin: true }, ()=>{
          setPinMessage('PIN required for overrides and settings edits.', 'success');
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
        setPinMessage('PIN saved; overrides and settings edits are unlocked until you re-enable.', 'muted');
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
      overridePinIterations: newPin.iterations,
      requirePin: true
    };
    if (requirePinEl) requirePinEl.checked = true;
    chrome.storage.local.set(payload, ()=>{
      syncPinControls();
      setPinMessage('PIN updated. Override and settings protection is on.', 'success');
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
      setPinMessage('PIN removed. Manual overrides and settings edits are unprotected.', 'success');
    });
  });
}

if (siteToggle){
  siteToggle.addEventListener('change', async ()=>{
    if (!currentHost) return;
    const action = siteToggle.checked ? `allow ${currentHost}` : `remove ${currentHost} from the allowlist`;
    if (!(await ensureOverridePin(action))){
      siteToggle.checked = !siteToggle.checked;
      return;
    }
    chrome.storage.sync.get({ allowlist: [] }, (cfg)=>{
      const set = new Set(Array.isArray(cfg.allowlist) ? cfg.allowlist : []);
      if (siteToggle.checked){
        set.add(currentHost);
      } else {
        set.delete(currentHost);
      }
      const next = Array.from(set);
      chrome.storage.sync.set({ allowlist: next }, ()=>{
        render(next);
      });
    });
  });
}

if (kidReportBtn){
  kidReportBtn.addEventListener('click', ()=>{
    if (kidReportEnabled === false){
      if (kidReportMessageEl) kidReportMessageEl.textContent = 'Reporting is disabled.';
      return;
    }
    if (!kidReportNoteVisible){
      kidReportNoteVisible = true;
      renderKidReportButton();
      kidReportBtn.textContent = 'Submit report';
      if (kidReportNoteInput) kidReportNoteInput.focus();
      return;
    }
    kidReportBtn.disabled = true;
    kidReportBtn.textContent = 'Reported';
    const note = kidReportNoteInput ? (kidReportNoteInput.value || '').trim().slice(0, 60) : '';
    const host = currentHost || null;
    chrome.runtime.sendMessage({ type: 'sg-kid-report', tone: null, host, note }, ()=>{
      if (kidReportMessageEl) kidReportMessageEl.textContent = 'Thanks — we noted this on-device only.';
      if (kidReportNoteInput) kidReportNoteInput.value = '';
      kidReportNoteVisible = false;
      renderKidReportButton();
      setTimeout(()=>{
        kidReportBtn.disabled = false;
        kidReportBtn.textContent = 'Report unsafe page';
      }, 2000);
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

// ── OroQ Pro event wiring ──
if (proUpgradeBtn){
  proUpgradeBtn.addEventListener('click', ()=>{
    try { chrome.tabs.create({ url: CHECKOUT_URL }); } catch(_e){}
  });
}
if (proActivateBtn){
  proActivateBtn.addEventListener('click', ()=>{ activateLicenseFromUi(); });
}
if (proLicenseInput){
  proLicenseInput.addEventListener('keydown', (e)=>{
    if (e.key === 'Enter'){ e.preventDefault(); activateLicenseFromUi(); }
  });
}
if (proDeactivateBtn){
  proDeactivateBtn.addEventListener('click', ()=>{ deactivateLicense(); });
}
if (committedLockToggle){
  committedLockToggle.addEventListener('change', async ()=>{
    if (!proTier){ committedLockToggle.checked = false; return; }
    committedLock.enabled = committedLockToggle.checked;
    if (!committedLock.enabled && committedLockCooldown){
      committedLockCooldown = null;
      await chrome.storage.local.set({ committedLockCooldown: null });
    }
    await chrome.storage.local.set({ committedLock });
    renderCommittedLock();
  });
}
if (committedLockCooldownEl){
  committedLockCooldownEl.addEventListener('change', async ()=>{
    const minutes = Math.max(1, Math.min(120, Number(committedLockCooldownEl.value) || 10));
    committedLock.cooldownMinutes = minutes;
    committedLockCooldownEl.value = String(minutes);
    await chrome.storage.local.set({ committedLock });
  });
}
if (committedLockConfirmBtn){
  committedLockConfirmBtn.addEventListener('click', ()=>{ completeCommitDisable(); });
}
if (committedLockCancelBtn){
  committedLockCancelBtn.addEventListener('click', ()=>{ cancelCommitCooldown(); });
}
if (proDurationApplyBtn){
  proDurationApplyBtn.addEventListener('click', ()=>{
    if (!proTier){ return; }
    const minutes = resolveDurationChoice(proCustomDurationEl ? proCustomDurationEl.value : focusDurationChoice);
    focusDurationChoice = minutes;
    chrome.storage.local.set({ focusDurationMinutes: minutes });
    if (proDurationMsgEl){
      proDurationMsgEl.textContent = `Focus sessions will run for ${minutes} minutes.`;
    }
  });
}
if (scheduleAddBtn){
  scheduleAddBtn.addEventListener('click', ()=>{ addScheduleFromUi(); });
}

// ── Cross-context sync ──────────────────────────────────────────────────────────
chrome.storage.onChanged.addListener((changes, area)=>{
  if (area === 'sync' && changes[THEME_KEY]){
    applyThemePreference(changes[THEME_KEY].newValue || 'system');
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
  if (area === 'sync' && changes.allowlist){
    render(Array.isArray(changes.allowlist.newValue) ? changes.allowlist.newValue : []);
  }
  if (area === 'local' && changes.userBlocklist){
    currentBlocklist = Array.isArray(changes.userBlocklist.newValue) ? changes.userBlocklist.newValue : [];
    updateMetrics();
  }
  if (area === 'local' && changes.focusDurationMinutes){
    focusDurationChoice = resolveDurationChoice(changes.focusDurationMinutes.newValue || focusDurationChoice);
    if (proCustomDurationEl) proCustomDurationEl.value = String(focusDurationChoice);
  }
  if (area === 'local' && changes.proTier){
    proTier = Boolean(changes.proTier.newValue);
    renderProStatus();
  }
  if (area === 'local' && changes.focusMode){
    renderFocusState(changes.focusMode.newValue);
  }
  if (area === 'local' && changes.committedLockCooldown){
    committedLockCooldown = changes.committedLockCooldown.newValue && changes.committedLockCooldown.newValue.active
      ? changes.committedLockCooldown.newValue
      : null;
    renderCommittedLock();
  }
  if (area === 'local' && changes.focusSchedules){
    focusSchedules = Array.isArray(changes.focusSchedules.newValue) ? changes.focusSchedules.newValue : [];
    renderSchedules();
  }
});
