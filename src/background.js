let dnrRebuildMutex = Promise.resolve();

const HEARTBEAT_ALARM = 'sg-heartbeat';
const HEARTBEAT_PERIOD_MIN = 2;
const HEARTBEAT_THRESHOLD_MIN = 6;
const HEARTBEAT_SNOOZE_MIN = 5;
const FOCUS_ALARM = 'sg-focus-timer';

const FOCUS_DEFAULT_STATE = {
  active: false,
  startedAt: 0,
  endsAt: 0,
  durationMinutes: 0,
  pinProtected: false
};
const FOCUS_ALLOWED_DURATIONS = [30, 45, 60, 2]; // 2 minutes for quick testing
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
    'whatsapp.com',
    'messenger.com'
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
  return focusMode;
}

async function stopFocusSession(){
  const focusMode = { ...FOCUS_DEFAULT_STATE, endedAt: Date.now() };
  await chrome.storage.local.set({ focusMode });
  scheduleFocusAlarm(false);
  await updateBadge();
  return focusMode;
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
    console.error('[Safeguard] Focus timer error', err);
  }
}


chrome.alarms.onAlarm.addListener((alarm)=>{
  if (alarm && alarm.name === HEARTBEAT_ALARM){
    handleHeartbeat().catch((err)=>{
      console.error('[Safeguard] Heartbeat error', err);
    });
  }
  if (alarm && alarm.name === FOCUS_ALARM){
    handleFocusTick();
  }
});

chrome.runtime.onInstalled.addListener(()=>{
  console.log('Safeguard installed');
  updateBadge();
  rebuildDynamicRules();
  scheduleHeartbeat();
  recoverFocusSession();
});

function formatFocusBadge(remainingMs){
  const minutes = Math.max(0, Math.ceil(remainingMs / 60000));
  if (minutes > 999) return 'F!';
  return `F${minutes}`;
}

async function updateBadge(){
  try {
    const [{ enabled = true }, focus] = await Promise.all([
      new Promise((resolve)=>chrome.storage.sync.get({ enabled: true }, resolve)),
      getFocusState()
    ]);
    const now = Date.now();
    const focusActive = focus.active && focus.endsAt > now;
    const text = focusActive ? formatFocusBadge(focus.endsAt - now) : (enabled ? 'ON' : '');
    const color = focusActive ? '#2563eb' : (enabled ? '#16a34a' : '#9ca3af');
    chrome.action.setBadgeText({ text });
    if (text){
      chrome.action.setBadgeBackgroundColor({ color });
    }
  } catch(_e) {}
}

chrome.storage.onChanged.addListener((changes, area)=>{
  if (area === 'sync'){
    if (Object.prototype.hasOwnProperty.call(changes, 'enabled')){
      updateBadge();
      handleProtectionToggle(Boolean(changes.enabled.newValue)).catch((err)=>{
        console.error('[Safeguard] Protection toggle alert failed', err);
      });
    }
    if (Object.prototype.hasOwnProperty.call(changes, 'allowlist')){
      rebuildDynamicRules();
    }
  }
  if (area === 'local'){
    if (Object.prototype.hasOwnProperty.call(changes, 'userBlocklist')){
      rebuildDynamicRules();
    }
    if (Object.prototype.hasOwnProperty.call(changes, 'focusMode')){
      rebuildDynamicRules();
      recoverFocusSession();
    }
  }
});

// Also set badge when the service worker starts
updateBadge();
scheduleHeartbeat();
recoverFocusSession();
// Rebuild dynamic rules on service worker start to ensure rules are present
rebuildDynamicRules().catch((err)=>{
  console.error('[Safeguard] Initial DNR rebuild failed', err);
});
handleHeartbeat({ startup: true }).catch((err)=>{
  console.error('[Safeguard] Heartbeat startup check failed', err);
});

chrome.runtime.onStartup.addListener(()=>{
  scheduleHeartbeat();
  handleHeartbeat({ startup: true }).catch((err)=>{
    console.error('[Safeguard] Heartbeat startup check failed', err);
  });
  recoverFocusSession();
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

function domainToRegex(domain){
  // Match domain and all subdomains, http/https
  const esc = domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return `^https?://([a-z0-9-]+\\.)*${esc}(/|$)`;
}

async function rebuildDynamicRules(){
  let release = ()=>{};
  const wait = dnrRebuildMutex;
  dnrRebuildMutex = new Promise((resolve)=>{ release = resolve; });
  await wait;
  try{
    try{
      const cfg = await new Promise(r => chrome.storage.sync.get({ allowlist: [] }, r));
      const allowlist = Array.isArray(cfg.allowlist) ? cfg.allowlist : [];
      const local = await new Promise(r => chrome.storage.local.get({ userBlocklist: [] }, r));
      const userBlocklist = Array.isArray(local.userBlocklist) ? local.userBlocklist : [];
      const focus = await getFocusState();
      const focusActive = focus.active && focus.endsAt > Date.now();
      const block = await loadJsonResource('data/blocklist.json');
      const blockDomains = (block && Array.isArray(block.domains)) ? block.domains : [];

      const normalizeDomain = (value)=>String(value || '').trim().toLowerCase();
      const allowDomains = Array.from(new Set(allowlist.map(normalizeDomain).filter(Boolean)));
      const userDomains = Array.from(new Set(userBlocklist.map(normalizeDomain).filter(Boolean)));

      let id = 20000; // dynamic IDs start here
      const rules = [];

      // Allow rules take precedence via higher priority
      const focusAllowDomains = focusActive
        ? Array.from(new Set([ ...allowDomains, ...FOCUS_DEFAULT_ALLOWLIST.map(normalizeDomain) ]))
        : allowDomains;
      const allowPriority = focusActive ? 11000 : 10000;
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
        ].map(normalizeDomain).filter(Boolean)));
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
  }catch(e){
    // unexpected lock failure
    console.error('[Safeguard] DNR rebuild mutex error', e);
  } finally {
    release();
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse)=>{
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
      console.error('[Safeguard] Focus state fetch failed', err);
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
      console.error('[Safeguard] Focus start failed', err);
      sendResponse({ ok: false, error: 'failed-focus-start' });
    });
    return true;
  }
  if (message && message.type === 'sg-focus-stop'){
    stopFocusSession().then((state)=>{
      sendResponse({ ok: true, state });
    }).catch((err)=>{
      console.error('[Safeguard] Focus stop failed', err);
      sendResponse({ ok: false, error: 'failed-focus-stop' });
    });
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
    const webhook = typeof overrideAlertWebhook === 'string' ? overrideAlertWebhook.trim() : '';
    if (!webhook) return;
    const last = Number(lastHeartbeatAt) || 0;
    if (!last) return;
    const gapMinutes = (now - last) / 60000;
    if (!options.startup && gapMinutes <= HEARTBEAT_PERIOD_MIN + 1) return;
    if (gapMinutes < HEARTBEAT_THRESHOLD_MIN) return;
    const lastAlert = Number(lastTamperAlertAt) || 0;
    if (lastAlert && (now - lastAlert) < HEARTBEAT_SNOOZE_MIN * 60000) return;
    const payload = {
      text: `Safeguard heartbeat gap detected. Extension was offline for ~${Math.round(gapMinutes)} minute(s).`,
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
    console.error('[Safeguard] Tamper alert failed', err);
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
      text: 'Safeguard protection was paused. If this was unexpected, re-enable filtering immediately.',
      trigger: 'protection-disabled',
      detectedAt: new Date(now).toISOString()
    }, cfg, now, { force: true });
  } catch(err){
    console.error('[Safeguard] Protection toggle alert failed', err);
  }
}

async function sendTamperAlert(payload, cfg, timestamp, options = {}){
  const now = timestamp || Date.now();
  if (!cfg || !cfg.tamperAlertEnabled) return;
  const webhook = typeof cfg.overrideAlertWebhook === 'string' ? cfg.overrideAlertWebhook.trim() : '';
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
    const webhook = typeof cfg.overrideAlertWebhook === 'string' ? cfg.overrideAlertWebhook.trim() : '';
    if (!webhook) return;
    const ts = entry.timestamp ? new Date(entry.timestamp).toISOString() : new Date().toISOString();
    const lines = [];
    lines.push(`Safeguard override approved${entry.approver ? ` by ${entry.approver}` : ''}`);
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
    console.error('[Safeguard] Override alert failed', err);
  }
}
