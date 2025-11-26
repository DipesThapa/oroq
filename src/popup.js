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

const enabledEl = document.getElementById('enabled');
const statusBadge = document.getElementById('statusBadge');
const allowHost = document.getElementById('allowHost');
const addAllow = document.getElementById('addAllow');
const clearAllow = document.getElementById('clearAllow');
const allowList = document.getElementById('allowList');
const allowMessage = document.getElementById('allowMessage');
const aggressiveEl = document.getElementById('aggressive');
const nudgeEnabledEl = document.getElementById('nudgeEnabled');
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
const digestDownloadBtn = document.getElementById('digestDownload');
const digestMessageEl = document.getElementById('digestMessage');
const alertEnabledEl = document.getElementById('alertEnabled');
const alertWebhookInput = document.getElementById('alertWebhook');
const alertSaveBtn = document.getElementById('alertSave');
const alertMessageEl = document.getElementById('alertMessage');
const alertConfigEl = document.querySelector('.alert-config');
const alertPlaceholderEl = document.getElementById('alertPlaceholder');
const tamperAlertEnabledEl = document.getElementById('tamperAlertEnabled');
const tamperMessageEl = document.getElementById('tamperMessage');
const approverPromptEnabledEl = document.getElementById('approverPromptEnabled');
const approverMessageEl = document.getElementById('approverMessage');
const parentProfileStatusEl = document.getElementById('parentProfileStatus');
const parentAllowlistStatusEl = document.getElementById('parentAllowlistStatus');
const parentBlocklistStatusEl = document.getElementById('parentBlocklistStatus');
const parentOverrideStatusEl = document.getElementById('parentOverrideStatus');
const parentAlertsStatusEl = document.getElementById('parentAlertsStatus');
const parentTamperStatusEl = document.getElementById('parentTamperStatus');
const parentApproverStatusEl = document.getElementById('parentApproverStatus');
const parentDigestStatusEl = document.getElementById('parentDigestStatus');
const parentFocusStatusEl = document.getElementById('parentFocusStatus');
const parentClassroomStatusEl = document.getElementById('parentClassroomStatus');
const parentModeBtn = document.getElementById('parentModeBtn');
const classroomModeBtn = document.getElementById('classroomModeBtn');
const parentTitleEl = document.querySelector('#cardParent .card__title');
const parentSubtitleEl = document.querySelector('#cardParent .card__subtitle');
const parentProfilesBtn = document.getElementById('parentProfilesBtn');
const parentAllowlistBtn = document.getElementById('parentAllowlistBtn');
const parentBlocklistBtn = document.getElementById('parentBlocklistBtn');
const parentOverrideBtn = document.getElementById('parentOverrideBtn');
const parentAlertsBtn = document.getElementById('parentAlertsBtn');
const parentTamperBtn = document.getElementById('parentTamperBtn');
const parentDigestBtn = document.getElementById('parentDigestBtn');
const parentFocusBtn = document.getElementById('parentFocusBtn');
const parentApproverBtn = document.getElementById('parentApproverBtn');
const parentClassroomBtn = document.getElementById('parentClassroomBtn');
const parentAlertsSectionEl = document.getElementById('parentAlertsSection');
const parentOverrideSectionEl = document.getElementById('parentOverrides');
const parentProfilesSectionEl = document.getElementById('parentProfilesSection');
const parentAllowlistSectionEl = document.getElementById('parentAllowlistSection');
const parentBlocklistSectionEl = document.getElementById('parentBlocklistSection');
const parentDigestSectionEl = document.getElementById('parentDigestSection');
const parentFocusSectionEl = document.getElementById('parentFocusSection');
const parentClassroomSectionEl = document.getElementById('parentClassroomSection');
const parentCardEl = document.getElementById('cardParent');
const parentPanelEl = document.querySelector('.parent-panel');
const parentBackBtn = document.getElementById('parentBackBtn');
const approverCardEl = document.getElementById('cardApprover');
const focusToggleEl = document.getElementById('focusToggle');
const focusDurationSelect = document.getElementById('focusDurationSelect');
const focusCountdownEl = document.getElementById('focusCountdown');
const focusEtaEl = document.getElementById('focusEta');
const focusMessageEl = document.getElementById('focusMessage');
const focusEndBtn = document.getElementById('focusEnd');
const focusPinEl = document.getElementById('focusPin');
const classroomToggleEl = document.getElementById('classroomToggle');
const classroomPlaylistsEl = document.getElementById('classroomPlaylists');
const classroomVideosEl = document.getElementById('classroomVideos');
const classroomSaveBtn = document.getElementById('classroomSave');
const classroomMessageEl = document.getElementById('classroomMessage');
const themeToggleBtn = document.getElementById('themeToggle');
const themeToggleIcon = document.getElementById('themeToggleIcon');

const TOUR_KEY = 'onboardingComplete';
const TOUR_STEPS = [
  {
    target: document.getElementById('cardProtection'),
    title: 'Enable core protection',
    body: 'Use the master toggle and aggressive mode to decide how Safeguard protects each site.'
  },
  {
    target: document.getElementById('parentAllowlistRow'),
    title: 'Allow trusted domains',
    body: 'Use the parent allowlist control to add intranet or learning portals that should bypass filtering.'
  },
  {
    target: document.getElementById('parentBlocklistRow'),
    title: 'Import policy blocklists',
    body: 'Paste domains or import exports from your policy team to block them across every user.'
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
let pinSetupPrompted = false;
let tamperAlertEnabled = false;
let profileDependentControlsLocked = true;
let parentCardMode = 'parent';
const FOCUS_ALLOWED_DURATIONS = [30, 45, 60, 2]; // includes 2 minutes for testing
let focusState = { active: false, endsAt: 0, durationMinutes: 45, pinProtected: false, remainingMs: 0 };
let focusDurationChoice = 45;
let focusPinPreference = false;
let focusTicker = null;
let focusBusy = false;
const CLASSROOM_DEFAULT = { enabled: false, playlists: [], videos: [] };
let classroomState = { ...CLASSROOM_DEFAULT };
let themePreference = cachedThemePreference;
let appliedTheme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
let syncTourComplete = null;
let localTourPending = null;
let tourDecisionMade = false;
if (parentAlertsSectionEl){
  parentAlertsSectionEl.dataset.expanded = parentAlertsSectionEl.dataset.expanded || '0';
}
if (parentOverrideSectionEl){
  parentOverrideSectionEl.dataset.expanded = parentOverrideSectionEl.dataset.expanded || '0';
}
if (parentProfilesSectionEl){
  parentProfilesSectionEl.dataset.expanded = parentProfilesSectionEl.dataset.expanded || '0';
}
if (parentAllowlistSectionEl){
  parentAllowlistSectionEl.dataset.expanded = parentAllowlistSectionEl.dataset.expanded || '0';
}
if (parentBlocklistSectionEl){
  parentBlocklistSectionEl.dataset.expanded = parentBlocklistSectionEl.dataset.expanded || '0';
}
if (parentDigestSectionEl){
  parentDigestSectionEl.dataset.expanded = parentDigestSectionEl.dataset.expanded || '0';
}
if (parentFocusSectionEl){
  parentFocusSectionEl.dataset.expanded = parentFocusSectionEl.dataset.expanded || '0';
}
if (parentClassroomSectionEl){
  parentClassroomSectionEl.dataset.expanded = parentClassroomSectionEl.dataset.expanded || '0';
}

if (profileApplyBtn) profileApplyBtn.disabled = true;
if (profileDetailsEl) profileDetailsEl.hidden = true;
setProfileMessage('Select a profile to preview recommended settings.', 'muted');
initThemeToggle();

function setStatus(enabled){
  if (!statusBadge) return;
  statusBadge.textContent = enabled ? 'Active' : 'Paused';
  statusBadge.classList.toggle('status--off', !enabled);
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

function setTamperMessage(text, tone = 'muted'){
  if (!tamperMessageEl) return;
  tamperMessageEl.textContent = text;
  tamperMessageEl.classList.remove('message--success', 'message--error');
  if (tone === 'success') tamperMessageEl.classList.add('message--success');
  else if (tone === 'error') tamperMessageEl.classList.add('message--error');
}

function setFocusMessage(text, tone = 'muted'){
  if (!focusMessageEl) return;
  focusMessageEl.textContent = text;
  focusMessageEl.classList.remove('message--success', 'message--error');
  if (tone === 'success') focusMessageEl.classList.add('message--success');
  else if (tone === 'error') focusMessageEl.classList.add('message--error');
}

function clampFocusDuration(minutes){
  const value = Number(minutes);
  if (FOCUS_ALLOWED_DURATIONS.includes(value)) return value;
  return FOCUS_ALLOWED_DURATIONS[1];
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

function formatFocusEta(ts){
  if (!ts) return '';
  const date = new Date(ts);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
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

function syncFocusTicker(active){
  if (focusTicker){
    clearInterval(focusTicker);
    focusTicker = null;
  }
  if (!active) return;
  focusTicker = setInterval(()=>{
    renderFocusCountdown();
  }, 1000);
}

function renderFocusCountdown(){
  if (!focusCountdownEl) return;
  const now = Date.now();
  if (!focusState.active || !focusState.endsAt || focusState.endsAt <= now){
    focusCountdownEl.textContent = 'Focus Mode is off';
    if (focusEtaEl) focusEtaEl.textContent = `Duration ${focusDurationChoice} minutes`;
    return;
  }
  const remaining = Math.max(0, focusState.endsAt - now);
  focusCountdownEl.textContent = formatFocusCountdown(remaining);
  if (focusEtaEl) focusEtaEl.textContent = `Ends ${formatFocusEta(focusState.endsAt)}`;
}

function renderFocusState(){
  const now = Date.now();
  const active = Boolean(focusState.active) && focusState.endsAt > now;
  if (active){
    focusState.remainingMs = Math.max(0, focusState.endsAt - now);
  }
  const durationLabel = `${focusDurationChoice} minutes`;
  if (focusToggleEl){
    focusToggleEl.checked = active;
    focusToggleEl.disabled = focusBusy;
  }
  if (focusDurationSelect){
    focusDurationSelect.value = String(focusDurationChoice);
    focusDurationSelect.disabled = focusBusy && active;
  }
  if (focusEndBtn){
    focusEndBtn.disabled = focusBusy || !active;
  }
  if (focusPinEl){
    focusPinEl.checked = active ? Boolean(focusState.pinProtected) : Boolean(focusPinPreference);
    focusPinEl.disabled = focusBusy;
  }
  renderFocusCountdown();
  if (focusEtaEl && !active){
    focusEtaEl.textContent = `Duration ${durationLabel}`;
  }
  if (active){
    setFocusMessage('Educational-only session running. Social, gaming, and streaming are blocked.', 'success');
  } else {
    setFocusMessage('Pick a duration and start homework mode.', 'muted');
  }
  updateParentSummaries();
  syncFocusTicker(active);
}

function applyFocusState(state){
  const now = Date.now();
  const active = Boolean(state && state.active && state.endsAt && state.endsAt > now);
  const duration = clampFocusDuration(state && state.durationMinutes ? state.durationMinutes : focusDurationChoice);
  const endsAt = state && state.endsAt ? Number(state.endsAt) : 0;
  focusState = {
    active,
    endsAt: active ? endsAt : 0,
    durationMinutes: duration,
    pinProtected: Boolean(state && state.pinProtected),
    remainingMs: state && state.remainingMs ? Number(state.remainingMs) : 0
  };
  if (active && !focusState.endsAt && focusState.remainingMs){
    focusState.endsAt = now + focusState.remainingMs;
  }
  focusDurationChoice = duration || focusDurationChoice;
  renderFocusState();
}

async function refreshFocusState(){
  const resp = await sendMessagePromise({ type: 'sg-focus-get-state' });
  if (resp && resp.ok && resp.state){
    applyFocusState(resp.state);
  } else {
    renderFocusState();
  }
}

async function ensureFocusPinAvailable(){
  if (storedPin) return true;
  const newPin = await promptForNewPin();
  if (!newPin) return false;
  storedPin = newPin;
  const payload = {
    overridePinHash: newPin.hash,
    overridePinSalt: newPin.salt,
    overridePinIterations: newPin.iterations
  };
  if (requirePinEl && requirePinEl.checked){
    payload.requirePin = true;
  }
  await new Promise((resolve)=>chrome.storage.local.set(payload, resolve));
  syncPinControls();
  setPinMessage((requirePinEl && requirePinEl.checked) ? 'PIN required for overrides and allowlist edits.' : 'PIN saved for overrides and Focus Mode.', 'success');
  return true;
}

async function startFocusFromUi(){
  if (focusBusy){
    renderFocusState();
    return;
  }
  focusBusy = true;
  renderFocusState();
  const wantsPin = focusPinEl ? focusPinEl.checked : false;
  if (wantsPin){
    const ok = await ensureFocusPinAvailable();
    if (!ok){
      focusBusy = false;
      if (focusToggleEl) focusToggleEl.checked = false;
      renderFocusState();
      return;
    }
  }
  focusPinPreference = Boolean(wantsPin);
  chrome.storage.local.set({ focusPinPreference, focusDurationMinutes: focusDurationChoice });
  setFocusMessage('Starting Focus Mode…', 'muted');
  const resp = await sendMessagePromise({
    type: 'sg-focus-start',
    durationMinutes: focusDurationChoice,
    pinProtected: wantsPin
  });
  focusBusy = false;
  if (!resp || !resp.ok){
    setFocusMessage('Could not start Focus Mode. Try again.', 'error');
    if (focusToggleEl) focusToggleEl.checked = false;
    renderFocusState();
    return;
  }
  applyFocusState(resp.state);
  setFocusMessage('Focus Mode running. Educational sites only.', 'success');
}

async function stopFocusFromUi(){
  if (!focusState.active){
    applyFocusState({ active: false, durationMinutes: focusDurationChoice });
    return;
  }
  if (focusBusy){
    renderFocusState();
    return;
  }
  focusBusy = true;
  renderFocusState();
  if (focusState.pinProtected){
    const { ok, cancelled } = await requestPinConfirmation('Enter your PIN to end Focus Mode');
    if (!ok){
      focusBusy = false;
      if (focusToggleEl) focusToggleEl.checked = true;
      renderFocusState();
      if (cancelled){
        setFocusMessage('Focus Mode stays on.', 'muted');
      } else {
        setFocusMessage('Incorrect PIN.', 'error');
      }
      return;
    }
  }
  setFocusMessage('Ending Focus Mode…', 'muted');
  const resp = await sendMessagePromise({ type: 'sg-focus-stop' });
  focusBusy = false;
  if (!resp || !resp.ok){
    setFocusMessage('Could not end Focus Mode. Try again.', 'error');
    if (focusToggleEl) focusToggleEl.checked = true;
    renderFocusState();
    return;
  }
  applyFocusState(resp.state);
  if (focusToggleEl) focusToggleEl.checked = false;
  setFocusMessage('Focus Mode ended. Normal protection resumes.', 'muted');
}

function updateAlertAvailability(){
  profileDependentControlsLocked = !appliedProfileId;
  const disable = profileDependentControlsLocked;
  if (alertConfigEl) alertConfigEl.hidden = disable;
  if (alertPlaceholderEl) alertPlaceholderEl.hidden = !disable;
  if (parentAlertsSectionEl){
    if (disable){
      parentAlertsSectionEl.hidden = true;
    } else if (parentAlertsSectionEl.dataset.expanded === '1'){
      parentAlertsSectionEl.hidden = false;
    }
  }
  if (disable){
    updateParentSummaries();
    return;
  }
  if (alertEnabledEl){
    alertEnabledEl.disabled = false;
    alertEnabledEl.checked = overrideAlertsEnabled;
    const wrap = alertEnabledEl.closest('.toggle');
    if (wrap) wrap.classList.toggle('toggle--disabled', false);
  }
  if (alertWebhookInput) alertWebhookInput.disabled = false;
  if (alertSaveBtn) alertSaveBtn.disabled = false;
  if (tamperAlertEnabledEl){
    tamperAlertEnabledEl.disabled = false;
    tamperAlertEnabledEl.checked = tamperAlertEnabled;
    const wrap = tamperAlertEnabledEl.closest('.toggle');
    if (wrap) wrap.classList.toggle('toggle--disabled', false);
  }
  setAlertMessage(overrideAlertsEnabled ? 'Alerts enabled. Overrides will notify your webhook.' : 'Alerts stay on-device until you enable them.', overrideAlertsEnabled ? 'success' : 'muted');
  setTamperMessage(tamperAlertEnabled ? 'Tamper alerts enabled. Safeguard will send a webhook if it goes offline.' : 'Tamper alerts monitor for missed heartbeats.', tamperAlertEnabled ? 'success' : 'muted');
  updateParentSummaries();
}

function setApproverMessage(text, tone = 'muted'){
  if (!approverMessageEl) return;
  approverMessageEl.textContent = text;
  approverMessageEl.classList.remove('message--success', 'message--error');
  if (tone === 'success') approverMessageEl.classList.add('message--success');
  else if (tone === 'error') approverMessageEl.classList.add('message--error');
  updateParentSummaries();
}

function setClassroomMessage(text, tone = 'muted'){
  if (!classroomMessageEl) return;
  classroomMessageEl.textContent = text;
  classroomMessageEl.classList.remove('message--success', 'message--error');
  if (tone === 'success') classroomMessageEl.classList.add('message--success');
  else if (tone === 'error') classroomMessageEl.classList.add('message--error');
}

function updateParentSummaries(){
  if (parentProfileStatusEl){
    const appliedProfile = appliedProfileId ? findProfile(appliedProfileId) : null;
    if (appliedProfile){
      parentProfileStatusEl.textContent = `${appliedProfile.label || appliedProfile.id} applied`;
    } else {
      parentProfileStatusEl.textContent = 'Custom settings (no profile applied)';
    }
  }
  if (parentAlertsStatusEl){
    let text = 'Disabled';
    if (profileDependentControlsLocked){
      text = 'Locked (apply profile first)';
    } else if (overrideAlertsEnabled){
      text = overrideAlertWebhook ? 'Enabled (webhook saved)' : 'Enabled (add webhook)';
    }
    parentAlertsStatusEl.textContent = text;
  }
  if (parentTamperStatusEl){
    const locked = profileDependentControlsLocked;
    parentTamperStatusEl.textContent = locked ? 'Locked (apply profile first)' : (tamperAlertEnabled ? 'Enabled' : 'Disabled');
  }
  if (parentApproverStatusEl){
    parentApproverStatusEl.textContent = approverPromptEnabled ? 'Names required for overrides' : 'Prompt disabled';
  }
  if (parentFocusStatusEl){
    if (focusState.active && focusState.endsAt){
      const mins = focusState.durationMinutes || Math.round((focusState.remainingMs || 0) / 60000);
      parentFocusStatusEl.textContent = `Running (${mins} min)`;
    } else {
      parentFocusStatusEl.textContent = 'Off';
    }
  }
  if (parentClassroomStatusEl){
    parentClassroomStatusEl.textContent = classroomState.enabled ? 'Active (locks social/gaming/YouTube)' : 'Off';
  }
  if (parentOverrideStatusEl){
    const count = Array.isArray(currentOverrideLog) ? currentOverrideLog.length : 0;
    parentOverrideStatusEl.textContent = count ? `${count} recorded` : 'No overrides recorded yet';
  }
  if (parentAllowlistStatusEl){
    const count = Array.isArray(currentAllowlist) ? currentAllowlist.length : 0;
    parentAllowlistStatusEl.textContent = count ? `${count} domain${count === 1 ? '' : 's'}` : 'No domains yet';
  }
  if (parentBlocklistStatusEl){
    const count = Array.isArray(currentBlocklist) ? currentBlocklist.length : 0;
    parentBlocklistStatusEl.textContent = count ? `${count} domain${count === 1 ? '' : 's'}` : 'No domains yet';
  }
  if (parentDigestStatusEl){
    parentDigestStatusEl.textContent = 'Download the weekly CSV summary';
  }
}

function renderClassroomState(){
  if (classroomToggleEl) classroomToggleEl.checked = Boolean(classroomState.enabled);
  if (classroomPlaylistsEl) classroomPlaylistsEl.value = (classroomState.playlists || []).join('\n');
  if (classroomVideosEl) classroomVideosEl.value = (classroomState.videos || []).join('\n');
  if (classroomState.enabled){
    if (classroomState.videos && classroomState.videos.length){
      setClassroomMessage(`Classroom mode on. Only ${classroomState.videos.length} saved video${classroomState.videos.length === 1 ? '' : 's'} are allowed.`, 'success');
    } else {
      setClassroomMessage(classroomState.playlists.length ? 'Classroom mode on. Only saved YouTube playlists are allowed.' : 'Classroom mode on. YouTube is blocked unless on an approved playlist.', 'success');
    }
  } else {
    setClassroomMessage('Classroom mode is off. Save playlist IDs before enabling.', 'muted');
  }
  updateParentSummaries();
}

function persistClassroomState(nextState){
  classroomState = {
    ...classroomState,
    ...nextState,
    playlists: sanitizePlaylistIds((nextState && nextState.playlists) || classroomState.playlists),
    videos: sanitizeVideoIds((nextState && nextState.videos) || classroomState.videos)
  };
  return new Promise((resolve)=>chrome.storage.local.set({ classroomMode: classroomState }, ()=>{
    renderClassroomState();
    resolve();
  }));
}

function collapseParentSections(activeKey){
  const keys = Array.isArray(activeKey) ? activeKey : [activeKey];
  const set = new Set(keys.filter(Boolean));
  const sections = [
    ['profiles', parentProfilesSectionEl],
    ['override', parentOverrideSectionEl],
    ['allowlist', parentAllowlistSectionEl],
    ['blocklist', parentBlocklistSectionEl],
    ['alerts', parentAlertsSectionEl],
    ['digest', parentDigestSectionEl],
    ['focus', parentFocusSectionEl],
    ['classroom', parentClassroomSectionEl]
  ];
  sections.forEach(([key, el])=>{
    if (!el) return;
    if (set.has(key)) return;
    el.hidden = true;
    el.dataset.expanded = '0';
    el.classList.remove('parent-section--active');
  });
}

function showParentOverview(){
  collapseParentSections();
  if (parentPanelEl) parentPanelEl.hidden = false;
  if (parentBackBtn) parentBackBtn.hidden = true;
  document.body.classList.remove('parent-section-active');
  scrollToCard(parentCardEl);
}

function expandParentProfilesSection(){
  if (!parentProfilesSectionEl) return;
  collapseParentSections('profiles');
  parentProfilesSectionEl.dataset.expanded = '1';
  parentProfilesSectionEl.hidden = false;
  parentProfilesSectionEl.classList.add('parent-section--active');
  if (parentPanelEl) parentPanelEl.hidden = true;
  if (parentBackBtn) parentBackBtn.hidden = false;
  document.body.classList.add('parent-section-active');
  scrollToCard(parentProfilesSectionEl);
}

function expandParentOverrideSection(){
  if (!parentOverrideSectionEl) return;
  collapseParentSections('override');
  parentOverrideSectionEl.dataset.expanded = '1';
  parentOverrideSectionEl.hidden = false;
  parentOverrideSectionEl.classList.add('parent-section--active');
  if (parentPanelEl) parentPanelEl.hidden = true;
  if (parentBackBtn) parentBackBtn.hidden = false;
  document.body.classList.add('parent-section-active');
  scrollToCard(parentOverrideSectionEl);
}

function expandParentAllowlistSection(){
  if (!parentAllowlistSectionEl) return;
  collapseParentSections('allowlist');
  parentAllowlistSectionEl.dataset.expanded = '1';
  parentAllowlistSectionEl.hidden = false;
  parentAllowlistSectionEl.classList.add('parent-section--active');
  if (parentPanelEl) parentPanelEl.hidden = true;
  if (parentBackBtn) parentBackBtn.hidden = false;
  document.body.classList.add('parent-section-active');
  scrollToCard(parentAllowlistSectionEl);
}

function expandParentBlocklistSection(){
  if (!parentBlocklistSectionEl) return;
  collapseParentSections('blocklist');
  parentBlocklistSectionEl.dataset.expanded = '1';
  parentBlocklistSectionEl.hidden = false;
  parentBlocklistSectionEl.classList.add('parent-section--active');
  if (parentPanelEl) parentPanelEl.hidden = true;
  if (parentBackBtn) parentBackBtn.hidden = false;
  document.body.classList.add('parent-section-active');
  scrollToCard(parentBlocklistSectionEl);
}

function expandParentAlertsSection(){
  if (!parentAlertsSectionEl) return;
  collapseParentSections('alerts');
  parentAlertsSectionEl.dataset.expanded = '1';
  if (!profileDependentControlsLocked){
    parentAlertsSectionEl.hidden = false;
  }
  parentAlertsSectionEl.classList.add('parent-section--active');
  if (parentPanelEl) parentPanelEl.hidden = true;
  if (parentBackBtn) parentBackBtn.hidden = false;
  document.body.classList.add('parent-section-active');
  scrollToCard(parentAlertsSectionEl);
}

function expandParentDigestSection(){
  if (!parentDigestSectionEl) return;
  collapseParentSections('digest');
  parentDigestSectionEl.dataset.expanded = '1';
  parentDigestSectionEl.hidden = false;
  parentDigestSectionEl.classList.add('parent-section--active');
  if (parentPanelEl) parentPanelEl.hidden = true;
  if (parentBackBtn) parentBackBtn.hidden = false;
  document.body.classList.add('parent-section-active');
  scrollToCard(parentDigestSectionEl);
}

function expandParentFocusSection(){
  if (!parentFocusSectionEl) return;
  collapseParentSections('focus');
  parentFocusSectionEl.dataset.expanded = '1';
  parentFocusSectionEl.hidden = false;
  parentFocusSectionEl.classList.add('parent-section--active');
  if (parentPanelEl) parentPanelEl.hidden = true;
  if (parentBackBtn) parentBackBtn.hidden = false;
  document.body.classList.add('parent-section-active');
  scrollToCard(parentFocusSectionEl);
}

function expandParentClassroomSection(){
  if (!parentClassroomSectionEl) return;
  collapseParentSections('classroom');
  parentClassroomSectionEl.dataset.expanded = '1';
  parentClassroomSectionEl.hidden = false;
  parentClassroomSectionEl.classList.add('parent-section--active');
  if (parentPanelEl) parentPanelEl.hidden = true;
  if (parentBackBtn) parentBackBtn.hidden = false;
  document.body.classList.add('parent-section-active');
  scrollToCard(parentClassroomSectionEl);
}

function scrollToCard(el){
  if (!el) return;
  el.scrollIntoView({ behavior: 'instant', block: 'start' });
}

function setParentToggleState(mode){
  if (parentModeBtn) parentModeBtn.classList.toggle('parent-toggle__button--active', mode === 'parent');
  if (classroomModeBtn) classroomModeBtn.classList.toggle('parent-toggle__button--active', mode === 'classroom');
}

function setParentCardMode(mode){
  parentCardMode = mode === 'classroom' ? 'classroom' : 'parent';
  setParentToggleState(parentCardMode);
  if (parentTitleEl){
    parentTitleEl.textContent = parentCardMode === 'classroom' ? 'Classroom mode' : 'Parent mode';
  }
  if (parentSubtitleEl){
    parentSubtitleEl.textContent = parentCardMode === 'classroom'
      ? 'Teacher controls for quick classroom lockdown.'
      : 'Quick access to safeguarding controls for guardians and DSLs.';
  }
  if (parentCardMode === 'classroom'){
    collapseParentSections('classroom');
    if (parentPanelEl) parentPanelEl.hidden = true;
    document.body.classList.add('parent-section-active');
    expandParentClassroomSection();
  } else {
    showParentOverview();
  }
  ensureParentCardVisible();
}

function ensureParentCardVisible(){
  if (!parentCardEl) return;
  if (parentCardEl.hidden){
    parentCardEl.hidden = false;
    setParentToggleState(parentCardMode);
  }
  if (parentBackBtn) parentBackBtn.hidden = false;
  const protectionCard = document.getElementById('cardProtection');
  if (protectionCard) protectionCard.hidden = true;
}

function hideParentCard(){
  if (!parentCardEl) return;
  parentCardEl.hidden = true;
  const protectionCard = document.getElementById('cardProtection');
  if (protectionCard) protectionCard.hidden = false;
  if (parentBackBtn) parentBackBtn.hidden = true;
  setParentToggleState('');
}

function ensureApproverCardVisible(){
  if (!approverCardEl) return;
  if (approverCardEl.hidden){
    approverCardEl.hidden = false;
  }
}

if (parentModeBtn){
  parentModeBtn.addEventListener('click', ()=>{
    setParentCardMode('parent');
  });
}

if (classroomModeBtn){
  classroomModeBtn.addEventListener('click', ()=>{
    setParentCardMode('classroom');
  });
}

if (parentBackBtn){
  parentBackBtn.addEventListener('click', ()=>{
    if (parentCardMode === 'classroom'){
      setParentCardMode('parent');
    } else {
      hideParentCard();
    }
  });
}

if (parentFocusBtn){
  parentFocusBtn.addEventListener('click', ()=>{
    expandParentFocusSection();
    scrollToCard(parentFocusSectionEl);
  });
}

if (parentClassroomBtn){
  parentClassroomBtn.addEventListener('click', ()=>{
    expandParentClassroomSection();
    scrollToCard(parentClassroomSectionEl);
  });
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

function ensurePinAfterOnboarding(){
  if (pinSetupPrompted || storedPin) return;
  pinSetupPrompted = true;
  setTimeout(async ()=>{
    if (storedPin) return;
    const newPin = await promptForNewPin();
    if (!newPin){
      setPinMessage('Safeguard needs a PIN to secure overrides. You can set one anytime from the Protection card.', 'error');
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
    setPinMessage('PIN saved. Safeguard will request it for protection controls and overrides.', 'success');
  }, 250);
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
  updateParentSummaries();
}

function renderOverrideLog(list){
  currentOverrideLog = Array.isArray(list) ? [...list] : [];
  if (!overrideListEl){
    updateParentSummaries();
    return;
  }
  overrideListEl.innerHTML = '';
  if (!currentOverrideLog.length){
    setOverrideMessage('No overrides recorded yet.', 'muted');
    updateParentSummaries();
    return;
  }
  const reversed = [...currentOverrideLog].reverse();
  const verdictLabels = {
    escalate: 'Escalate ASAP',
    review: 'Needs review',
    allow: 'Low risk'
  };
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
    if (entry.policyReview){
      const policy = entry.policyReview;
      const verdictWrap = document.createElement('div');
      verdictWrap.className = 'log-item__policy';
      const badge = document.createElement('span');
      const verdictKey = typeof policy.verdict === 'string' ? policy.verdict : 'allow';
      badge.className = `review-badge review-badge--${verdictKey}`;
      badge.textContent = verdictLabels[verdictKey] || verdictKey;
      verdictWrap.appendChild(badge);
      if (typeof policy.score === 'number' && !Number.isNaN(policy.score)){
        const score = document.createElement('span');
        score.className = 'review-score';
        score.textContent = `Score: ${Math.round(policy.score)}`;
        verdictWrap.appendChild(score);
      }
      li.appendChild(verdictWrap);
      if (Array.isArray(policy.factors) && policy.factors.length){
        const factorList = document.createElement('ul');
        factorList.className = 'log-item__factors';
        policy.factors.slice(0, 3).forEach((factor)=>{
          if (!factor) return;
          const item = document.createElement('li');
          const label = factor.label || factor.code || 'Unknown factor';
          if (typeof factor.weight === 'number' && !Number.isNaN(factor.weight)){
            const weight = factor.weight >= 0 ? `+${factor.weight}` : `${factor.weight}`;
            item.textContent = `${label} (${weight})`;
          } else {
            item.textContent = label;
          }
          factorList.appendChild(item);
        });
        li.appendChild(factorList);
      }
    }
    if (entry.heuristics && (entry.heuristics.riskScore !== null || entry.heuristics.riskThreshold !== null)){
      const heurWrap = document.createElement('div');
      heurWrap.className = 'log-item__heuristics';
      const scoreLabel = document.createElement('span');
      const riskScore = (entry.heuristics.riskScore !== null && entry.heuristics.riskScore !== undefined)
        ? Math.round(entry.heuristics.riskScore)
        : null;
      const threshold = (entry.heuristics.riskThreshold !== null && entry.heuristics.riskThreshold !== undefined)
        ? Math.round(entry.heuristics.riskThreshold)
        : null;
      scoreLabel.textContent = `Heuristic: ${riskScore !== null ? riskScore : '—'} vs threshold ${threshold !== null ? threshold : '—'}`;
      heurWrap.appendChild(scoreLabel);
      if (Array.isArray(entry.heuristics.signals) && entry.heuristics.signals.length){
        const sigLabel = document.createElement('span');
        const topSignals = entry.heuristics.signals.slice(0, 2).map((signal)=>signal && signal.label ? signal.label : signal.id).filter(Boolean);
        if (topSignals.length){
          sigLabel.textContent = `Signals: ${topSignals.join(', ')}`;
          heurWrap.appendChild(sigLabel);
        }
      }
      li.appendChild(heurWrap);
    }
    overrideListEl.appendChild(li);
  });
  setOverrideMessage(`Logged ${currentOverrideLog.length} override${currentOverrideLog.length === 1 ? '' : 's'}.`, 'muted');
  updateParentSummaries();
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
  updateAlertAvailability();
  updateParentSummaries();
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
  updateAlertAvailability();
  updateParentSummaries();
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
  const safeSuggestions = sanitizeSuggestions(profile.safeSuggestions);
  await new Promise((resolve)=>chrome.storage.sync.set({
    allowlist: allowDomains,
    sensitivity: profile.sensitivity,
    aggressive: Boolean(profile.aggressive),
    selectedProfileId: profile.id,
    profileTone: profile.tone || null,
    profileLabel: profile.label || profile.id,
    profileSafeSuggestions: safeSuggestions
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
  updateAlertAvailability();
  updateParentSummaries();
  setTimeout(()=>{
    const applied = findProfile(appliedProfileId);
    if (applied){
      setProfileMessage(`Applied profile: ${applied.label || applied.id}.`, 'muted');
    }
  }, 2500);
}

chrome.storage.sync.get({
  enabled:true,
  allowlist:[],
  aggressive:false,
  nudgeEnabled:true,
  sensitivity:60,
  selectedProfileId: null,
  profileTone: null,
  profileLabel: null,
  profileSafeSuggestions: [],
  [TOUR_KEY]: false
}, (cfg)=>{
  enabledEl.checked = cfg.enabled;
  setStatus(Boolean(cfg.enabled));
  render(cfg.allowlist||[]);
  setAllowMessage((cfg.allowlist && cfg.allowlist.length) ? 'Allowlisted domains' : 'Enter hostnames without http/https.');
  currentAggressive = Boolean(cfg.aggressive);
  aggressiveEl.checked = currentAggressive;
  if (nudgeEnabledEl) nudgeEnabledEl.checked = cfg.nudgeEnabled !== false;
  if (typeof cfg.sensitivity === 'number'){
    currentSensitivity = cfg.sensitivity;
    sensitivityEl.value = String(currentSensitivity);
    updateSensitivityDisplay(currentSensitivity);
  }
  appliedProfileId = cfg.selectedProfileId || null;
  syncTourComplete = Boolean(cfg[TOUR_KEY]);
  renderProfileOptions();
  updateAlertAvailability();
  updateParentSummaries();
  maybeStartTour();
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
  approverPromptEnabled: false,
  tamperAlertEnabled: false,
  focusPinPreference: false,
  focusDurationMinutes: 45,
  classroomMode: CLASSROOM_DEFAULT,
  [TOUR_PENDING_KEY]: false
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
  tamperAlertEnabled = Boolean(cfg.tamperAlertEnabled);
  if (tamperAlertEnabledEl) tamperAlertEnabledEl.checked = tamperAlertEnabled;
  setTamperMessage(tamperAlertEnabled ? 'Tamper alerts enabled. Safeguard will send a webhook if it goes offline.' : 'Tamper alerts monitor for missed heartbeats.', tamperAlertEnabled ? 'success' : 'muted');
  approverPromptEnabled = Boolean(cfg.approverPromptEnabled);
  if (approverPromptEnabledEl) approverPromptEnabledEl.checked = approverPromptEnabled;
  setApproverMessage(approverPromptEnabled ? 'Approver prompt enabled. Staff must enter their name when overriding.' : 'Enable to record who approves each override.', approverPromptEnabled ? 'success' : 'muted');
  focusPinPreference = Boolean(cfg.focusPinPreference);
  focusDurationChoice = clampFocusDuration(cfg.focusDurationMinutes || focusDurationChoice);
  renderFocusState();
  refreshFocusState();
  classroomState = { ...CLASSROOM_DEFAULT, ...(cfg.classroomMode || {}) };
  classroomState.playlists = sanitizePlaylistIds(classroomState.playlists);
  classroomState.videos = sanitizeVideoIds(classroomState.videos);
  renderClassroomState();
  updateAlertAvailability();
  updateParentSummaries();
  localTourPending = Boolean(cfg[TOUR_PENDING_KEY]);
  maybeStartTour();
});

enabledEl.addEventListener('change', async ()=>{
  const wantsEnabled = enabledEl.checked;
  if (!wantsEnabled && requirePinEl && requirePinEl.checked){
    if (!storedPin){
      setPinMessage('Set a PIN to guard protection toggles.', 'error');
      enabledEl.checked = true;
      setStatus(true);
      return;
    }
    const { ok, cancelled } = await requestPinConfirmation('Enter your PIN to pause Safeguard protection');
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
  markProfileCustomised();
});

nudgeEnabledEl.addEventListener('change', ()=>{
  chrome.storage.sync.set({ nudgeEnabled: Boolean(nudgeEnabledEl.checked) });
});

sensitivityEl.addEventListener('input', ()=>{
  const v = Math.max(10, Math.min(100, Number(sensitivityEl.value)||60));
  chrome.storage.sync.set({ sensitivity: v });
  updateSensitivityDisplay(v);
  markProfileCustomised();
});

if (focusDurationSelect){
  focusDurationSelect.addEventListener('change', ()=>{
    const minutes = clampFocusDuration(focusDurationSelect.value);
    focusDurationChoice = minutes;
    chrome.storage.local.set({ focusDurationMinutes: minutes });
    renderFocusState();
  });
}

if (focusToggleEl){
  focusToggleEl.addEventListener('change', ()=>{
    if (focusToggleEl.checked){
      startFocusFromUi();
    } else {
      stopFocusFromUi();
    }
  });
}

if (focusEndBtn){
  focusEndBtn.addEventListener('click', ()=>{
    stopFocusFromUi();
  });
}

if (focusPinEl){
  focusPinEl.addEventListener('change', async ()=>{
    focusPinPreference = focusPinEl.checked;
    if (focusPinPreference){
      const ok = await ensureFocusPinAvailable();
      if (!ok){
        focusPinPreference = false;
        focusPinEl.checked = false;
      }
    }
    chrome.storage.local.set({ focusPinPreference });
    renderFocusState();
  });
}

if (classroomToggleEl){
  classroomToggleEl.addEventListener('change', async ()=>{
    const enabled = classroomToggleEl.checked;
    await persistClassroomState({ enabled });
    if (enabled && requirePinEl){
      requirePinEl.checked = false;
      chrome.storage.local.set({ requirePin: false });
      setPinMessage('Overrides disabled while Classroom mode is on.', 'muted');
      syncPinControls();
    }
  });
}

if (classroomSaveBtn){
  classroomSaveBtn.addEventListener('click', async ()=>{
    const ids = sanitizePlaylistIds(classroomPlaylistsEl ? classroomPlaylistsEl.value.split(/\r?\n/) : []);
    const vids = sanitizeVideoIds(classroomVideosEl ? classroomVideosEl.value.split(/\r?\n/) : []);
    await persistClassroomState({ playlists: ids, videos: vids });
    if (vids.length){
      setClassroomMessage(`Saved ${vids.length} video${vids.length === 1 ? '' : 's'}.`, 'success');
    } else if (!ids.length){
      setClassroomMessage('Saved. YouTube stays blocked in Classroom mode until you add playlist or video IDs.', 'muted');
    } else {
      setClassroomMessage(`Saved ${ids.length} playlist${ids.length === 1 ? '' : 's'}.`, 'success');
    }
  });
}

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

function sanitizeSuggestions(list){
  const entries = [];
  (Array.isArray(list) ? list : []).forEach((item)=>{
    const text = String(item || '').trim();
    if (!text) return;
    if (entries.length >= 3) return;
    entries.push(text);
  });
  return entries;
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

function extractPlaylistId(value){
  const raw = String(value || '').trim();
  if (!raw) return null;
  // Accept direct IDs or URLs with list= param
  const urlMatch = raw.match(/list=([A-Za-z0-9_-]+)/);
  if (urlMatch && urlMatch[1]) return urlMatch[1];
  if (/^[A-Za-z0-9_-]{10,}$/.test(raw)) return raw;
  return null;
}

function sanitizePlaylistIds(list){
  const out = [];
  const seen = new Set();
  (Array.isArray(list) ? list : String(list || '').split(/\r?\n/)).forEach((item)=>{
    const id = extractPlaylistId(item);
    if (!id) return;
    if (seen.has(id)) return;
    seen.add(id);
    out.push(id);
  });
  return out;
}

function sanitizeVideoIds(list){
  const out = [];
  const seen = new Set();
  (Array.isArray(list) ? list : String(list || '').split(/\r?\n/)).forEach((item)=>{
    const id = String(item || '').trim();
    if (!id) return;
    const match = id.match(/v=([A-Za-z0-9_-]{6,})/);
    const clean = match && match[1] ? match[1] : (/^[A-Za-z0-9_-]{6,}$/.test(id) ? id : null);
    if (!clean) return;
    if (seen.has(clean)) return;
    seen.add(clean);
    out.push(clean);
  });
  return out;
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
    updateParentSummaries();
  });
});

clearBlocklist.addEventListener('click', ()=>{
  chrome.storage.local.set({ userBlocklist: [] }, ()=>{
    currentBlocklist = [];
    updateBlockCount(0);
    setBlockMessage('Blocklist cleared.', 'muted');
    updateMetrics();
    markProfileCustomised();
    updateParentSummaries();
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
        updateParentSummaries();
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
      updateAlertAvailability();
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
      updateParentSummaries();
    });
  });
}


if (tamperAlertEnabledEl){
  tamperAlertEnabledEl.addEventListener('change', async ()=>{
    const wantsEnable = tamperAlertEnabledEl.checked;
    if (!(await ensureAlertPinAuthorization(wantsEnable ? 'enable tamper alerts' : 'disable tamper alerts'))){
      tamperAlertEnabledEl.checked = tamperAlertEnabled;
      return;
    }
    tamperAlertEnabled = wantsEnable;
    chrome.storage.local.set({ tamperAlertEnabled }, ()=>{
      setTamperMessage(tamperAlertEnabled ? 'Tamper alerts enabled. Safeguard will send a webhook if it goes offline.' : 'Tamper alerts monitor for missed heartbeats.', tamperAlertEnabled ? 'success' : 'muted');
      updateAlertAvailability();
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
      setApproverMessage(approverPromptEnabled ? 'Approver prompt enabled. Staff must enter their name when overriding.' : 'Enable to record who approves each override.', approverPromptEnabled ? 'success' : 'muted');
    });
  });
}

if (parentOverrideBtn){
  parentOverrideBtn.addEventListener('click', ()=>{
    ensureParentCardVisible();
    scrollToCard(parentCardEl);
    expandParentOverrideSection();
    const overridesCard = document.getElementById('parentOverrides');
    if (overridesCard) overridesCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

if (parentAllowlistBtn){
  parentAllowlistBtn.addEventListener('click', ()=>{
    ensureParentCardVisible();
    scrollToCard(parentCardEl);
    expandParentAllowlistSection();
    const section = document.getElementById('parentAllowlistSection');
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

if (parentBlocklistBtn){
  parentBlocklistBtn.addEventListener('click', ()=>{
    ensureParentCardVisible();
    scrollToCard(parentCardEl);
    expandParentBlocklistSection();
    const section = document.getElementById('parentBlocklistSection');
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

if (parentProfilesBtn){
  parentProfilesBtn.addEventListener('click', ()=>{
    ensureParentCardVisible();
    scrollToCard(parentCardEl);
    expandParentProfilesSection();
    const profilesSection = document.getElementById('parentProfilesSection');
    if (profilesSection) profilesSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

if (parentAlertsBtn){
  parentAlertsBtn.addEventListener('click', ()=>{
    ensureParentCardVisible();
    scrollToCard(parentCardEl);
    expandParentAlertsSection();
    const alertsSection = document.getElementById('parentAlertsSection');
    if (alertsSection) alertsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

if (parentTamperBtn){
  parentTamperBtn.addEventListener('click', ()=>{
    ensureParentCardVisible();
    scrollToCard(parentCardEl);
    expandParentAlertsSection();
    const alertsSection = document.getElementById('parentAlertsSection');
    if (alertsSection) alertsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

if (parentDigestBtn){
  parentDigestBtn.addEventListener('click', ()=>{
    ensureParentCardVisible();
    scrollToCard(parentCardEl);
    expandParentDigestSection();
    const digestSection = document.getElementById('parentDigestSection');
    if (digestSection) digestSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

if (parentApproverBtn){
  parentApproverBtn.addEventListener('click', ()=>{
    ensureApproverCardVisible();
    scrollToCard(approverCardEl);
  });
}

updateParentSummaries();

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
  if (area === 'sync' && changes[THEME_KEY]){
    applyThemePreference(changes[THEME_KEY].newValue || 'system');
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
    updateAlertAvailability();
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
    updateAlertAvailability();
  }
  if (area === 'local' && changes.overrideAlertWebhook){
    overrideAlertWebhook = typeof changes.overrideAlertWebhook.newValue === 'string' ? changes.overrideAlertWebhook.newValue : '';
    if (alertWebhookInput) alertWebhookInput.value = overrideAlertWebhook;
    updateParentSummaries();
  }
  if (area === 'local' && changes.focusMode){
    refreshFocusState();
  }
  if (area === 'local' && changes.focusDurationMinutes){
    focusDurationChoice = clampFocusDuration(changes.focusDurationMinutes.newValue || focusDurationChoice);
    renderFocusState();
  }
  if (area === 'local' && changes.focusPinPreference){
    focusPinPreference = Boolean(changes.focusPinPreference.newValue);
    renderFocusState();
  }
  if (area === 'local' && changes.tamperAlertEnabled){
    tamperAlertEnabled = Boolean(changes.tamperAlertEnabled.newValue);
    if (tamperAlertEnabledEl) tamperAlertEnabledEl.checked = tamperAlertEnabled;
    setTamperMessage(tamperAlertEnabled ? 'Tamper alerts enabled. Safeguard will send a webhook if it goes offline.' : 'Tamper alerts monitor for missed heartbeats.', tamperAlertEnabled ? 'success' : 'muted');
    updateAlertAvailability();
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
    appliedProfileId = null;
    chrome.storage.sync.set({
      selectedProfileId: null,
      profileTone: null,
      profileLabel: null,
      profileSafeSuggestions: []
    }, ()=>{
      clearProfileSelection();
      setProfileMessage('Profile selection cleared. Current settings stay as-is.', 'success');
    });
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
      if (parentDigestStatusEl){
        parentDigestStatusEl.textContent = 'Downloaded just now';
      }
    } catch(_e){
      setDigestMessage('Failed to build digest.', 'error');
    }
  });
}

loadProfiles();
