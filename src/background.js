// Service worker orchestrates DNR rules, badge state, heartbeat checks, and focus-mode timers.
// Cross-browser shim: Firefox exposes `browser` (Promise-based); Chrome/Edge/Safari expose `chrome`.
// Both also expose `chrome` as an alias, so callback-style calls work everywhere.
if (typeof globalThis.chrome === 'undefined' && typeof globalThis.browser !== 'undefined') {
  globalThis.chrome = globalThis.browser;
}

let dnrRebuildMutex = Promise.resolve();
const ACTION_API = chrome.action || chrome.browserAction;

function hasDnrApi(){
  return Boolean(
    chrome.declarativeNetRequest
    && typeof chrome.declarativeNetRequest.getDynamicRules === 'function'
    && typeof chrome.declarativeNetRequest.updateDynamicRules === 'function'
  );
}

const HEARTBEAT_ALARM = 'sg-heartbeat';
const HEARTBEAT_PERIOD_MIN = 2;
const HEARTBEAT_THRESHOLD_MIN = 6;
const HEARTBEAT_SNOOZE_MIN = 5;
const FOCUS_ALARM = 'sg-focus-timer';
const WEEKLY_TIP_ALARM = 'sg-weekly-tip';
const CLASSROOM_DEFAULT = { enabled: false, playlists: [], videos: [] };
const CONVERSATION_EVENT_LIMIT = 12;
const BLOCK_EVENT_LIMIT = 200;
const FOCUS_SESSION_LIMIT = 200;
const ACCESS_REQUEST_LIMIT = 60;
const TEMP_ALLOWLIST_LIMIT = 200;
const PARENT_POLL_ALARM = 'sg-parent-poll';
const PARENT_POLL_PERIOD_MIN = 1;
const FS_BASE = 'https://firestore.googleapis.com/v1/projects/__FS_PROJECT_ID__/databases/(default)/documents';
const FS_KEY = '__FS_KEY__';

const GA4_MEASUREMENT_ID = '__GA4_MEASUREMENT_ID__';
const GA4_API_SECRET = '__GA4_API_SECRET__';
const GA4_ENDPOINT = `https://www.google-analytics.com/mp/collect?measurement_id=${GA4_MEASUREMENT_ID}&api_secret=${GA4_API_SECRET}`;
const TIP_POOL = [
  'If a headline sounds shocking, open a trusted news site to verify before sharing.',
  'AI images can fake events. Look for odd hands, lighting, or text to spot fakes.',
  'Never share one-time passcodes — real services and friends should not ask for them.',
  'Take a 5-minute break every 30 minutes to keep your judgement sharp online.',
  'If a page demands age verification or gifts for info, close it and ask an adult.',
  'Hover over links in emails to check the real destination before clicking.',
  'Use strong, unique passwords — and never reuse school or work passwords elsewhere.'
];

const FOCUS_DEFAULT_STATE = {
  active: false,
  startedAt: 0,
  endsAt: 0,
  durationMinutes: 0,
  pinProtected: false
};
const FOCUS_ALLOWED_DURATIONS = [30, 45, 60];
const FOCUS_DEFAULT_ALLOWLIST = [
  'wikipedia.org',
  'khanacademy.org',
  'britannica.com',
  'pbs.org',
  'scholastic.com',
  'nationalgeographic.com',
  'nasa.gov',
  'noaa.gov',
  'ed.gov',
  'quizlet.com',
  'classroom.google.com',
  'docs.google.com',
  'drive.google.com'
];
const FOCUS_ALLOW_REGEXES = [
  '^https?://([a-z0-9-]+\\.)*[^/]*\\.edu(/|$)',
  '^https?://([a-z0-9-]+\\.)*[^/]*\\.org(/|$)'
];
const FOCUS_BLOCK_DOMAINS = {
  social: [
    'facebook.com',
    'instagram.com',
    'tiktok.com',
    'twitter.com',
    'x.com',
    'snapchat.com',
    'reddit.com',
    'discord.com',
    'whatsapp.com'
  ],
  gaming: [
    'roblox.com',
    'steampowered.com',
    'store.steampowered.com',
    'epicgames.com',
    'fortnite.com',
    'minecraft.net',
    'leagueoflegends.com',
    'valorant.com'
  ],
  streaming: [
    'youtube.com',
    'youtu.be',
    'netflix.com',
    'hulu.com',
    'twitch.tv',
    'disneyplus.com',
    'primevideo.com',
    'max.com',
    'hbomax.com',
    'vimeo.com',
    'spotify.com',
    'pandora.com',
    'soundcloud.com'
  ]
};

function isPrivateHost(host){
  if (!host) return false;
  const lower = host.toLowerCase();
  return /^localhost$/.test(lower)
    || /^127\./.test(lower)
    || /^10\./.test(lower)
    || /^192\.168\./.test(lower)
    || /^169\.254\./.test(lower)
    || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(lower)
    || /^::1$/.test(lower)
    || /^fc00:/.test(lower)
    || /^fd00:/.test(lower);
}

function normalizeWebhook(url){
  if (!url || typeof url !== 'string') return '';
  try{
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'https:') return '';
    if (parsed.username || parsed.password) return '';
    if (isPrivateHost(parsed.hostname)) return '';
    return parsed.toString();
  }catch(_e){ return ''; }
}

function sanitizePlaylistIds(list){
  const out = [];
  const seen = new Set();
  (Array.isArray(list) ? list : []).forEach((item)=>{
    const id = String(item || '').trim();
    if (!id) return;
    const match = id.match(/list=([A-Za-z0-9_-]+)/);
    const clean = match && match[1] ? match[1] : (/^[A-Za-z0-9_-]{10,}$/.test(id) ? id : null);
    if (!clean) return;
    if (seen.has(clean)) return;
    seen.add(clean);
    out.push(clean);
  });
  return out;
}

function youtubePlaylistRegex(id){
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return `^https?://([a-z0-9-]+\\.)?youtube\\.com/(watch\\?[^#]*\\blist=${esc}(&|$)|playlist\\?[^#]*\\blist=${esc}(&|$))`;
}

function youtubeShortRegex(id){
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return `^https?://([a-z0-9-]+\\.)?youtu\\.be/[^?#]+\\?[^#]*\\blist=${esc}(&|$)`;
}

function sanitizeVideoIds(list){
  const out = [];
  const seen = new Set();
  (Array.isArray(list) ? list : []).forEach((item)=>{
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

function youtubeWatchRegexForVideo(id){
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return `^https?://([a-z0-9-]+\\.)?youtube\\.com/watch\\?[^#]*\\bv=${esc}(&|$)`;
}

function youtubeShortIdRegex(id){
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return `^https?://([a-z0-9-]+\\.)?youtu\\.be/${esc}([/?#]|$)`;
}

// Focus-mode helpers keep timers resilient across restarts by persisting storage + alarms.
function scheduleHeartbeat(){
  try {
    chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: HEARTBEAT_PERIOD_MIN });
  } catch(_e){}
}

function scheduleFocusAlarm(active){
  if (active){
    try {
      chrome.alarms.create(FOCUS_ALARM, { periodInMinutes: 1 });
    } catch(_e){}
    return;
  }
  chrome.alarms.clear(FOCUS_ALARM);
}

function scheduleWeeklyTipAlarm(){
  try {
    chrome.alarms.create(WEEKLY_TIP_ALARM, { periodInMinutes: 7 * 24 * 60 });
  } catch(_e){}
}

function clampFocusDuration(value){
  const minutes = Number(value);
  if (FOCUS_ALLOWED_DURATIONS.includes(minutes)) return minutes;
  return FOCUS_ALLOWED_DURATIONS[0];
}

async function getFocusState(){
  const stored = await new Promise((resolve)=>chrome.storage.local.get({ focusMode: FOCUS_DEFAULT_STATE }, resolve));
  const raw = stored.focusMode || {};
  const merged = { ...FOCUS_DEFAULT_STATE, ...raw };
  const now = Date.now();
  const active = Boolean(merged.active) && Number(merged.endsAt) > now;
  return {
    ...merged,
    active,
    endsAt: active ? Number(merged.endsAt) : 0
  };
}

async function startFocusSession(durationMinutes, options = {}){
  const duration = clampFocusDuration(durationMinutes);
  const now = Date.now();
  const focusMode = {
    active: true,
    startedAt: now,
    endsAt: now + duration * 60000,
    durationMinutes: duration,
    pinProtected: Boolean(options.pinProtected)
  };
  await chrome.storage.local.set({ focusMode });
  scheduleFocusAlarm(true);
  await updateBadge();
  recordFocusSession().catch(()=>{});
  trackEvent('focus_mode_started', { duration_minutes: duration }).catch(()=>{});
  return focusMode;
}

async function stopFocusSession(){
  const focusMode = { ...FOCUS_DEFAULT_STATE, endedAt: Date.now() };
  await chrome.storage.local.set({ focusMode });
  scheduleFocusAlarm(false);
  await updateBadge();
  return focusMode;
}

async function recordFocusSession(){
  try {
    const [{ focusSessionLog = [] }] = await Promise.all([
      new Promise((resolve)=>chrome.storage.local.get({ focusSessionLog: [] }, resolve))
    ]);
    const log = Array.isArray(focusSessionLog) ? focusSessionLog.slice(0, FOCUS_SESSION_LIMIT) : [];
    log.unshift({ ts: Date.now() });
    await chrome.storage.local.set({ focusSessionLog: log.slice(0, FOCUS_SESSION_LIMIT) });
  } catch(_e){}
}

async function recoverFocusSession(){
  const state = await getFocusState();
  if (state.active){
    if (state.endsAt <= Date.now()){
      await stopFocusSession();
      return;
    }
    scheduleFocusAlarm(true);
  } else {
    scheduleFocusAlarm(false);
  }
  await updateBadge();
}

async function handleFocusTick(){
  try{
    const state = await getFocusState();
    if (!state.active){
      scheduleFocusAlarm(false);
      await updateBadge();
      return;
    }
    if (state.endsAt <= Date.now()){
      await stopFocusSession();
      return;
    }
    await updateBadge();
  } catch(err){
    console.error('[SafeBrowse] Focus timer error', err);
  }
}


chrome.alarms.onAlarm.addListener((alarm)=>{
  if (alarm && alarm.name === HEARTBEAT_ALARM){
    handleHeartbeat().catch((err)=>{
      console.error('[SafeBrowse] Heartbeat error', err);
    });
  }
  if (alarm && alarm.name === FOCUS_ALARM){
    handleFocusTick().catch(()=>{});
  }
  if (alarm && alarm.name === WEEKLY_TIP_ALARM){
    rotateWeeklyTip().catch((err)=>{
      console.error('[SafeBrowse] Weekly tip rotation failed', err);
    });
  }
  if (alarm && alarm.name === PARENT_POLL_ALARM){ fbPollParentRequests().catch(()=>{}); return; }
});

const TOUR_KEY = 'onboardingComplete';
const TOUR_PENDING_KEY = 'onboardingPending';

chrome.runtime.onInstalled.addListener((details)=>{
  if (details && details.reason === 'install'){
    chrome.storage.sync.set({ [TOUR_KEY]: false });
    chrome.storage.local.set({ [TOUR_PENDING_KEY]: true });
    trackOnceEvent('extension_installed').catch(()=>{});
  }
  updateBadge();
  rebuildDynamicRules();
  scheduleHeartbeat();
  recoverFocusSession();
  scheduleWeeklyTipAlarm();
  rotateWeeklyTip().catch((_e)=>{});
  chrome.alarms.create(PARENT_POLL_ALARM, { periodInMinutes: PARENT_POLL_PERIOD_MIN });
});

function formatFocusBadge(remainingMs){
  const minutes = Math.max(0, Math.ceil(remainingMs / 60000));
  if (minutes > 999) return 'F!';
  return `F${minutes}`;
}

async function updateBadge(){
  if (!ACTION_API || typeof ACTION_API.setBadgeText !== 'function') return;
  try {
    const [{ enabled = true }, focus] = await Promise.all([
      new Promise((resolve)=>chrome.storage.sync.get({ enabled: true }, resolve)),
      getFocusState()
    ]);
    const now = Date.now();
    const focusActive = focus.active && focus.endsAt > now;
    const text = focusActive ? formatFocusBadge(focus.endsAt - now) : (enabled ? 'ON' : '');
    const color = focusActive ? '#2563eb' : (enabled ? '#16a34a' : '#9ca3af');
    ACTION_API.setBadgeText({ text });
    if (text){
      if (typeof ACTION_API.setBadgeBackgroundColor === 'function'){
        ACTION_API.setBadgeBackgroundColor({ color });
      }
    }
  } catch(_e) {}
}

chrome.storage.onChanged.addListener((changes, area)=>{
  if (area === 'sync'){
    if (Object.prototype.hasOwnProperty.call(changes, 'enabled')){
      updateBadge();
      const nowEnabled = Boolean(changes.enabled.newValue);
      if (nowEnabled) { enableDnsFiltering(); } else { disableDnsFiltering(); }
      handleProtectionToggle(nowEnabled).catch((err)=>{
        console.error('[SafeBrowse] Protection toggle alert failed', err);
      });
      if (changes.enabled && changes.enabled.newValue === true && changes.enabled.oldValue !== true){
        trackOnceEvent('protection_enabled').catch(()=>{});
        touchWeeklyActive('protection').catch(()=>{});
      }
    }
    if (Object.prototype.hasOwnProperty.call(changes, TOUR_KEY)){
      if (changes[TOUR_KEY] && changes[TOUR_KEY].newValue === true && changes[TOUR_KEY].oldValue !== true){
        trackOnceEvent('onboarding_completed').catch(()=>{});
      }
    }
    if (Object.prototype.hasOwnProperty.call(changes, 'familyWizardComplete')){
      if (changes.familyWizardComplete && changes.familyWizardComplete.newValue === true && changes.familyWizardComplete.oldValue !== true){
        trackOnceEvent('onboarding_completed').catch(()=>{});
      }
    }
    if (Object.prototype.hasOwnProperty.call(changes, 'allowlist')){
      rebuildDynamicRules();
    }
  }
  if (area === 'local'){
    if (Object.prototype.hasOwnProperty.call(changes, 'userBlocklist')){
      rebuildDynamicRules();
    }
    if (Object.prototype.hasOwnProperty.call(changes, 'temporaryAllowlist')){
      rebuildDynamicRules();
    }
    if (Object.prototype.hasOwnProperty.call(changes, 'classroomMode')){
      rebuildDynamicRules();
    }
    if (Object.prototype.hasOwnProperty.call(changes, 'focusMode')){
      rebuildDynamicRules();
      recoverFocusSession();
    }
  }
});

// ── DNS-over-HTTPS filtering (Cloudflare for Families) ──────────────────────
const DOH_URL = 'https://family.cloudflare-dns.com/dns-query';

function hasDohApi() {
  return Boolean(
    chrome.privacy &&
    chrome.privacy.network &&
    typeof chrome.privacy.network.secureDnsMode === 'object' &&
    typeof chrome.privacy.network.secureDnsMode.set === 'function'
  );
}

function enableDnsFiltering() {
  if (!hasDohApi()) return;
  chrome.privacy.network.secureDnsMode.set({ value: 'secure' }, () => {
    if (chrome.runtime.lastError) return;
    chrome.privacy.network.secureDnsUri.set({ value: DOH_URL }, () => {});
  });
}

function disableDnsFiltering() {
  if (!hasDohApi()) return;
  chrome.privacy.network.secureDnsMode.clear({}, () => {
    chrome.privacy.network.secureDnsUri.clear({}, () => {
    });
  });
}

// Also set badge when the service worker starts
updateBadge().catch(()=>{});
scheduleHeartbeat();
recoverFocusSession().catch(()=>{});
scheduleWeeklyTipAlarm();
// Rebuild dynamic rules on service worker start to ensure rules are present
rebuildDynamicRules().catch((err)=>{
  console.error('[SafeBrowse] Initial DNR rebuild failed', err);
});
rotateWeeklyTip().catch((_e)=>{});
// Enable DNS filtering on startup if protection is on
chrome.storage.sync.get({ enabled: true }, ({ enabled }) => { if (enabled !== false) enableDnsFiltering(); });
handleHeartbeat({ startup: true }).catch((err)=>{
  console.error('[SafeBrowse] Heartbeat startup check failed', err);
});

chrome.runtime.onStartup.addListener(()=>{
  scheduleHeartbeat();
  handleHeartbeat({ startup: true }).catch((err)=>{
    console.error('[SafeBrowse] Heartbeat startup check failed', err);
  });
  recoverFocusSession().catch(()=>{});
});

// ---- DNR dynamic rules (blocklist + allowlist) ----
async function loadJsonResource(path){
  try{
    const url = chrome.runtime.getURL(path);
    const res = await fetch(url);
    if(!res.ok) return null;
    return await res.json();
  }catch(_e){ return null; }
}

function hasManagedStorage(){
  try{
    return Boolean(chrome && chrome.storage && chrome.storage.managed && typeof chrome.storage.managed.get === 'function');
  }catch(_e){
    return false;
  }
}

function managedGet(defaults){
  if (!hasManagedStorage()) return Promise.resolve({ ...(defaults || {}) });
  return new Promise((resolve)=>{
    try{
      chrome.storage.managed.get(defaults || {}, (items)=>{
        resolve(items && typeof items === 'object' ? items : { ...(defaults || {}) });
      });
    }catch(_e){
      resolve({ ...(defaults || {}) });
    }
  });
}

// ---- Tracking integrity (local funnel events + optional telemetry) ----

const ANALYTICS_EVENTS_LIMIT = 250;

function isoWeekKey(ts){
  try{
    const date = new Date(Number(ts) || Date.now());
    date.setHours(0, 0, 0, 0);
    // Thursday of this week determines the year.
    const day = (date.getDay() + 6) % 7; // Mon=0..Sun=6
    date.setDate(date.getDate() + 3 - day);
    const weekYear = date.getFullYear();
    const week1 = new Date(weekYear, 0, 4);
    const week1Day = (week1.getDay() + 6) % 7;
    const weekNum = 1 + Math.round(((date - week1) / 86400000 - 3 + week1Day) / 7);
    return `${weekYear}-W${String(weekNum).padStart(2, '0')}`;
  } catch(_e){
    return '';
  }
}

function randomClientId(){
  try{
    if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch(_e){}
  try{
    return `${Date.now()}_${Math.random().toString(16).slice(2)}_${Math.random().toString(16).slice(2)}`;
  } catch(_e){
    return String(Date.now());
  }
}

async function getAnalyticsClientId(){
  const { analyticsClientId = '' } = await chrome.storage.local.get({ analyticsClientId: '' });
  if (analyticsClientId) return analyticsClientId;
  const next = randomClientId();
  await chrome.storage.local.set({ analyticsClientId: next });
  return next;
}

function normalizeTelemetryEndpoint(url){
  const normalized = normalizeWebhook(url);
  if (!normalized) return '';
  try{
    const parsed = new URL(normalized);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  }catch(_e){ return ''; }
}

async function getTelemetryConfig(){
  const managed = await managedGet({
    telemetryEnabled: false,
    telemetryEndpoint: '',
    telemetryBearerToken: ''
  });
  const endpoint = normalizeTelemetryEndpoint(managed && managed.telemetryEndpoint ? managed.telemetryEndpoint : '');
  const enabled = Boolean(managed && managed.telemetryEnabled) && Boolean(endpoint);
  const bearerToken = (managed && typeof managed.telemetryBearerToken === 'string')
    ? managed.telemetryBearerToken.trim()
    : '';
  return { enabled, endpoint, bearerToken };
}

async function sendTelemetryEvent(eventName, payload = {}){
  try{
    const cfg = await getTelemetryConfig();
    if (!cfg.enabled || !cfg.endpoint) return false;
    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
    if (cfg.bearerToken) headers.Authorization = `Bearer ${cfg.bearerToken}`;
    await fetch(cfg.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        event: String(eventName || '').trim(),
        ts: Date.now(),
        version: (chrome.runtime.getManifest && chrome.runtime.getManifest().version) ? chrome.runtime.getManifest().version : '',
        ...(payload && typeof payload === 'object' ? payload : {})
      })
    });
    return true;
  } catch(_e){
    return false;
  }
}

// ── GA4 session management (30-min inactivity timeout) ──
let _ga4SessionId = null;
let _ga4SessionLastAt = 0;
const GA4_SESSION_TIMEOUT_MS = 30 * 60 * 1000;

function getGa4SessionId() {
  const now = Date.now();
  if (!_ga4SessionId || (now - _ga4SessionLastAt) > GA4_SESSION_TIMEOUT_MS) {
    _ga4SessionId = String(now);
  }
  _ga4SessionLastAt = now;
  return _ga4SessionId;
}

async function sendGa4Event(eventName, params = {}) {
  try {
    const clientId = await getAnalyticsClientId();
    const sessionId = getGa4SessionId();
    const engagementTime = (params && typeof params.engagement_time_msec !== 'undefined')
      ? params.engagement_time_msec
      : '1';
    const { engagement_time_msec: _engagementTimeMsec, ...restParams } = (params && typeof params === 'object') ? params : {};
    await fetch(GA4_ENDPOINT, {
      method: 'POST',
      body: JSON.stringify({
        client_id: clientId,
        events: [{
          name: String(eventName || '').slice(0, 40),
          params: {
            session_id: sessionId,
            engagement_time_msec: String(engagementTime),
            ...restParams
          }
        }]
      })
    });
  } catch (_e) {}
}

async function appendAnalyticsEvent(entry){
  const stored = await chrome.storage.local.get({ analyticsEvents: [] });
  const list = Array.isArray(stored.analyticsEvents) ? stored.analyticsEvents : [];
  const next = [entry, ...list].slice(0, ANALYTICS_EVENTS_LIMIT);
  await chrome.storage.local.set({ analyticsEvents: next });
}

async function trackEvent(name, meta = {}){
  try{
    const eventName = String(name || '').trim();
    if (!eventName) return false;
    const clientId = await getAnalyticsClientId();
    const entry = {
      name: eventName,
      ts: Date.now(),
      ...(meta && typeof meta === 'object' ? meta : {})
    };
    await appendAnalyticsEvent(entry);
    sendTelemetryEvent(eventName, { clientId }).catch(()=>{});
    sendGa4Event(eventName, meta).catch(()=>{});
    return true;
  } catch(_e){
    return false;
  }
}

async function trackOnceEvent(name, meta = {}){
  try{
    const eventName = String(name || '').trim();
    if (!eventName) return false;
    const stored = await chrome.storage.local.get({ analyticsFlags: {}, analyticsEvents: [] });
    const flags = stored.analyticsFlags && typeof stored.analyticsFlags === 'object' ? stored.analyticsFlags : {};
    if (Object.prototype.hasOwnProperty.call(flags, eventName)) return false;
    const ts = Date.now();
    const nextFlags = { ...flags, [eventName]: ts };
    const entry = { name: eventName, ts, ...(meta && typeof meta === 'object' ? meta : {}) };
    const list = Array.isArray(stored.analyticsEvents) ? stored.analyticsEvents : [];
    const nextEvents = [entry, ...list].slice(0, ANALYTICS_EVENTS_LIMIT);
    await chrome.storage.local.set({ analyticsFlags: nextFlags, analyticsEvents: nextEvents });
    const clientId = await getAnalyticsClientId();
    sendTelemetryEvent(eventName, { clientId }).catch(()=>{});
    sendGa4Event(eventName, meta).catch(()=>{});
    return true;
  } catch(_e){
    return false;
  }
}

async function touchWeeklyActive(source){
  try{
    const week = isoWeekKey(Date.now());
    if (!week) return false;
    const stored = await chrome.storage.local.get({ analyticsWeeklyActiveWeek: '' });
    const lastWeek = String(stored.analyticsWeeklyActiveWeek || '');
    if (lastWeek === week) return false;
    await chrome.storage.local.set({ analyticsWeeklyActiveWeek: week });
    await trackEvent('weekly_active_user', { week, source: typeof source === 'string' ? source.slice(0, 32) : null });
    return true;
  } catch(_e){
    return false;
  }
}

function domainToRegex(domain){
  // Match domain and all subdomains, http/https
  const esc = domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return `^https?://([a-z0-9-]+\\.)*${esc}(/|$)`;
}

function generateAccessCode(){
  try {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    const num = (bytes[0] << 24) + (bytes[1] << 16) + (bytes[2] << 8) + bytes[3];
    const code = Math.abs(num % 1000000);
    return String(code).padStart(6, '0');
  } catch (_e){
    return String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
  }
}

function normalizeDomain(value){
  return String(value || '').trim().toLowerCase();
}

function sanitizeTemporaryAllowlist(raw){
  const now = Date.now();
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  list.forEach((entry)=>{
    if (!entry || typeof entry !== 'object') return;
    const host = normalizeDomain(entry.host);
    const expiresAt = Number(entry.expiresAt) || 0;
    if (!host || !expiresAt || expiresAt <= now) return;
    const key = `${host}:${expiresAt}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      host,
      expiresAt,
      createdAt: Number(entry.createdAt) || Number(entry.ts) || now,
      requestId: entry.requestId || null,
      approver: typeof entry.approver === 'string' ? entry.approver.trim() : null
    });
  });
  out.sort((a, b)=>a.expiresAt - b.expiresAt);
  return out.slice(0, TEMP_ALLOWLIST_LIMIT);
}

async function rebuildDynamicRules(){
  if (!hasDnrApi()) return;
  let release = ()=>{};
  const wait = dnrRebuildMutex;
  dnrRebuildMutex = new Promise((resolve)=>{ release = resolve; });
  await wait;
  try{
    try{
      const cfg = (await new Promise(r => chrome.storage.sync.get({ allowlist: [], focusAllowedComms: [] }, r))) || {};
      const allowlist = Array.isArray(cfg.allowlist) ? cfg.allowlist : [];
      const focusAllowedComms = Array.isArray(cfg.focusAllowedComms) ? cfg.focusAllowedComms.map((d)=>String(d||'').trim().toLowerCase()).filter(Boolean) : [];
      const local = await new Promise(r => chrome.storage.local.get({
        userBlocklist: [],
        classroomMode: CLASSROOM_DEFAULT,
        temporaryAllowlist: []
      }, r));
      const userBlocklist = Array.isArray(local.userBlocklist) ? local.userBlocklist : [];
      const classroomMode = { ...CLASSROOM_DEFAULT, ...(local.classroomMode || {}) };
      classroomMode.playlists = sanitizePlaylistIds(classroomMode.playlists);
      classroomMode.videos = sanitizeVideoIds(classroomMode.videos);
      const classroomActive = Boolean(classroomMode.enabled);
      const rawTempAllowlist = Array.isArray(local.temporaryAllowlist) ? local.temporaryAllowlist : [];
      const temporaryAllowlist = sanitizeTemporaryAllowlist(rawTempAllowlist);
      if (rawTempAllowlist.length !== temporaryAllowlist.length){
        chrome.storage.local.set({ temporaryAllowlist }).catch((_e)=>{});
      }
      const focus = await getFocusState();
      const focusActive = focus.active && focus.endsAt > Date.now();
      const block = await loadJsonResource('data/blocklist.json');
      const blockDomains = (block && Array.isArray(block.domains)) ? block.domains : [];

      let allowDomains = Array.from(new Set([
        ...allowlist.map(normalizeDomain).filter(Boolean),
        ...temporaryAllowlist.map((entry)=>entry.host).filter(Boolean)
      ]));
      if (classroomActive){
        // Prevent broad YouTube allowlisting from bypassing classroom restrictions
        allowDomains = allowDomains.filter((d)=>!/^((www\.)?youtube\.com|youtu\.be)$/i.test(d));
      }
      const userDomains = Array.from(new Set(userBlocklist.map(normalizeDomain).filter(Boolean)));

      let id = 20000; // dynamic IDs start here
      const rules = [];

      // Allow rules take precedence via higher priority
      const focusAllowDomains = focusActive
        ? Array.from(new Set([ ...allowDomains, ...FOCUS_DEFAULT_ALLOWLIST.map(normalizeDomain), ...focusAllowedComms ]))
        : allowDomains;
      const allowPriority = (focusActive || classroomActive) ? 11000 : 10000;
      for(const d of focusAllowDomains){
        const rx = domainToRegex(d);
        rules.push({
          id: id++,
          priority: allowPriority,
          action: { type: 'allow' },
          condition: { regexFilter: rx, resourceTypes: ['main_frame'] }
        });
      }
      if (focusActive){
        for (const rx of FOCUS_ALLOW_REGEXES){
          rules.push({
            id: id++,
            priority: allowPriority,
            action: { type: 'allow' },
            condition: { regexFilter: rx, resourceTypes: ['main_frame'] }
          });
        }
      }
      const hasVideoIds = classroomActive && classroomMode.videos.length > 0;
      if (classroomActive && hasVideoIds){
        const videoPriority = allowPriority + 1000;
        classroomMode.videos.forEach((vid)=>{
          rules.push({
            id: id++,
            priority: videoPriority,
            action: { type: 'allow' },
            condition: { regexFilter: youtubeWatchRegexForVideo(vid), resourceTypes: ['main_frame'] }
          });
          rules.push({
            id: id++,
            priority: videoPriority,
            action: { type: 'allow' },
            condition: { regexFilter: youtubeShortIdRegex(vid), resourceTypes: ['main_frame'] }
          });
        });
      } else if (classroomActive && classroomMode.playlists.length){
        const playlistPriority = allowPriority + 1000;
        classroomMode.playlists.forEach((pid)=>{
          rules.push({
            id: id++,
            priority: playlistPriority,
            action: { type: 'allow' },
            condition: { regexFilter: youtubePlaylistRegex(pid), resourceTypes: ['main_frame'] }
          });
          rules.push({
            id: id++,
            priority: playlistPriority,
            action: { type: 'allow' },
            condition: { regexFilter: youtubeShortRegex(pid), resourceTypes: ['main_frame'] }
          });
        });
      }

      // Block rules for domains: packaged + user list (truncated to fit DNR limits)
      const MAX_DYNAMIC = 29000; // conservative safety margin under Chrome's dynamic rule cap
      const uniq = Array.from(new Set([ ...blockDomains.map(normalizeDomain), ...userDomains ])).filter(Boolean);
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
      if (focusActive){
        const focusBlockDomains = Array.from(new Set([
          ...FOCUS_BLOCK_DOMAINS.social,
          ...FOCUS_BLOCK_DOMAINS.gaming,
          ...FOCUS_BLOCK_DOMAINS.streaming
        ].map(normalizeDomain).filter(Boolean))).filter((d)=>!focusAllowedComms.includes(d));
        for(const d of focusBlockDomains){
          const rx = domainToRegex(d);
          rules.push({
            id: id++,
            priority: 500,
            action: { type: 'block' },
            condition: { regexFilter: rx, resourceTypes: ['main_frame'] }
          });
        }
        rules.push({
          id: id++,
          priority: 1,
          action: { type: 'block' },
          condition: { regexFilter: '^https?://.*', resourceTypes: ['main_frame'] }
        });
      } else if (classroomActive){
        const classroomBlocks = Array.from(new Set([
          ...FOCUS_BLOCK_DOMAINS.social,
          ...FOCUS_BLOCK_DOMAINS.gaming
        ].map(normalizeDomain).filter(Boolean)));
        for (const d of classroomBlocks){
          const rx = domainToRegex(d);
          rules.push({
            id: id++,
            priority: 600,
            action: { type: 'block' },
            condition: { regexFilter: rx, resourceTypes: ['main_frame'] }
          });
        }
        rules.push({
          id: id++,
          priority: 600,
          action: { type: 'block' },
          condition: { regexFilter: '^https?://([a-z0-9-]+\\.)?youtube\\.com/.*', resourceTypes: ['main_frame'] }
        });
        rules.push({
          id: id++,
          priority: 600,
          action: { type: 'block' },
          condition: { regexFilter: '^https?://([a-z0-9-]+\\.)?youtu\\.be/.*', resourceTypes: ['main_frame'] }
        });
      }
      if (uniq.length > take.length){
        console.warn('[SafeBrowse] Blocklist truncated for DNR capacity:', take.length, '/', uniq.length);
      }

      const existing = await chrome.declarativeNetRequest.getDynamicRules();
      const removeRuleIds = existing.map(r => r.id);
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules: rules });
      console.log('[SafeBrowse] DNR dynamic rules updated:', rules.length);
    }catch(e){
      console.error('[SafeBrowse] Failed to rebuild DNR rules', e);
    }
  }catch(e){
    // unexpected lock failure
    console.error('[SafeBrowse] DNR rebuild mutex error', e);
  } finally {
    release();
  }
}

async function recordConversationTopic(topic){
  const safeTopic = typeof topic === 'string' && topic.trim() ? topic.trim().toLowerCase() : 'general';
  const [{ conversationTipsEnabled = true }, { conversationEvents = [] }] = await Promise.all([
    new Promise((resolve)=>chrome.storage.sync.get({ conversationTipsEnabled: true }, resolve)),
    new Promise((resolve)=>chrome.storage.local.get({ conversationEvents: [] }, resolve))
  ]);
  if (!conversationTipsEnabled) return;
  const events = Array.isArray(conversationEvents) ? conversationEvents.slice(0, CONVERSATION_EVENT_LIMIT) : [];
  const existingToday = events.find((ev)=>ev && ev.topic === safeTopic && new Date(ev.ts || 0).toDateString() === new Date().toDateString());
  if (existingToday) return;
  events.unshift({ topic: safeTopic, ts: Date.now() });
  const trimmed = events.slice(0, CONVERSATION_EVENT_LIMIT);
  await chrome.storage.local.set({ conversationEvents: trimmed });
}

async function recordKidReport(payload = {}){
  const [{ kidReportEvents = [] }] = await Promise.all([
    new Promise((resolve)=>chrome.storage.local.get({ kidReportEvents: [] }, resolve))
  ]);
  const events = Array.isArray(kidReportEvents) ? kidReportEvents.slice(0, CONVERSATION_EVENT_LIMIT) : [];
  events.unshift({
    ts: Date.now(),
    tone: typeof payload.tone === 'string' ? payload.tone : null,
    host: typeof payload.host === 'string' ? payload.host : null,
    note: typeof payload.note === 'string' ? payload.note : null
  });
  await chrome.storage.local.set({ kidReportEvents: events.slice(0, CONVERSATION_EVENT_LIMIT) });
}

// ── Firebase Firestore helpers ──────────────────────────────────────────────

async function getFamilyId() {
  const { familyPassphrase = '' } = await chrome.storage.local.get({ familyPassphrase: '' });
  if (!familyPassphrase) return null;
  const enc = new TextEncoder().encode(familyPassphrase);
  const hashBuf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

function fsRandomId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => b.toString(16).padStart(2, '0')).join('');
}

function fsToFields(obj) {
  const f = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') f[k] = { stringValue: v };
    else if (typeof v === 'number') f[k] = { integerValue: String(v) };
  }
  return f;
}

function fsFromDoc(doc) {
  if (!doc || !doc.fields) return null;
  const obj = { _id: doc.name.split('/').pop() };
  for (const [k, v] of Object.entries(doc.fields)) {
    obj[k] = v.stringValue ?? v.integerValue ?? null;
  }
  return obj;
}

async function fsPost(collection, docId, data) {
  const url = `${FS_BASE}/${collection}?documentId=${encodeURIComponent(docId)}&key=${FS_KEY}`;
  const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: fsToFields(data) }) });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    console.error('[SafeBrowse] fsPost failed', resp.status, body?.error?.message || body);
  }
  return resp.ok;
}

async function fsGet(path) {
  const resp = await fetch(`${FS_BASE}/${path}?key=${FS_KEY}`);
  if (!resp.ok) return null;
  return fsFromDoc(await resp.json());
}

async function fsPatch(path, data) {
  const mask = Object.keys(data).map(k => `updateMask.fieldPaths=${k}`).join('&');
  const url = `${FS_BASE}/${path}?${mask}&key=${FS_KEY}`;
  const resp = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: fsToFields(data) }) });
  return resp.ok;
}

async function fsDelete(path) {
  await fetch(`${FS_BASE}/${path}?key=${FS_KEY}`, { method: 'DELETE' });
}

async function fsList(collection) {
  const resp = await fetch(`${FS_BASE}/${collection}?key=${FS_KEY}`);
  if (!resp.ok) return [];
  const data = await resp.json();
  return (data.documents || []).map(fsFromDoc).filter(Boolean);
}

async function fbSendRequest(domain) {
  const familyId = await getFamilyId();
  if (!familyId) return { error: 'no-passphrase' };
  const requestId = fsRandomId();
  const ok = await fsPost(`requests/${familyId}/pending`, requestId, {
    domain,
    status: 'pending',
    requestedAt: String(Date.now()),
    expiresAt: String(Date.now() + 10 * 60 * 1000)
  });
  return ok ? { requestId } : { error: 'firebase-error' };
}

async function fbCheckApproval(requestId) {
  const familyId = await getFamilyId();
  if (!familyId || !requestId) return null;
  const doc = await fsGet(`requests/${familyId}/pending/${requestId}`);
  if (!doc) return 'expired';
  const expiresAt = parseInt(doc.expiresAt || '0', 10);
  if (expiresAt && Date.now() > expiresAt) return 'expired';
  return doc.status;
}

async function fbPollParentRequests() {
  const { isParentDevice = false } = await chrome.storage.local.get({ isParentDevice: false });
  const familyId = await getFamilyId();
  if (!familyId) return;
  if (isParentDevice) {
    const docs = await fsList(`requests/${familyId}/pending`);
    const now = Date.now();
    const pending = docs.filter(d => d.status === 'pending' && parseInt(d.expiresAt || '0', 10) > now);
    await chrome.storage.local.set({ pendingApprovals: pending });
    if (pending.length > 0) {
      ACTION_API.setBadgeText({ text: String(pending.length) });
      ACTION_API.setBadgeBackgroundColor({ color: '#f59e0b' });
    }
  } else {
    // Child device: poll for PINs sent by parent
    const docs = await fsList(`pins/${familyId}`);
    const now = Date.now();
    const available = docs.filter(d => parseInt(d.expiresAt || '0', 10) > now).map(d => d.pin).filter(Boolean);
    await chrome.storage.local.set({ sentPins: available });
  }
}

async function fbApproveRequest(requestId) {
  const familyId = await getFamilyId();
  if (!familyId) return false;
  const ok = await fsPatch(`requests/${familyId}/pending/${requestId}`, { status: 'approved' });
  setTimeout(() => fsDelete(`requests/${familyId}/pending/${requestId}`), 30000);
  const { pendingApprovals = [] } = await chrome.storage.local.get({ pendingApprovals: [] });
  await chrome.storage.local.set({ pendingApprovals: pendingApprovals.filter(r => r._id !== requestId) });
  return ok;
}

async function fbDenyRequest(requestId) {
  const familyId = await getFamilyId();
  if (!familyId) return false;
  const ok = await fsPatch(`requests/${familyId}/pending/${requestId}`, { status: 'denied' });
  setTimeout(() => fsDelete(`requests/${familyId}/pending/${requestId}`), 10000);
  const { pendingApprovals = [] } = await chrome.storage.local.get({ pendingApprovals: [] });
  await chrome.storage.local.set({ pendingApprovals: pendingApprovals.filter(r => r._id !== requestId) });
  return ok;
}

async function recordAccessRequest(payload = {}){
  const { accessRequests = [] } = await new Promise((resolve)=>chrome.storage.local.get({ accessRequests: [] }, resolve));
  const list = Array.isArray(accessRequests) ? accessRequests.slice(0, ACCESS_REQUEST_LIMIT) : [];
  const host = normalizeDomain(payload.host);
  if (!host) return null;
  const entry = {
    id: `req_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    code: generateAccessCode(),
    ts: Date.now(),
    host,
    url: typeof payload.url === 'string' ? payload.url : null,
    note: typeof payload.note === 'string' ? payload.note.trim().slice(0, 240) : null,
    status: 'pending',
    source: 'local'
  };
  list.unshift(entry);
  await chrome.storage.local.set({ accessRequests: list.slice(0, ACCESS_REQUEST_LIMIT) });
  touchWeeklyActive('access-request').catch(()=>{});
  trackOnceEvent('first_access_request').catch(()=>{});
  trackEvent('access_request_sent').catch(()=>{});
  return entry;
}

async function recordBlockEvent(payload = {}){
  try {
    const [{ blockEvents = [] }] = await Promise.all([
      new Promise((resolve)=>chrome.storage.local.get({ blockEvents: [] }, resolve))
    ]);
    const events = Array.isArray(blockEvents) ? blockEvents.slice(0, BLOCK_EVENT_LIMIT) : [];
    events.unshift({
      ts: Date.now(),
      host: typeof payload.host === 'string' ? payload.host : null,
      reason: typeof payload.reason === 'string' ? payload.reason : null
    });
    await chrome.storage.local.set({ blockEvents: events.slice(0, BLOCK_EVENT_LIMIT) });
    trackOnceEvent('first_threat_blocked').catch(()=>{});
    touchWeeklyActive('block').catch(()=>{});
  } catch(_e){}
}

async function rotateWeeklyTip(){
  try {
    const [{ weeklyTipsEnabled = true, weeklyTipIndex = 0 }, { pendingTip = null }] = await Promise.all([
      new Promise((resolve)=>chrome.storage.sync.get({ weeklyTipsEnabled: true, weeklyTipIndex: 0 }, resolve)),
      new Promise((resolve)=>chrome.storage.local.get({ pendingTip: null }, resolve))
    ]);
    if (!weeklyTipsEnabled || !Array.isArray(TIP_POOL) || !TIP_POOL.length) return;
    const nextIndex = Number.isInteger(weeklyTipIndex) ? weeklyTipIndex % TIP_POOL.length : 0;
    const tip = TIP_POOL[nextIndex] || TIP_POOL[0];
    const newPending = { id: Date.now(), tip, ts: Date.now() };
    if (!pendingTip || pendingTip.tip !== newPending.tip){
      await chrome.storage.local.set({ pendingTip: newPending });
    }
    const followingIndex = (nextIndex + 1) % TIP_POOL.length;
    await chrome.storage.sync.set({ weeklyTipIndex: followingIndex });
  } catch(_e){}
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse)=>{
  if (message && message.type === 'sg-ga4-event') {
    const name = typeof message.name === 'string' ? message.name.trim().slice(0, 40) : '';
    if (name) sendGa4Event(name, message.params || {}).catch(()=>{});
    sendResponse({ ok: true });
    return true;
  }
  if (message && message.type === 'sg-analytics-activity'){
    const source = message && typeof message.source === 'string' ? message.source : 'activity';
    touchWeeklyActive(source).then(()=>sendResponse({ ok: true })).catch(()=>sendResponse({ ok: false }));
    return true;
  }
  if (message && message.type === 'sg-analytics-track-once'){
    const allowed = new Set([
      'extension_installed',
      'onboarding_completed',
      'protection_enabled',
      'first_threat_blocked'
    ]);
    const name = message && typeof message.name === 'string' ? message.name.trim() : '';
    if (!name || !allowed.has(name)){
      sendResponse({ ok: false, error: 'invalid-event' });
      return true;
    }
    const source = message && typeof message.source === 'string' ? message.source : '';
    trackOnceEvent(name, { source: source ? source.slice(0, 32) : null }).then(()=>sendResponse({ ok: true })).catch(()=>sendResponse({ ok: false }));
    return true;
  }
  if (message && message.type === 'sg-override-alert' && message.entry){
    handleOverrideAlert(message.entry);
    sendResponse({ ok: true });
    return true;
  }
  if (message && message.type === 'sg-get-override-approver'){
    chrome.storage.local.get({ approverPromptEnabled: false }, (cfg)=>{
      if (!cfg.approverPromptEnabled){
        sendResponse({ approver: '' });
        return;
      }
      const tabId = sender && sender.tab ? sender.tab.id : null;
      if (tabId == null){
        sendResponse({ approver: '' });
        return;
      }
      chrome.tabs.sendMessage(tabId, { type: 'sg-open-approver-prompt', prompt: 'Who approved this override? (initials/name)' }, (resp)=>{
        const approver = resp && typeof resp.approver === 'string' ? resp.approver.trim() : '';
        sendResponse({ approver });
      });
    });
    return true;
  }
  if (message && message.type === 'sg-focus-get-state'){
    getFocusState().then((state)=>{
      const now = Date.now();
      sendResponse({
        ok: true,
        state: {
          ...state,
          remainingMs: state.active && state.endsAt ? Math.max(0, state.endsAt - now) : 0
        }
      });
    }).catch((err)=>{
      console.error('[SafeBrowse] Focus state fetch failed', err);
      sendResponse({ ok: false, error: 'failed-focus-state' });
    });
    return true;
  }
  if (message && message.type === 'sg-focus-start'){
    const duration = clampFocusDuration(message.durationMinutes || message.duration);
    startFocusSession(duration, { pinProtected: Boolean(message.pinProtected) }).then((state)=>{
      const now = Date.now();
      sendResponse({
        ok: true,
        state: {
          ...state,
          remainingMs: Math.max(0, state.endsAt - now)
        }
      });
    }).catch((err)=>{
      console.error('[SafeBrowse] Focus start failed', err);
      sendResponse({ ok: false, error: 'failed-focus-start' });
    });
    return true;
  }
  if (message && message.type === 'sg-focus-stop'){
    stopFocusSession().then((state)=>{
      sendResponse({ ok: true, state });
    }).catch((err)=>{
      console.error('[SafeBrowse] Focus stop failed', err);
      sendResponse({ ok: false, error: 'failed-focus-stop' });
    });
    return true;
  }
  if (message && message.type === 'sg-log-conversation-topic'){
    recordConversationTopic(message.topic).then(()=>sendResponse({ ok: true })).catch((err)=>{
      console.error('[SafeBrowse] conversation topic log failed', err);
      sendResponse({ ok: false });
    });
    return true;
  }
  if (message && message.type === 'sg-kid-report'){
    recordKidReport({ tone: message.tone, host: message.host, note: message.note }).then(()=>sendResponse({ ok: true })).catch((err)=>{
      console.error('[SafeBrowse] kid report log failed', err);
      sendResponse({ ok: false });
    });
    return true;
  }
  if (message && message.type === 'sg-access-request'){
    recordAccessRequest({ host: message.host, url: message.url, note: message.note }).then((entry)=>{
      if (!entry){
        sendResponse({ ok: false });
        return;
      }
      sendResponse({ ok: true, request: entry });
    }).catch((err)=>{
      console.error('[SafeBrowse] access request log failed', err);
      sendResponse({ ok: false });
    });
    return true;
  }
  if (message && message.type === 'sg-log-block-event'){
    recordBlockEvent({ host: message.host, reason: message.reason }).then(()=>sendResponse({ ok: true })).catch((_err)=>{
      sendResponse({ ok: false });
    });
    return true;
  }
  if (message && message.type === 'sg-send-pin-to-child') {
    const pin = String(message.pin || '').trim().toUpperCase();
    if (!pin) { sendResponse({ ok: false, error: 'No PIN provided.' }); return true; }
    getFamilyId().then(familyId => {
      if (!familyId) { sendResponse({ ok: false, error: 'Set a family passphrase first.' }); return; }
      chrome.storage.local.get({ tempPins: [] }, (s) => {
        const entry = (Array.isArray(s.tempPins) ? s.tempPins : []).find(p => p.pin === pin && !p.used && p.expiresAt > Date.now());
        if (!entry) { sendResponse({ ok: false, error: 'PIN not found or already used.' }); return; }
        fsPost(`pins/${familyId}`, pin, { pin, expiresAt: String(entry.expiresAt), createdAt: String(entry.createdAt) })
          .then(ok => sendResponse(ok ? { ok: true } : { ok: false, error: 'Could not reach Firebase. Check internet connection.' }));
      });
    });
    return true;
  }
  if (message && message.type === 'sg-gen-temp-pin') {
    const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let pin = '';
    const arr = new Uint8Array(6);
    crypto.getRandomValues(arr);
    arr.forEach(b => { pin += charset[b % charset.length]; });
    const minutes = Math.max(5, Math.min(1440, parseInt(message.minutes || 120, 10)));
    const entry = { pin, createdAt: Date.now(), expiresAt: Date.now() + minutes * 60 * 1000, used: false };
    chrome.storage.local.get({ tempPins: [] }, (s) => {
      const pins = (Array.isArray(s.tempPins) ? s.tempPins : []).filter(p => !p.used && p.expiresAt > Date.now());
      pins.push(entry);
      chrome.storage.local.set({ tempPins: pins }, () => {
        trackEvent('temp_pin_generated', { minutes }).catch(()=>{});
        sendResponse({ pin, expiresAt: entry.expiresAt });
      });
    });
    return true;
  }
  if (message && message.type === 'sg-get-temp-pins') {
    chrome.storage.local.get({ tempPins: [] }, (s) => {
      const now = Date.now();
      const active = (Array.isArray(s.tempPins) ? s.tempPins : []).filter(p => !p.used && p.expiresAt > now);
      sendResponse({ pins: active });
    });
    return true;
  }
  if (message && message.type === 'sg-revoke-temp-pin') {
    chrome.storage.local.get({ tempPins: [] }, (s) => {
      const pins = (Array.isArray(s.tempPins) ? s.tempPins : []).filter(p => p.pin !== message.pin);
      chrome.storage.local.set({ tempPins: pins }, () => sendResponse({ ok: true }));
    });
    return true;
  }
  if (message && message.type === 'sg-get-sent-pins') {
    chrome.storage.local.get({ sentPins: [] }, (s) => {
      sendResponse({ pins: Array.isArray(s.sentPins) ? s.sentPins : [] });
    });
    return true;
  }
  if (message && message.type === 'sg-verify-temp-pin') {
    const { pin, domain } = message;
    chrome.storage.local.get({ tempPins: [], temporaryAllowlist: [], sentPins: [] }, (s) => {
      const now = Date.now();
      const pins = Array.isArray(s.tempPins) ? s.tempPins : [];
      const sentPins = Array.isArray(s.sentPins) ? s.sentPins : [];
      // Check local tempPins (parent device) OR sentPins (child device received via Firebase)
      const localIdx = pins.findIndex(p => p.pin === pin && !p.used && p.expiresAt > now);
      const isSentPin = sentPins.includes(pin);
      if (localIdx === -1 && !isSentPin) { sendResponse({ ok: false, error: 'Invalid or expired PIN.' }); return; }
      if (localIdx !== -1) { pins[localIdx].used = true; pins[localIdx].usedAt = now; pins[localIdx].usedFor = domain; }
      const updatedSentPins = sentPins.filter(p => p !== pin);
      const list = Array.isArray(s.temporaryAllowlist) ? s.temporaryAllowlist : [];
      const expiresAt = now + 24 * 60 * 60 * 1000;
      const updated = [...list.filter(e => e.host !== domain), { host: domain, expiresAt, createdAt: now, approver: 'pin' }];
      // Delete from Firebase if it was a sent PIN
      getFamilyId().then(familyId => { if (familyId && isSentPin) fsDelete(`pins/${familyId}/${pin}`); });
      chrome.storage.local.set({ tempPins: pins, temporaryAllowlist: updated, sentPins: updatedSentPins }, () => {
        rebuildDynamicRules().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: true }));
      });
    });
    return true;
  }
  if (message && message.type === 'sg-parent-approved') {
    const domain = String(message.domain || '').trim().toLowerCase();
    if (domain) {
      chrome.storage.local.get({ temporaryAllowlist: [] }, (local) => {
        const list = Array.isArray(local.temporaryAllowlist) ? local.temporaryAllowlist : [];
        const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
        const updated = [...list.filter(e => e.host !== domain), { host: domain, expiresAt, createdAt: Date.now(), approver: 'parent' }];
        chrome.storage.local.set({ temporaryAllowlist: updated }, () => {
          rebuildDynamicRules().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: true }));
        });
      });
    } else {
      sendResponse({ ok: true });
    }
    return true;
  }
  if (message && message.type === 'sg-fb-send-request') {
    fbSendRequest(message.domain).then(result => sendResponse(result));
    return true;
  }
  if (message && message.type === 'sg-fb-check-approval') {
    fbCheckApproval(message.requestId).then(status => sendResponse({ status }));
    return true;
  }
  if (message && message.type === 'sg-fb-approve') {
    fbApproveRequest(message.requestId).then(ok => sendResponse({ ok }));
    return true;
  }
  if (message && message.type === 'sg-fb-deny') {
    fbDenyRequest(message.requestId).then(ok => sendResponse({ ok }));
    return true;
  }
  if (message && message.type === 'sg-fb-get-pending') {
    chrome.storage.local.get({ pendingApprovals: [] }, r => sendResponse({ pending: r.pendingApprovals }));
    return true;
  }
  if (message && message.type === 'sg-generate-invite') {
    (async () => {
      const familyId = await getFamilyId();
      if (!familyId) { sendResponse({ ok: false, error: 'Set a family passphrase first.' }); return; }
      const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const arr = crypto.getRandomValues(new Uint8Array(8));
      const code = Array.from(arr).map(b => CHARSET[b % CHARSET.length]).join('');
      const ok = await fsPost('invites', code, {
        familyPassphrase: (await chrome.storage.local.get({ familyPassphrase: '' })).familyPassphrase,
        familyId,
        createdAt: String(Date.now()),
        expiresAt: String(Date.now() + 24 * 60 * 60 * 1000)
      });
      sendResponse(ok ? { ok: true, code } : { ok: false, error: 'Could not save invite. Check your connection.' });
    })();
    return true;
  }
  if (message && message.type === 'sg-redeem-invite') {
    (async () => {
      const code = (message.code || '').toUpperCase().trim();
      if (!code) { sendResponse({ ok: false, error: 'No code provided.' }); return; }
      const doc = await fsGet(`invites/${code}`);
      if (!doc) { sendResponse({ ok: false, error: 'Code not found or expired.' }); return; }
      const expiresAt = parseInt(doc.expiresAt || '0', 10);
      if (expiresAt && Date.now() > expiresAt) { sendResponse({ ok: false, error: 'Code has expired.' }); return; }
      await chrome.storage.local.set({
        familyPassphrase: doc.familyPassphrase || '',
        isParentDevice: false,
        deviceRole: 'child'
      });
      await fsDelete(`invites/${code}`);
      trackOnceEvent('child_paired').catch(()=>{});
      sendResponse({ ok: true });
    })();
    return true;
  }
  return false;
});

async function handleHeartbeat(options = {}){
  try {
    const now = Date.now();
    const {
      tamperAlertEnabled = false,
      overrideAlertWebhook = '',
      lastHeartbeatAt = 0,
      lastTamperAlertAt = 0
    } = await chrome.storage.local.get({
      tamperAlertEnabled: false,
      overrideAlertWebhook: '',
      lastHeartbeatAt: 0,
      lastTamperAlertAt: 0
    });
    await chrome.storage.local.set({ lastHeartbeatAt: now });
    if (!tamperAlertEnabled) return;
    const webhook = normalizeWebhook(overrideAlertWebhook);
    if (!webhook) return;
    const last = Number(lastHeartbeatAt) || 0;
    if (!last) return;
    const gapMinutes = (now - last) / 60000;
    if (!options.startup && gapMinutes <= HEARTBEAT_PERIOD_MIN + 1) return;
    if (gapMinutes < HEARTBEAT_THRESHOLD_MIN) return;
    const lastAlert = Number(lastTamperAlertAt) || 0;
    if (lastAlert && (now - lastAlert) < HEARTBEAT_SNOOZE_MIN * 60000) return;
    const payload = {
      text: `SafeBrowse heartbeat gap detected. Extension was offline for ~${Math.round(gapMinutes)} minute(s).`,
      gapMinutes: Math.round(gapMinutes),
      lastSeenAt: new Date(last).toISOString(),
      detectedAt: new Date(now).toISOString()
    };
    await sendTamperAlert(payload, {
      tamperAlertEnabled,
      overrideAlertWebhook: webhook,
      lastTamperAlertAt
    }, now);
  } catch(err){
    console.error('[SafeBrowse] Tamper alert failed', err);
  }
}

async function handleProtectionToggle(enabled){
  if (enabled) return;
  try {
    const now = Date.now();
    const cfg = await chrome.storage.local.get({
      tamperAlertEnabled: false,
      overrideAlertWebhook: '',
      lastTamperAlertAt: 0
    });
    await sendTamperAlert({
      text: 'SafeBrowse protection was paused. If this was unexpected, re-enable filtering immediately.',
      trigger: 'protection-disabled',
      detectedAt: new Date(now).toISOString()
    }, cfg, now, { force: true });
  } catch(err){
    console.error('[SafeBrowse] Protection toggle alert failed', err);
  }
}

async function sendTamperAlert(payload, cfg, timestamp, options = {}){
  const now = timestamp || Date.now();
  if (!cfg || !cfg.tamperAlertEnabled) return;
  const webhook = normalizeWebhook(cfg.overrideAlertWebhook);
  if (!webhook) return;
  const lastAlert = Number(cfg.lastTamperAlertAt) || 0;
  if (!options.force && lastAlert && (now - lastAlert) < HEARTBEAT_SNOOZE_MIN * 60000) return;
  const body = {
    type: 'tamper',
    ...payload,
    detectedAt: payload.detectedAt || new Date(now).toISOString()
  };
  await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  await chrome.storage.local.set({ lastTamperAlertAt: now });
}

async function handleOverrideAlert(entry){
  try {
    const cfg = await chrome.storage.local.get({ overrideAlertEnabled: false, overrideAlertWebhook: '' });
    if (!cfg.overrideAlertEnabled) return;
    const webhook = normalizeWebhook(cfg.overrideAlertWebhook);
    if (!webhook) return;
    const ts = entry.timestamp ? new Date(entry.timestamp).toISOString() : new Date().toISOString();
    const lines = [];
    lines.push(`SafeBrowse override approved${entry.approver ? ` by ${entry.approver}` : ''}`);
    if (entry.host) lines.push(`Host: ${entry.host}`);
    if (entry.reason) lines.push(`Reason: ${entry.reason}`);
    if (entry.url) lines.push(`URL: ${entry.url}`);
    if (entry.policyReview && entry.policyReview.verdict){
      const verdict = entry.policyReview.verdict.toUpperCase();
      const score = typeof entry.policyReview.score === 'number' ? entry.policyReview.score : null;
      lines.push(`Policy review: ${verdict}${score !== null ? ` (score ${score})` : ''}`);
      if (Array.isArray(entry.policyReview.factors) && entry.policyReview.factors.length){
        const topFactors = entry.policyReview.factors.slice(0, 3).map((factor)=>{
          const label = factor && factor.label ? factor.label : factor.code;
          const weight = typeof factor?.weight === 'number' ? factor.weight : null;
          return weight !== null ? `${label} (${weight >= 0 ? '+' : ''}${weight})` : label;
        });
        lines.push(`Key factors: ${topFactors.join('; ')}`);
      }
    }
    lines.push(`Timestamp: ${ts}`);
    const payload = {
      text: lines.join('\n'),
      host: entry.host || null,
      url: entry.url || null,
      reason: entry.reason || 'No reason provided',
      approver: entry.approver || null,
      timestamp: ts,
      pinRequired: Boolean(entry.pinRequired),
      policyReview: entry.policyReview || null,
      heuristics: entry.heuristics || null
    };
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch(err){
    console.error('[SafeBrowse] Override alert failed', err);
  }
}
