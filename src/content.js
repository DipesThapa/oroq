(function(){
  // Advanced textual heuristic (non-exhaustive, on-device). Balanced for privacy and speed.
  const KW_STRONG = [
    'porn','xxx','hentai','onlyfans','pornhub','xvideos','xnxx','xhamster','redtube','youporn','brazzers','spankbang',
    'pornographie','pornografía','porno','sex tape','live sex','webcam sex','camgirl','cam boy',
    'nude','nudity','hardcore','softcore','fetish','bdsm','orgasm','blowjob','handjob','anal','threesome','milf','teen',
    'whore','slut','slutty','cum','cumshot','creampie','cunt','fuck','fucked','bondage','dominatrix','submissive','kink','demoness',
    'gagged','spank','buttplug','deepthroat','gangbang','facial','pegging'
  ];
  const KW_MEDIUM = [
    'adult','nsfw','explicit','erotic','escort','models','amateur','nsfw','18+','age verification','lust','filthy'
  ];
  const HOST_HINTS = ['porn','xxx','sex','hentai','xh','xv','xnxx','onlyfans','cam','lust','fuck','whore','slut','kink','bdsm'];
  const PATH_HINT_RX = /(\/porn|\/xxx|\/hentai|\/adult|\/sex|\/cum|\/fuck|\/slut|\/whore|\/kink|\/fetish)/;
  const URL_KEYWORD_RX = /(fuck|whore|slut|cum|bdsm|fetish|nsfw)/;
  const AGE_GATE_RX = /(18\+|adults? only|are you 18|age verification|enter if 18)/i;
  const NEGATIVE_RX = /(sex education|sexual education|sex ed|reproductive health|biology|anatomy|consent education|porn addiction help|porn recovery|filter porn|block porn|family safety|child safety|parental control|safesearch|wikipedia|encyclopedia|news report)/i;
  const PIN_ITERATIONS_FALLBACK = 200000;
  const VISUAL_SAMPLE_LIMIT = 8;
  const RISKY_MEDIA_HOSTS = ['instagram.com','cdninstagram.com','twitter.com','x.com','tiktok.com','facebook.com','fbcdn.net','messenger.com','snapchat.com','reddit.com','discord.com','pinimg.com'];
  const PHISHING_BRANDS = [
    { name: 'PayPal', keywords: ['paypal','pay pal'], domains: ['paypal.com', 'paypalobjects.com'] },
    { name: 'Microsoft', keywords: ['microsoft','office 365','outlook','onedrive'], domains: ['microsoft.com', 'live.com', 'office.com', 'sharepoint.com'] },
    { name: 'Google', keywords: ['google','gmail','google drive','g suite'], domains: ['google.com', 'gmail.com', 'drive.google.com'] },
    { name: 'Apple', keywords: ['apple id','icloud','itunes','apple'], domains: ['apple.com', 'icloud.com'] },
    { name: 'Amazon', keywords: ['amazon','aws'], domains: ['amazon.com', 'amazon.co.uk', 'aws.amazon.com'] },
    { name: 'Meta', keywords: ['facebook','instagram','meta','whatsapp'], domains: ['facebook.com', 'instagram.com', 'meta.com', 'whatsapp.com'] },
    { name: 'Bank', keywords: ['bank of america','wells fargo','hsbc','barclays','payment verification','santander','chase bank'], domains: [] },
    { name: 'Crypto', keywords: ['coinbase','binance','crypto.com','metamask'], domains: ['coinbase.com','binance.com','crypto.com','metamask.io'] },
    { name: 'Roblox', keywords: ['roblox'], domains: ['roblox.com'] },
    { name: 'Netflix', keywords: ['netflix'], domains: ['netflix.com'] },
    { name: 'Discord', keywords: ['discord'], domains: ['discord.com'] },
    { name: 'Steam', keywords: ['steam','valve'], domains: ['steampowered.com', 'steamcommunity.com'] },
    { name: 'Yahoo', keywords: ['yahoo'], domains: ['yahoo.com'] }
  ];
  const SUSPICIOUS_PHRASES = [
    'verify your account','verify account','reset your password','unusual activity','security alert',
    'update your payment','confirm your identity','unlock your account','immediate action required','account locked','suspend your account'
  ];
  const SUSPICIOUS_SCRIPT_RX = /(atob\s*\(|btoa\s*\(|fromcharcode|crypto-js|aes\.decrypt|document\.write\(.+base64)/i;
  const EXFIL_KEYWORDS = ['email','user','login','account','password','passcode','pin','otp','credential','token'];
  const ENCRYPTED_PAYLOAD_HINTS = [
    /[A-Za-z0-9+/=]{40,}/,
    /{"iv":".+","salt":".+","ct":".+"}/i
  ];
  const ENABLE_CYBER = false;
  const SUSPICIOUS_HOST_HINTS = ['trycloudflare.com','cloudflarepages.dev','cloudflarepage','repl.co','github.io','vercel.app','netlify.app','firebaseapp.com','appspot.com','glitch.me','pages.dev'];
  const LOGIN_HINTS = ['login','log in','sign in','signin','account','secure login','enter password'];
  const IMMEDIATE_BLOCK_HOSTS = ['trycloudflare.com','cloudflarepage','cloudflarepages.dev','repl.co','github.io','netlify.app','vercel.app','appspot.com','firebaseapp.com','glitch.me','render.com'];
  const ENABLE_INSIGHTS_PANEL = false;
  const PROFILE_TONE_COPY = {
    kids: {
      heading: 'Hold on - we are keeping kid-safe pages only.',
      detailFallback: 'Safeguard spotted something that looks grown-up or violent, so we paused the page.',
      suggestionPrefix: 'Try',
      suggestionFallback: 'Ask a trusted adult before opening a different site.',
      defaultSuggestions: ['BBC Bitesize','Nat Geo Kids','Duolingo'],
      microTitle: 'Mini safety lesson',
      microIntro: 'Before you continue, remember:',
      defaultProfileLabel: 'Kids (ages 7-12)'
    },
    teens: {
      heading: 'Heads up - this page didn\'t look safe for teens.',
      detailFallback: 'We saw wording or media that usually means adult or deceptive content.',
      suggestionPrefix: 'Switch to',
      suggestionFallback: 'Check with a safeguarding lead if this is needed for GCSE/KS4 work.',
      defaultSuggestions: ['BBC Bitesize GCSE','Khan Academy','Quizlet'],
      microTitle: 'AI literacy boost',
      microIntro: 'Use these quick checks next time:',
      defaultProfileLabel: 'Teens (ages 13-16)'
    },
    college: {
      heading: 'Pause and double-check this research page.',
      detailFallback: 'The page signalled adult themes or untrusted sources, so we blocked it for now.',
      suggestionPrefix: 'Try credible sources like',
      suggestionFallback: 'Talk to your DSL/tutor if this content is essential.',
      defaultSuggestions: ['Google Scholar','FutureLearn','GOV.UK education'],
      microTitle: 'Research-safe habits',
      microIntro: 'Keep coursework clean with these tips:',
      defaultProfileLabel: 'College profile'
    },
    work: {
      heading: 'Blocked to keep work accounts safe and focused.',
      detailFallback: 'The site matched a distraction or phishing pattern monitored for this profile.',
      suggestionPrefix: 'Stay on trusted portals such as',
      suggestionFallback: 'Log a request with IT/SecOps if this is a genuine business need.',
      defaultSuggestions: ['Microsoft 365','Slack','Notion'],
      microTitle: 'Cyber hygiene reminder',
      microIntro: 'Share these habits with your team:',
      defaultProfileLabel: 'Work profile'
    },
    general: {
      heading: 'Safeguard blocked this page.',
      detailFallback: 'Our local rules detected risky content before the page loaded.',
      suggestionPrefix: 'Use trusted sites like',
      suggestionFallback: 'Ask a safeguarding lead or parent before overriding.',
      defaultSuggestions: ['BBC Bitesize','National Geographic','Khan Academy'],
      microTitle: 'AI literacy tip',
      microIntro: 'Quick ways to stay safe:',
      defaultProfileLabel: 'this profile'
    }
  };
  const MICRO_LESSONS = {
    general: {
      mature: [
        'If a page asks you to confirm you are 18, treat it as adult-only and close it.',
        'Search the topic on a trusted education site instead of bypassing the block.',
        'Ask a safeguarding lead to review the need before overriding policy.'
      ],
      phishing: [
        'Check the full address bar for spelling errors before entering passwords.',
        'Real services never ask for MFA codes in random forms or popups.',
        'Open a fresh tab and navigate to the homepage manually when in doubt.'
      ],
      wellbeing: [
        'Take a short break every 30 minutes to reset your focus.',
        'Urgent or emotional headlines are often clickbait - slow down and verify.',
        'If something feels odd or too personal, ask a trusted adult before engaging.'
      ]
    },
    kids: {
      mature: [
        'If a page looks scary or grown-up, close it and tell a trusted adult.',
        'Stick to school links like BBC Bitesize or Nat Geo Kids for research.',
        'Never share photos or your name with strangers online.'
      ],
      phishing: [
        'Only type passwords into sites your teacher or parent showed you.',
        'If a page offers prizes for personal info, it is safer to say no and leave.',
        'Ask an adult before clicking links that look unusual or urgent.'
      ],
      wellbeing: [
        'Take eye breaks every 20 minutes so screens stay fun and safe.',
        'If something online feels uncomfortable, screenshot and show an adult.',
        'Use homework timers or Focus Mode to finish tasks before play time.'
      ]
    },
    teens: {
      mature: [
        'Cross-check shocking claims with a second trusted source before sharing.',
        'Sensational thumbnails are often clickbait - look for better sources.',
        'Keep revision on-task by bookmarking reliable study sites.'
      ],
      phishing: [
        'Look beyond the logo and inspect the URL before signing in.',
        'Urgent "verify now" popups are usually scams - open the service in a new tab instead.',
        'Use 2FA and never share one-time codes with anyone, even friends.'
      ],
      wellbeing: [
        'Set short break reminders so scrolling does not eat revision time.',
        'Mute or block accounts that pressure you to share personal info.',
        'AI images can fake events - compare them with trusted news first.'
      ]
    },
    college: {
      mature: [
        'Check whether an article cites primary sources before using it in coursework.',
        'If a topic feels sensitive, ask your DSL or tutor to approve material first.',
        'Only disable aggressive filtering if visuals are critical to the assignment.'
      ],
      phishing: [
        'Inspect the certificate padlock before entering institution credentials.',
        'Never reuse your uni password on other sites or tools.',
        'Hover over links in email to reveal the real destination before clicking.'
      ],
      wellbeing: [
        'Use a 45 minute focus timer so study blocks stay intentional.',
        'Summarise research in your own words instead of copy/pasting questionable sources.',
        'Pausing when a page feels manipulative protects your judgement.'
      ]
    },
    work: {
      mature: [
        'Keep work devices on approved research portals when reviewing sensitive topics.',
        'Separate personal browsing into another profile so audits stay simple.',
        'Document the business reason before overriding a block for compliance.'
      ],
      phishing: [
        'Verify payment or reset emails out-of-band before clicking links.',
        'Look for domain mismatches even if the branding looks polished.',
        'Use the report phishing control so SecOps can warn others quickly.'
      ],
      wellbeing: [
        'Use Focus or Do Not Disturb modes to protect deep work.',
        'Blocking social feeds during work hours keeps your audit trail clean.',
        'Escalate anything suspicious to IT/SecOps instead of investigating alone.'
      ]
    }
  };
  let interactionGuard = null;
  let phishObserver = null;
  let phishObserverTimer = null;
  const visionCache = new Map(); // local-only image inference cache

  chrome.runtime.onMessage.addListener((message, sender, sendResponse)=>{
    if (message && message.type === 'sg-open-approver-prompt'){
      let value = '';
      try {
        value = window.prompt(message.prompt || 'Who approved this override? (initials/name)') || '';
      } catch(_e){
        value = '';
      }
      sendResponse({ approver: value.trim() });
      return true;
    }
    return false;
  });

  function bufferToBase64(buffer){
    if (!buffer) return '';
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1){
      binary += String.fromCharCode(bytes[i]);
    }
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

  async function verifyPinOverride(pin, stored){
    if (!stored || !stored.hash || !stored.salt) return false;
    try {
      const iterations = Number(stored.iterations) > 10000 ? Number(stored.iterations) : PIN_ITERATIONS_FALLBACK;
      const saltBytes = base64ToUint8Array(stored.salt);
      if (!saltBytes) return false;
      const encoder = new TextEncoder();
      const material = await crypto.subtle.importKey('raw', encoder.encode(pin), { name: 'PBKDF2' }, false, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits({
        name: 'PBKDF2',
        salt: saltBytes.buffer,
        iterations,
        hash: 'SHA-256'
      }, material, 256);
      return bufferToBase64(bits) === stored.hash;
    } catch(_e){
      return false;
    }
  }

  function sanitizePolicyReview(review){
    if (!review || typeof review !== 'object') return null;
    const safe = {
      score: Number.isFinite(review.score) ? Math.round(review.score) : null,
      verdict: typeof review.verdict === 'string' ? review.verdict : null,
      factors: Array.isArray(review.factors) ? review.factors.map((factor)=>({
        code: factor && factor.code ? String(factor.code).slice(0, 32) : null,
        label: factor && factor.label ? String(factor.label).slice(0, 140) : null,
        weight: typeof factor?.weight === 'number' ? Math.round(factor.weight) : null
      })) : [],
      reasonSummary: typeof review.reasonSummary === 'string' ? review.reasonSummary.slice(0, 240) : null
    };
    return safe;
  }

  function sanitizeHeuristicsSnapshot(snapshot){
    if (!snapshot || typeof snapshot !== 'object') return null;
    return {
      riskScore: Number.isFinite(snapshot.riskScore) ? snapshot.riskScore : null,
      riskThreshold: Number.isFinite(snapshot.riskThreshold) ? snapshot.riskThreshold : null,
      riskLevel: snapshot.riskLevel || null,
      riskSummary: snapshot.riskSummary || null,
      riskPercent: Number.isFinite(snapshot.riskPercent) ? snapshot.riskPercent : null,
      riskMax: Number.isFinite(snapshot.riskMax) ? snapshot.riskMax : null,
      signals: Array.isArray(snapshot.signals) ? snapshot.signals.map((signal)=>({
        id: signal && signal.id ? String(signal.id).slice(0, 40) : null,
        icon: signal && signal.icon ? String(signal.icon).slice(0, 10) : null,
        label: signal && signal.label ? String(signal.label).slice(0, 120) : null,
        detail: signal && signal.detail ? String(signal.detail).slice(0, 240) : null,
        weight: typeof signal?.weight === 'number' ? signal.weight : null,
        meta: Array.isArray(signal?.meta) ? signal.meta.slice(0, 3) : null
      })) : []
    };
  }

  async function recordOverrideEvent(reasonText, options = {}){
    try {
      let approver = '';
      try {
        const resp = await chrome.runtime.sendMessage({ type: 'sg-get-override-approver' });
        if (resp && resp.approver) approver = String(resp.approver || '').trim();
      } catch(_e){}
      const entry = {
        timestamp: Date.now(),
        host: getHost(),
        url: (()=>{ try { return location.href; } catch(_e){ return null; } })(),
        reason: (reasonText || '').trim(),
        pinRequired: Boolean(options.pinRequired),
        source: options.source || 'interstitial',
        approver,
        policyReview: sanitizePolicyReview(options.policyReview),
        heuristics: sanitizeHeuristicsSnapshot(options.heuristics)
      };
      const payload = await new Promise((resolve)=>chrome.storage.local.get({ overrideLog: [] }, resolve));
      const existing = Array.isArray(payload.overrideLog) ? payload.overrideLog.filter((item)=>item && typeof item === 'object') : [];
      const maxEntries = 100;
      const next = existing.slice(Math.max(0, existing.length - (maxEntries - 1)));
      next.push(entry);
      await new Promise((resolve)=>chrome.storage.local.set({ overrideLog: next }, resolve));
      try {
        chrome.runtime.sendMessage({ type: 'sg-override-alert', entry });
      } catch(_err){
        // ignore message failures
      }
    } catch(_e){
      // swallow logging errors to avoid blocking override
    }
  }

  function getHost(){
    try { return location.hostname.replace(/^www\./,'').toLowerCase(); } catch{ return ''; }
  }

  async function loadBlocklist(){
    try {
      const url = chrome.runtime.getURL('data/blocklist.json');
      const res = await fetch(url);
      if(!res.ok) return {domains:[]};
      return await res.json();
    } catch(_e){ return {domains:[]}; }
  }

  function evaluateKeywordSignals(text){
    const lower = (text || '').toLowerCase();
    const result = {
      score: 0,
      strong: [],
      medium: [],
      ageGate: false,
      negative: false
    };
    if (!lower) return result;
    result.ageGate = AGE_GATE_RX.test(lower);
    result.negative = NEGATIVE_RX.test(lower);
    for (const word of KW_STRONG){
      if (!lower.includes(word)) continue;
      if (!result.strong.includes(word)) result.strong.push(word);
      result.score += 3;
    }
    for (const word of KW_MEDIUM){
      if (!lower.includes(word)) continue;
      if (!result.medium.includes(word)) result.medium.push(word);
      result.score += 1;
    }
    if (result.ageGate) result.score += 5;
    if (result.negative) result.score -= 4; // de-emphasize educational/safety contexts
    return result;
  }

  function evaluateMetaSignals(){
    const aggregate = {
      score: 0,
      strong: new Set(),
      medium: new Set(),
      ageGate: false,
      negative: false
    };
    try{
      const titleEval = evaluateKeywordSignals(document.title || '');
      if (titleEval.score){
        aggregate.score += Math.min(6, titleEval.score);
        titleEval.strong.forEach((kw)=>aggregate.strong.add(kw));
        titleEval.medium.forEach((kw)=>aggregate.medium.add(kw));
        if (titleEval.ageGate) aggregate.ageGate = true;
        if (titleEval.negative) aggregate.negative = true;
      }
    }catch(_e){}
    try{
      const metas = document.querySelectorAll('meta[name="description"], meta[name="keywords"], meta[property="og:title"], meta[property="og:description"]');
      metas.forEach((node)=>{
        const value = node && typeof node.content === 'string' ? node.content : '';
        if (!value) return;
        const details = evaluateKeywordSignals(value);
        if (!details.score) return;
        const applied = Math.min(6, details.score);
        aggregate.score += applied;
        details.strong.forEach((kw)=>aggregate.strong.add(kw));
        details.medium.forEach((kw)=>aggregate.medium.add(kw));
        if (details.ageGate) aggregate.ageGate = true;
        if (details.negative) aggregate.negative = true;
      });
    }catch(_e){}
    return {
      score: aggregate.score,
      strong: Array.from(aggregate.strong),
      medium: Array.from(aggregate.medium),
      ageGate: aggregate.ageGate,
      negative: aggregate.negative
    };
  }

  function evaluateUrlSignals(){
    const result = { score: 0, signals: [] };
    try{
      const current = new URL(location.href);
      const host = (current.hostname || '').toLowerCase();
      if (/\.xxx$/i.test(host)){
        result.score += 8;
        result.signals.push({
          id: 'tld',
          icon: 'URL',
          label: 'Adult-only top level domain',
          detail: 'Domain ends with .xxx, commonly reserved for adult sites.',
          weight: 8
        });
      }
      const hostHint = HOST_HINTS.find((hint)=>host.includes(hint));
      if (hostHint){
        result.score += 6;
        result.signals.push({
          id: 'host-hint',
          icon: 'URL',
          label: 'Domain keyword match',
          detail: `Hostname contains “${hostHint}”, which is frequently associated with adult content.`,
          weight: 6
        });
      }
      const path = (current.pathname || '').toLowerCase();
      const pathMatch = path.match(PATH_HINT_RX);
      if (pathMatch){
        result.score += 3;
        result.signals.push({
          id: 'path',
          icon: 'URL',
          label: 'Sensitive path detected',
          detail: `URL path includes “${pathMatch[0]}”.`,
          weight: 3
        });
      }
      const hrefLower = current.href.toLowerCase();
      const hrefMatch = hrefLower.match(URL_KEYWORD_RX);
      if (hrefMatch){
        result.score += 2;
        result.signals.push({
          id: 'query',
          icon: 'URL',
          label: 'Adult keyword in URL',
          detail: `Full URL contains “${hrefMatch[0]}”.`,
          weight: 2
        });
      }
    }catch(_e){}
    return result;
  }

  function evaluateVisualSignals(){
    const result = { score: 0, ratio: 0, sampled: 0, aiDetections: [] };
    try {
      const imgs = Array.from(document.images || []).filter((img)=>img && img.complete && img.naturalWidth && img.naturalHeight);
      if (!imgs.length) return result;
      let maxRatio = 0;
      let processed = 0;
      const aiHits = {};
      for (const img of imgs){
        if (processed >= VISUAL_SAMPLE_LIMIT) break;
        const ratio = sampleImageSkinRatio(img);
        if (Number.isFinite(ratio) && ratio > maxRatio) maxRatio = ratio;
        const vision = runLocalVisionScan(img);
        if (vision && Array.isArray(vision.detections)){
          vision.detections.forEach((det)=>{
            if (!det || !det.label) return;
            const key = det.label;
            if (!aiHits[key] || (det.confidence || 0) > (aiHits[key].confidence || 0)){
              aiHits[key] = det;
            }
            if (det.label === 'nsfw' && ratio >= 0.6 && (det.confidence || 0) >= 0.7){
              try{ mask(img); }catch(_e){}
            }
          });
        }
        processed += 1;
        if (maxRatio >= 0.6) break;
      }
      result.ratio = maxRatio;
      result.sampled = processed;
      if (maxRatio >= 0.55) result.score = 9;
      else if (maxRatio >= 0.4) result.score = 6;
      else if (maxRatio >= 0.25) result.score = 3;

      const aiList = Object.values(aiHits);
      result.aiDetections = aiList;
      if (aiList.length){
        const aiScore = deriveAiScore(aiList);
        result.score = Math.max(result.score, aiScore);
      }
    } catch(_e){
      // ignore visual sampling failures; leave score at 0
    }
    return result;
  }

  function scoreFromText(text){
    return evaluateKeywordSignals(text).score;
  }

  function isLikelySkin(r, g, b){
    // Transform to YCbCr and apply common skin detection ranges
    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    if (r > 250 && g > 250 && b > 250) return false; // exclude white
    return cr > 135 && cr < 180 && cb > 85 && cb < 135 && r > 35 && g > 40 && b > 20;
  }

  function sampleImageSkinRatio(img){
    try {
      if (!img || !img.naturalWidth || !img.naturalHeight) return 0;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (w < 80 || h < 80) return 0;
      const maxSample = 140;
      const scale = Math.min(1, maxSample / Math.max(w, h));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return 0;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let skin = 0;
      let total = 0;
      for (let i = 0; i < data.length; i += 4){
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (isLikelySkin(r, g, b)) skin += 1;
        total += 1;
      }
      if (!total) return 0;
      return skin / total;
    } catch(_e){
      return 0;
    }
  }

  function runLocalVisionScan(img){
    const key = img && (img.currentSrc || img.src || '');
    if (key && visionCache.has(key)) return visionCache.get(key);
    const features = sampleImageFeatures(img);
    const host = getHost();
    if (features && features.tainted){
      if (isRiskyMediaHost(host)){
        try{ mask(img); }catch(_e){}
        const taintDetection = {
          detections: [{
            label: 'nsfw',
            confidence: 0.55,
            meta: 'Cross-origin media on social host',
            tainted: true
          }],
          features
        };
        if (key) visionCache.set(key, taintDetection);
        return taintDetection;
      }
      if (key) visionCache.set(key, null);
      return null;
    }
    if (!features){
      if (key) visionCache.set(key, null);
      return null;
    }
    const detections = [];
    const nsfwConfidence = clamp01((features.skinRatio - 0.18) / 0.28);
    if (nsfwConfidence > 0.2){
      detections.push({
        label: 'nsfw',
        confidence: nsfwConfidence,
        meta: `Skin-tone density ${(features.skinRatio * 100).toFixed(0)}%`
      });
    }
    const violenceConfidence = clamp01(((features.redRatio - 0.14) / 0.22) * (features.darkRatio > 0.2 ? 1 : 0.6));
    if (violenceConfidence > 0.25){
      detections.push({
        label: 'violence',
        confidence: violenceConfidence,
        meta: `Red-heavy ${(features.redRatio * 100).toFixed(0)}%, dark ${(features.darkRatio * 100).toFixed(0)}%`
      });
    }
    const weaponConfidence = clamp01(((features.edgeDensity - 0.1) / 0.16) * (features.grayRatio > 0.35 ? 1 : 0.6));
    if (weaponConfidence > 0.25){
      detections.push({
        label: 'weapon',
        confidence: weaponConfidence,
        meta: `High-contrast edges ${(features.edgeDensity * 100).toFixed(0)}%`
      });
    }
    const result = { detections, features };
    if (key) visionCache.set(key, result);
    return result;
  }

  function sampleImageFeatures(img){
    try{
      if (!img || !img.naturalWidth || !img.naturalHeight) return null;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (w < 60 || h < 60) return null;
      const maxSample = 140;
      const scale = Math.min(1, maxSample / Math.max(w, h));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      let imageData = null;
      try{
        imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      } catch(_sec){
        return { tainted: true };
      }
      const data = imageData.data;
      let skin = 0;
      let total = 0;
      let redHeavy = 0;
      let dark = 0;
      let grayish = 0;
      let edgeScore = 0;
      const width = canvas.width;
      const height = canvas.height;
      for (let y = 0; y < height; y += 1){
        for (let x = 0; x < width; x += 1){
          const idx = (y * width + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const bright = (r + g + b) / 3;
          if (isLikelySkin(r, g, b)) skin += 1;
          if (r > g + 25 && r > b + 25) redHeavy += 1;
          if (bright < 60) dark += 1;
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          if (max - min < 18) grayish += 1;
          // crude edge magnitude using right/down neighbors
          if (x < width - 1 && y < height - 1){
            const idxRight = idx + 4;
            const idxDown = idx + width * 4;
            const dr = Math.abs(r - data[idxRight]);
            const dg = Math.abs(g - data[idxRight + 1]);
            const db = Math.abs(b - data[idxRight + 2]);
            const dr2 = Math.abs(r - data[idxDown]);
            const dg2 = Math.abs(g - data[idxDown + 1]);
            const db2 = Math.abs(b - data[idxDown + 2]);
            const mag = dr + dg + db + dr2 + dg2 + db2;
            if (mag > 200) edgeScore += 1;
          }
          total += 1;
        }
      }
      if (!total) return null;
      return {
        skinRatio: skin / total,
        redRatio: redHeavy / total,
        darkRatio: dark / total,
        grayRatio: grayish / total,
        edgeDensity: edgeScore / total
      };
    }catch(_e){
      return { tainted: true };
    }
  }

  function isRiskyMediaHost(host){
    if (!host) return false;
    const h = host.toLowerCase();
    return RISKY_MEDIA_HOSTS.some((entry)=>{
      const normalized = entry.toLowerCase();
      return h === normalized || h.endsWith('.' + normalized);
    });
  }

  function clamp01(value){
    if (!Number.isFinite(value)) return 0;
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
  }

  function deriveAiScore(detections){
    if (!Array.isArray(detections) || !detections.length) return 0;
    let score = 0;
    detections.forEach((det)=>{
      if (!det || !det.label) return;
      const conf = clamp01(det.confidence || 0);
      if (det.label === 'nsfw'){
        if (conf >= 0.7) score = Math.max(score, 12);
        else if (conf >= 0.6) score = Math.max(score, 10);
        else score = Math.max(score, 6 + conf * 2);
      }
    });
    return Math.min(12, score || 0);
  }

  function formatKeywordList(list, limit = 4){
    if (!Array.isArray(list) || !list.length) return '';
    const trimmed = list.slice(0, limit);
    return trimmed.join(', ') + (list.length > limit ? '…' : '');
  }

  function deriveRiskLevel(score, threshold){
    const safeThreshold = typeof threshold === 'number' ? threshold : 0;
    const delta = score - safeThreshold;
    if (delta >= 12) return 'Critical risk';
    if (delta >= 6) return 'High risk';
    if (delta >= 2) return 'Elevated risk';
    return 'Warning';
  }

  function signalFriendlySummary(signal){
    if (!signal || !signal.id) return null;
    const id = signal.id;
    if (id === 'host' || id === 'policy'){
      return 'We blocked this entire site because it is on a banned list.';
    }
    if (id === 'path' || id === 'host-hint' || id === 'tld' || id === 'query'){
      return 'The site address itself contains words linked to adult material.';
    }
    if (id === 'visual'){
      return 'Images on the page looked like nudity, so we hid the page before it loaded.';
    }
    if (id === 'body-keywords' || id === 'meta-keywords'){
      return 'The text on the page mentions adult topics that are unsafe for young people.';
    }
    if (id === 'body-age-gate' || id === 'meta-age-gate'){
      return 'This page asks visitors to confirm they are over 18, so we treat it as adult content.';
    }
    if (id === 'body-context' || id === 'meta-context'){
      return 'We spotted educational wording but still kept the block to stay cautious.';
    }
    if (id === 'phish-brand'){
      return 'The page uses a well-known brand name but is not on that brand’s official website.';
    }
    if (id === 'phish-host-brand'){
      return 'The site address itself tries to mimic a trusted brand but is not official.';
    }
    if (id === 'phish-form'){
      return 'Password boxes send information to a different website than the one you opened.';
    }
    if (id === 'phish-http'){
      return 'The login form is unsecured and could expose your password.';
    }
    if (id === 'phish-favicon'){
      return 'Legitimate sites host their own icons; a different icon host can signal a fake page.';
    }
    if (id === 'phish-buttons'){
      return 'Scammers often use urgent buttons like “Verify now” to rush people.';
    }
    if (id === 'phish-insecure-context'){
      return 'Browsers warn that this page is not secure for entering sensitive data.';
    }
    if (id === 'phish-contextmenu'){
      return 'Blocking right-click is a trick phishing sites use to stop people copying links.';
    }
    if (id === 'phish-feed'){
      return 'Independent threat feeds marked this site as phishing.';
    }
    if (id === 'phish-phrases'){
      return 'Scammers often use urgent phrases to rush people into clicking.';
    }
    if (id === 'phish-script'){
      return 'Hidden scripts on the page match patterns from known phishing kits.';
    }
    if (id === 'phish-logo'){
      return 'The page embeds brand logos in an unusual way to impersonate trusted sites.';
    }
    return 'Safeguard spotted patterns that usually mean the page is unsafe.';
  }

  function normalizeTone(value){
    if (!value) return null;
    const tone = String(value).toLowerCase();
    if (tone.startsWith('kid') || tone.startsWith('primary')) return 'kids';
    if (tone.startsWith('teen')) return 'teens';
    if (tone.includes('college') || tone.includes('sixth')) return 'college';
    if (tone === 'work' || tone === 'adult') return 'work';
    return null;
  }

  function sanitizeSuggestionList(list){
    const entries = [];
    if (!Array.isArray(list)) return entries;
    list.forEach((item)=>{
      const text = String(item || '').trim();
      if (!text) return;
      if (entries.length >= 3) return;
      entries.push(text);
    });
    return entries;
  }

  function pickHighestWeightSignal(signals){
    if (!Array.isArray(signals) || !signals.length) return null;
    return signals.reduce((best, current)=>{
      if (!current) return best;
      const weight = typeof current.weight === 'number' ? current.weight : 0;
      const bestWeight = typeof (best && best.weight) === 'number' ? best.weight : -Infinity;
      if (!best || weight > bestWeight) return current;
      return best;
    }, null);
  }

  function formatFriendlyList(list){
    if (!Array.isArray(list) || !list.length) return '';
    if (list.length === 1) return list[0];
    if (list.length === 2) return `${list[0]} or ${list[1]}`;
    const head = list.slice(0, list.length - 1).join(', ');
    const tail = list[list.length - 1];
    return `${head}, or ${tail}`;
  }

  function buildFriendlyExplanation({ reason, tone, profileLabel, signal, suggestions }){
    const normalizedTone = normalizeTone(tone) || 'general';
    const copy = PROFILE_TONE_COPY[normalizedTone] || PROFILE_TONE_COPY.general;
    const resolvedProfileLabel = profileLabel || copy.defaultProfileLabel;
    const friendly = signalFriendlySummary(signal);
    const detail = friendly || copy.detailFallback.replace('{reason}', reason || 'our safety rules');
    const suggestionList = sanitizeSuggestionList(suggestions);
    const sourceList = suggestionList.length ? suggestionList : copy.defaultSuggestions;
    const suggestion = sourceList && sourceList.length
      ? `${copy.suggestionPrefix} ${formatFriendlyList(sourceList)}.`
      : copy.suggestionFallback;
    return {
      tone: normalizedTone,
      heading: copy.heading,
      detail,
      suggestion,
      microTitle: copy.microTitle,
      microIntro: copy.microIntro,
      profileLabel: resolvedProfileLabel
    };
  }

  function determineSignalTopic(signal){
    const id = signal && signal.id ? String(signal.id) : '';
    if (!id) return 'wellbeing';
    if (id.startsWith('phish')) return 'phishing';
    if (id === 'policy' || id === 'host' || id === 'host-hint' || id === 'tld' || id === 'query' ||
        id === 'visual' || id === 'body-keywords' || id === 'meta-keywords' ||
        id === 'body-age-gate' || id === 'meta-age-gate'){
      return 'mature';
    }
    return 'wellbeing';
  }

  function pickMicroLessons(tone, topic, seedValue){
    const normalizedTone = normalizeTone(tone) || 'general';
    const bank = MICRO_LESSONS[normalizedTone] || MICRO_LESSONS.general;
    const topicList = (bank[topic] && bank[topic].length) ? bank[topic] : null;
    const fallbackBank = MICRO_LESSONS.general;
    const resolvedTopic = topicList && topicList.length
      ? topicList
      : ((fallbackBank[topic] && fallbackBank[topic].length) ? fallbackBank[topic] : fallbackBank.wellbeing);
    return rotateList(resolvedTopic || [], seedValue || '', 3);
  }

  function rotateList(list, seed, take){
    if (!Array.isArray(list) || !list.length) return [];
    const length = Math.min(take || 3, list.length);
    const source = String(seed || 'safeguard');
    let hash = 0;
    for (let i = 0; i < source.length; i += 1){
      hash = (hash + source.charCodeAt(i)) % 100000;
    }
    const start = hash % list.length;
    const result = [];
    for (let i = 0; i < length; i += 1){
      result.push(list[(start + i) % list.length]);
    }
    return result;
  }

  function createHeuristicInsights(context){
    const host = context.host || '';
    const totalScore = Number.isFinite(context.total) ? context.total : 0;
    const threshold = Number.isFinite(context.threshold) ? context.threshold : 0;
    const urlEval = context.urlEval || { signals: [] };
    const metaEval = context.metaEval || { strong: [], medium: [], ageGate: false, negative: false, score: 0 };
    const bodyEval = context.bodyEval || { strong: [], medium: [], ageGate: false, negative: false, score: 0 };
    const visualEval = context.visualEval || { score: 0, ratio: 0, sampled: 0 };

    const signals = [];
    if (urlEval && Array.isArray(urlEval.signals)){
      urlEval.signals.forEach((sig)=>signals.push(sig));
    }
    if (visualEval && visualEval.score){
      const ratioPercent = Math.round((visualEval.ratio || 0) * 100);
      const detail = ratioPercent
        ? `Approx ${ratioPercent}% of sampled pixels matched skin-tone patterns.`
        : 'On-page imagery showed a high skin-tone density.';
      const meta = [];
      if (visualEval.sampled) meta.push(`Analysed ${visualEval.sampled} image${visualEval.sampled === 1 ? '' : 's'}`);
      signals.push({
        id: 'visual',
        icon: 'IMG',
        label: 'Visual scan flagged nudity risk',
        detail,
        weight: visualEval.score,
        meta
      });
    }
    if (visualEval && Array.isArray(visualEval.aiDetections) && visualEval.aiDetections.length){
      const labels = visualEval.aiDetections.map((d)=>d && d.label ? d.label : null).filter(Boolean);
      const unique = Array.from(new Set(labels));
      const detailParts = visualEval.aiDetections.map((d)=>{
        if (!d || !d.label) return null;
        const conf = Number.isFinite(d.confidence) ? `${Math.round(clamp01(d.confidence) * 100)}%` : '';
        return `${d.label.toUpperCase()}${conf ? ` (${conf})` : ''}${d.meta ? ` — ${d.meta}` : ''}`;
      }).filter(Boolean);
      signals.push({
        id: 'visual-ai',
        icon: 'AI',
        label: `On-device AI flagged: ${unique.join(', ')}`,
        detail: detailParts.join('; '),
        weight: Math.max(...visualEval.aiDetections.map((d)=>{
          return clamp01(d.confidence || 0) * 10 + 2;
        })),
        meta: ['Local-only scan, no images leave the browser']
      });
    }
    if (bodyEval){
      const keywordWeight = bodyEval.strong.length * 3 + bodyEval.medium.length;
      if (keywordWeight > 0){
        const detailParts = [];
        if (bodyEval.strong.length) detailParts.push(`High-risk terms: ${formatKeywordList(bodyEval.strong)}`);
        if (bodyEval.medium.length) detailParts.push(`Additional terms: ${formatKeywordList(bodyEval.medium)}`);
        signals.push({
          id: 'body-keywords',
          icon: 'TXT',
          label: 'Risky language in page text',
          detail: detailParts.join('. '),
          weight: Math.min(12, keywordWeight)
        });
      }
      if (bodyEval.ageGate){
        signals.push({
          id: 'body-age-gate',
          icon: 'TXT',
          label: '18+ prompt detected',
          detail: 'Page copy asks the visitor to confirm they are over 18.',
          weight: 5
        });
      }
      if (bodyEval.negative){
        signals.push({
          id: 'body-context',
          icon: 'NOTE',
          label: 'Educational context noted',
          detail: 'Safeguard reduced the score because safeguarding/educational wording is present.',
          weight: -4
        });
      }
    }
    if (metaEval && metaEval.score){
      if (metaEval.strong.length || metaEval.medium.length){
        const detailParts = [];
        if (metaEval.strong.length) detailParts.push(`High-risk metadata: ${formatKeywordList(metaEval.strong)}`);
        if (metaEval.medium.length) detailParts.push(`Other metadata terms: ${formatKeywordList(metaEval.medium)}`);
        signals.push({
          id: 'meta-keywords',
          icon: 'META',
          label: 'Metadata references adult content',
          detail: detailParts.join('. '),
          weight: Math.min(12, metaEval.score)
        });
      }
      if (metaEval.ageGate && !(bodyEval && bodyEval.ageGate)){
        signals.push({
          id: 'meta-age-gate',
          icon: 'META',
          label: '18+ prompt in metadata',
          detail: 'Open Graph / SEO metadata references age verification language.',
          weight: 5
        });
      }
      if (metaEval.negative && !(bodyEval && bodyEval.negative)){
        signals.push({
          id: 'meta-context',
          icon: 'NOTE',
          label: 'Educational metadata noted',
          detail: 'Safeguard reduced the score because the metadata references education or safeguarding terms.',
          weight: -4
        });
      }
    }

    const seen = new Set();
    const uniqueSignals = [];
    for (const sig of signals){
      if (!sig || !sig.id) continue;
      if (seen.has(sig.id)) continue;
      seen.add(sig.id);
      uniqueSignals.push(sig);
    }
    if (host && !seen.has('host')){
      uniqueSignals.unshift({
        id: 'host',
        icon: 'URL',
        label: 'Blocked host',
        detail: host,
        weight: 0
      });
    }

    const safeThreshold = Math.max(0, threshold);
    const safeScore = Math.max(0, totalScore);
    const gaugeMax = Math.max(12, safeThreshold + 12);
    const riskPercent = Math.max(0, Math.min(100, Math.round((safeScore / gaugeMax) * 100)));
    const riskLevel = deriveRiskLevel(safeScore, safeThreshold);
    const pillText = `${riskLevel} • Safeguard heuristics`;
    return {
      pillText,
      riskScore: safeScore,
      riskThreshold: safeThreshold,
      riskLevel,
      riskSummary: `Score ${Math.round(safeScore)} vs threshold ${Math.round(safeThreshold)}.`,
      riskPercent,
      riskMax: gaugeMax,
      signals: uniqueSignals
    };
  }

  async function loadPhishingFeed(){
    if (!ENABLE_CYBER) return [];
    try {
      const cache = await chrome.storage.local.get({ phishingFeedCache: null });
      if (Array.isArray(cache.phishingFeedCache)) return cache.phishingFeedCache;
    } catch(_e){}
    try {
      const url = chrome.runtime.getURL('data/phishing_feed.json');
      const res = await fetch(url);
      if (!res.ok) throw new Error('feed fetch failed');
      const data = await res.json();
      return Array.isArray(data.entries) ? data.entries : [];
    } catch(_e){
      return [];
    }
  }

  function createBlocklistInsights({ host }){
    const signals = [{
      id: 'policy',
      icon: 'POL',
      label: 'Policy blocklist match',
      detail: 'This domain is on the centrally managed Safeguard blocklist.',
      weight: 12
    }];
    if (host){
      signals.push({
        id: 'host',
        icon: 'URL',
        label: 'Blocked host',
        detail: host,
        weight: 0
      });
    }
    return {
      pillText: 'Policy block enforced',
      riskScore: 24,
      riskThreshold: 12,
      riskLevel: 'Policy blocked',
      riskSummary: 'Safeguard blocked this domain due to administrator policy.',
      riskPercent: 100,
      riskMax: 24,
      signals
    };
  }

  function normalizeHost(value){
    return (value || '').trim().replace(/^https?:\/\//,'').replace(/\/.*$/,'').replace(/^www\./,'').toLowerCase();
  }

  function typosquatScore(host, domain){
    const a = host || '';
    const b = domain || '';
    const len = Math.max(a.length, b.length);
    if (!len) return Infinity;
    let diff = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i += 1){
      if (a[i] !== b[i]) diff += 1;
    }
    diff += Math.abs(a.length - b.length);
    return diff;
  }

  function isOfficialBrandHost(host, brand){
    return (brand.domains || []).some((domain)=>{
      const clean = normalizeHost(domain);
      return host === clean || host.endsWith('.' + clean);
    });
  }

  function evaluatePhishingSignals(options = {}){
    if (!ENABLE_CYBER) return null;
    const host = getHost();
    if (!host) return null;
    const strict = Boolean(options.strict);
    const feedEntries = Array.isArray(options.feedEntries) ? options.feedEntries : [];
    const signals = [];
    let score = 0;
    const textSample = (
      (document.title || '') + ' ' +
      ((document.body && document.body.innerText) ? document.body.innerText : '')
    ).toLowerCase().slice(0, 6000);

    PHISHING_BRANDS.forEach((brand)=>{
      const hit = brand.keywords.some((kw)=>textSample.includes(kw));
      if (!hit) return;
      const isOfficial = isOfficialBrandHost(host, brand);
      if (!isOfficial){
        signals.push({
          id: 'phish-brand',
          icon: 'SHLD',
          label: `${brand.name} mentioned`,
          detail: `Page mentions ${brand.name}, but you are on ${host}.`,
          weight: 6,
          meta: brand.domains && brand.domains.length ? [`Official domains: ${brand.domains.join(', ')}`] : null
        });
        score += 6;
      }
      const hostContainsBrand = brand.keywords.some((kw)=>host.includes(kw.replace(/\s+/g, '')));
      if (hostContainsBrand && !isOfficial){
        const closest = (brand.domains || [host]).reduce((best, domain)=>{
          const val = typosquatScore(host, normalizeHost(domain));
          return val < best ? val : best;
        }, Infinity);
        if (closest <= 3){
          signals.push({
            id: 'phish-host-brand',
            icon: 'DNS',
            label: `${brand.name} look-alike domain`,
            detail: `The site address ${host} resembles ${brand.name} but isn’t official.`,
            weight: 10
          });
          score += 10;
        }
      }
    });

    const phraseHits = SUSPICIOUS_PHRASES.filter((phrase)=>textSample.includes(phrase));
    if (phraseHits.length){
      signals.push({
        id: 'phish-phrases',
        icon: 'TXT',
        label: 'Urgent security message',
        detail: `The page contains phrases such as “${phraseHits.slice(0, 2).join('”, “')}”.`,
        weight: 4
      });
      score += 4;
    }

    const hostHint = SUSPICIOUS_HOST_HINTS.find((hint)=>host.includes(hint.replace(/^\*\./,'').toLowerCase()));
    if (hostHint && LOGIN_HINTS.some((kw)=>textSample.includes(kw))){
      signals.push({
        id: 'phish-host-hint',
        icon: 'URL',
        label: 'Untrusted hosting domain',
        detail: `This login is hosted on ${host}, a domain often used for phishing staging (“${hostHint}”).`,
        weight: 8
      });
      score += 8;
    }

    const forms = Array.from(document.forms || []);
    forms.forEach((form)=>{
      try {
        const actionAttr = form.getAttribute('action') || '';
        if (!actionAttr) return;
        const formUrl = new URL(actionAttr, location.href);
        const targetHost = (formUrl.hostname || '').toLowerCase();
        if (!targetHost || !host) return;
        if (targetHost !== host && !targetHost.endsWith('.' + host)){
          const credsInputs = Array.from(form.querySelectorAll('input[type="password"], input[name*="pass"], input[name*="otp"], input[name*="pin"]'));
          if (credsInputs.length){
            signals.push({
              id: 'phish-form',
              icon: 'FORM',
              label: 'Login posts elsewhere',
              detail: `This form submits to ${targetHost}, not ${host}.`,
              weight: 7
            });
            score += 7;
          }
        }
      } catch(_e){}
    });

    const hasPasswordField = forms.some((form)=>form.querySelector('input[type="password"]'));
    if (hasPasswordField && location.protocol !== 'https:'){
      signals.push({
        id: 'phish-http',
        icon: 'LOCK',
        label: 'Login over HTTP',
        detail: 'Passwords would be sent over an insecure connection.',
        weight: 5
      });
      score += 5;
    }

    const favicon = document.querySelector('link[rel*="icon"]');
    if (favicon && favicon.href){
      try {
        const favHost = new URL(favicon.href, location.href).hostname.replace(/^www\./,'').toLowerCase();
        if (favHost && favHost !== host && !favHost.endsWith('.' + host)){
          signals.push({
            id: 'phish-favicon',
            icon: 'ICON',
            label: 'Icon from another site',
            detail: `The page is loading its icon from ${favHost}, which may indicate impersonation.`,
            weight: 4
          });
          score += 4;
        }
      } catch(_e){}
    }

    const suspiciousButtons = Array.from(document.querySelectorAll('button, input[type="submit"]')).filter((btn)=>{
      const text = (btn.innerText || btn.value || '').toLowerCase();
      return /(verify|unlock|update|secure|confirm)/.test(text);
    });
    if (suspiciousButtons.length && forms.length){
      signals.push({
        id: 'phish-buttons',
        icon: 'BTN',
        label: 'Urgent action wording',
        detail: 'Buttons on this page use urgent wording such as verify, unlock, or secure.',
        weight: 3
      });
      score += 3;
    }

    if (!window.isSecureContext && options.scriptMonitor !== false){
      signals.push({
        id: 'phish-insecure-context',
        icon: 'LOCK',
        label: 'Insecure context',
        detail: 'The browser considers this page insecure. Data entered here could be intercepted.',
        weight: 5
      });
      score += 5;
    }

    if (typeof document.oncontextmenu === 'function' || document.oncontextmenu === false){
      signals.push({
        id: 'phish-contextmenu',
        icon: 'WARN',
        label: 'Copy/paste disabled',
        detail: 'This page blocks right-click actions, which phishing pages often do.',
        weight: 2
      });
      score += 2;
    }

    if (options.scriptMonitor !== false){
      const inlineScripts = Array.from(document.scripts || []).filter((script)=>!script.src && script.textContent);
      const scriptHit = inlineScripts.some((script)=>SUSPICIOUS_SCRIPT_RX.test(script.textContent));
      if (scriptHit){
        signals.push({
          id: 'phish-script',
          icon: 'JS',
          label: 'Obfuscated script detected',
          detail: 'Inline scripts on this page use patterns common in phishing kits.',
          weight: 5
        });
        score += 5;
      }

      const dataUriLogos = Array.from(document.querySelectorAll('img')).filter((img)=>{
        const src = img.currentSrc || img.src || '';
        if (!/^data:image\/(png|jpe?g)/i.test(src)) return false;
        const alt = (img.alt || img.title || '').toLowerCase();
        return /(logo|signin|secure|bank)/.test(alt);
      });
      if (dataUriLogos.length){
        signals.push({
          id: 'phish-logo',
          icon: 'IMG',
          label: 'Inline logo detected',
          detail: 'The page embeds brand logos via data URIs, a trick used in phishing kits.',
          weight: 3
        });
        score += 3;
      }
    }

    const feedSignal = (options.feedEnabled === false) ? null : checkPhishingFeed(host, feedEntries);
    if (feedSignal){
      signals.push(feedSignal);
      score += 12;
    }

    if (!signals.length) return null;
    const riskScore = Math.min(100, 15 + score);
    const riskThreshold = strict ? 8 : 12;
    try { window.__sg_phishSignals = signals; } catch(_e){}
    return {
      riskScore,
      riskThreshold,
      riskLevel: 'Phishing risk',
      riskSummary: 'Safeguard spotted suspicious login behavior.',
      signals
    };
  }

  function createHostHintBlock(host, hint){
    if (!ENABLE_CYBER) return null;
    return {
      riskScore: 60,
      riskThreshold: 4,
      riskLevel: 'Phishing risk',
      riskSummary: `Suspicious hosting domain: ${host}`,
      signals: [{
        id: 'phish-host-hint',
        icon: 'URL',
        label: 'Untrusted hosting domain',
        detail: `This login is served from ${host}, a domain pattern (“${hint}”) commonly used for phishing staging.`,
        weight: 20
      }]
    };
  }

  function checkPhishingFeed(host, feedEntries){
    if (!ENABLE_CYBER) return null;
    if (!host || !Array.isArray(feedEntries) || !feedEntries.length) return null;
    const normalized = host.replace(/^www\./,'');
    const match = feedEntries.find((entry)=>{
      if (!entry || !entry.host) return false;
      const pattern = String(entry.host).replace(/\[.\]/g, '.');
      const clean = pattern.replace(/^https?:\/\//,'').replace(/\/.*$/,'').replace(/^www\./,'').toLowerCase();
      return normalized === clean || normalized.endsWith('.' + clean);
    });
    if (!match) return null;
    return {
      id: 'phish-feed',
      icon: 'TI',
      label: 'Threat intelligence hit',
      detail: `Known phishing host (${match.brand || 'unknown brand'}) per Safeguard feed.`,
      weight: match.severity === 'high' ? 18 : 12
    };
  }

  function handlePhishingHit(phishingEval, pinConfig, audienceContext = {}){
    if (!ENABLE_CYBER) return;
    if (!phishingEval) return;
    lockInteractionShield();
    showInterstitial("Phishing protection", {
      pinConfig,
      pillText: 'Cybersecurity defense',
      supportLink: { text: 'Report phishing', href: 'https://dipesthapa.github.io/safebrowse-ai/site/support.html' },
      profileTone: audienceContext.profileTone,
      profileLabel: audienceContext.profileLabel,
      profileSuggestions: sanitizeSuggestionList(audienceContext.profileSuggestions),
      ...phishingEval
    });
    try {
      chrome.runtime.sendMessage({
        type: 'sg-phish-detected',
        payload: {
          host: getHost(),
          url: (()=>{ try { return location.href; } catch(_e){ return null; } })(),
          reason: phishingEval.riskSummary,
          signals: phishingEval.signals,
          detectedAt: Date.now()
        }
      });
    } catch(_e){}
  }

  let formGuardAttached = false;
  let bypassFormGuard = false;
  function attachPhishFormGuard(cfg, pinConfig, audienceContext = {}){
    if (!ENABLE_CYBER) return;
    if (!cfg || !cfg.phishingProtectionEnabled || cfg.phishingFormMonitorEnabled === false) return;
    if (formGuardAttached) return;
    formGuardAttached = true;
    const context = audienceContext || {};
    document.addEventListener('submit', async (event)=>{
      try {
        if (bypassFormGuard) return;
        const form = event.target;
        if (!(form instanceof HTMLFormElement)) return;
        event.preventDefault();
        event.stopPropagation();
        const feedEntries = cfg.phishingFeedEnabled === false ? [] : await loadPhishingFeed();
        const phishingEval = evaluatePhishingSignals({
          strict: Boolean(cfg.phishingStrictMode),
          feedEntries,
          feedEnabled: cfg.phishingFeedEnabled !== false,
          scriptMonitor: cfg.phishingScriptMonitorEnabled !== false
        });
        if (phishingEval){
          handlePhishingHit(phishingEval, pinConfig, context);
          return;
        }
        bypassFormGuard = true;
        try {
          form.submit();
        } finally {
          bypassFormGuard = false;
        }
      } catch(_e){}
    }, true);
  }

  let networkGuardsAttached = false;
  function attachNetworkGuards(cfg, pinConfig, audienceContext = {}){
    if (!ENABLE_CYBER) return;
    if (!cfg || !cfg.phishingProtectionEnabled) return;
    if (networkGuardsAttached) return;
    networkGuardsAttached = true;
    const context = audienceContext || {};
    interceptFetch(cfg, pinConfig, context);
    interceptXHR(cfg, pinConfig, context);
    interceptBeacon();
    interceptWebSocket(cfg, pinConfig, context);
    monitorInputsForExfil();
  }

  function scrubPayload(payload){
    try {
      if (!payload) return '';
      if (typeof payload === 'string') return payload.slice(0, 2000);
      if (payload instanceof URLSearchParams){
        return payload.toString().slice(0, 2000);
      }
      if (payload instanceof FormData){
        const params = [];
        payload.forEach((value, key)=>{
          params.push(`${key}=${value}`);
        });
        return params.join('&').slice(0, 2000);
      }
      if (payload instanceof Blob || payload instanceof ArrayBuffer){
        return '[binary]';
      }
      if (typeof payload === 'object'){
        return JSON.stringify(payload).slice(0, 2000);
      }
    } catch(_e){}
    return '';
  }

  function payloadLooksSensitive(body){
    const sample = (body || '').toLowerCase();
    return EXFIL_KEYWORDS.some((kw)=>sample.includes(kw));
  }

  function payloadLooksEncrypted(body){
    if (!body) return false;
    return ENCRYPTED_PAYLOAD_HINTS.some((rx)=>rx.test(body));
  }

  function hostIsTrusted(url){
    try {
      const parsed = new URL(url, location.href);
      const host = parsed.hostname.replace(/^www\./,'').toLowerCase();
      return host === getHost() || host.endsWith('.' + getHost());
    } catch(_e){
      return false;
    }
  }

  function shouldBlockPayload(bodySample){
    return payloadLooksSensitive(bodySample) || payloadLooksEncrypted(bodySample);
  }

  function interceptFetch(cfg, pinConfig, audienceContext = {}){
    if (!window.fetch) return;
    const originalFetch = window.fetch;
    const context = audienceContext || {};
    window.fetch = async (...args)=>{
      try {
        const [resource, init = {}] = args;
        const url = typeof resource === 'string' ? resource : resource && resource.url;
        const method = (init.method || (resource && resource.method) || 'GET').toUpperCase();
        const body = init.body || (resource && resource.body);
        const bodySample = scrubPayload(body);
        if (method !== 'GET' && bodySample && shouldBlockPayload(bodySample) && !hostIsTrusted(url)){
          const feedEntries = cfg.phishingFeedEnabled === false ? [] : await loadPhishingFeed();
          const phishingEval = evaluatePhishingSignals({
            strict: Boolean(cfg.phishingStrictMode),
            feedEntries,
            feedEnabled: cfg.phishingFeedEnabled !== false,
            scriptMonitor: cfg.phishingScriptMonitorEnabled !== false
          });
          if (phishingEval){
            handlePhishingHit(phishingEval, pinConfig, context);
            return Promise.reject(new Error('Blocked by Safeguard phishing guard'));
          }
        }
      } catch(_e){}
      return originalFetch.apply(this, args);
    };
  }

  function interceptXHR(cfg, pinConfig, audienceContext = {}){
    if (!window.XMLHttpRequest) return;
    const OriginalXHR = window.XMLHttpRequest;
    const context = audienceContext || {};
    function WrappedXHR(){
      const xhr = new OriginalXHR();
      let targetUrl = '';
      let method = 'GET';
      const open = xhr.open;
      xhr.open = function(_method, _url, ...rest){
        method = (_method || 'GET').toUpperCase();
        try { targetUrl = _url || ''; } catch(_e){}
        return open.call(this, _method, _url, ...rest);
      };
      const send = xhr.send;
      xhr.send = async function(body){
        try {
          const bodySample = scrubPayload(body);
          if (method !== 'GET' && bodySample && shouldBlockPayload(bodySample) && !hostIsTrusted(targetUrl)){
            const feedEntries = cfg.phishingFeedEnabled === false ? [] : await loadPhishingFeed();
            const phishingEval = evaluatePhishingSignals({
              strict: Boolean(cfg.phishingStrictMode),
              feedEntries,
              feedEnabled: cfg.phishingFeedEnabled !== false,
              scriptMonitor: cfg.phishingScriptMonitorEnabled !== false
            });
            if (phishingEval){
              handlePhishingHit(phishingEval, pinConfig, context);
              throw new Error('Blocked by Safeguard phishing guard');
            }
          }
        } catch(err){
          if (err && err.message === 'Blocked by Safeguard phishing guard') throw err;
        }
        return send.call(this, body);
      };
      return xhr;
    }
    WrappedXHR.prototype = OriginalXHR.prototype;
    window.XMLHttpRequest = WrappedXHR;
  }

  function interceptBeacon(){
    if (!navigator.sendBeacon) return;
    const originalBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function(url, data){
      try {
        const bodySample = scrubPayload(data);
        if (bodySample && shouldBlockPayload(bodySample) && !hostIsTrusted(url)){
          return false;
        }
      } catch(_e){}
      return originalBeacon(url, data);
    };
  }

  function monitorInputsForExfil(){
    if (!ENABLE_CYBER) return;
    document.addEventListener('keyup', (event)=>{
      try {
        const target = event.target;
        if (!target || !(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
        const value = (target.value || '').toLowerCase();
        if (value.length > 6 && payloadLooksSensitive(value)){
          window.__sg_lastSensitiveInput = {
            timestamp: Date.now(),
            name: target.name || null,
            type: target.type || null
          };
        }
      } catch(_e){}
    }, true);
  }

  function interceptWebSocket(cfg, pinConfig, audienceContext = {}){
    if (!ENABLE_CYBER) return;
    if (!window.WebSocket) return;
    const OriginalWS = window.WebSocket;
    const context = audienceContext || {};
    function WrappedWebSocket(...args){
      const ws = new OriginalWS(...args);
      const nativeSend = ws.send;
      ws.send = async function(data){
        try {
          const bodySample = scrubPayload(data);
          if (bodySample && shouldBlockPayload(bodySample)){
            const phishingEval = await evaluateOnDemand(cfg);
            if (phishingEval){
              handlePhishingHit(phishingEval, pinConfig, context);
              return;
            }
          }
        } catch(_e){}
        return nativeSend.call(this, data);
      };
      return ws;
    }
    WrappedWebSocket.prototype = OriginalWS.prototype;
    window.WebSocket = WrappedWebSocket;
  }

  async function evaluateOnDemand(cfg){
    if (!ENABLE_CYBER) return null;
    try {
      const feedEntries = cfg.phishingFeedEnabled === false ? [] : await loadPhishingFeed();
      return evaluatePhishingSignals({
        strict: Boolean(cfg.phishingStrictMode),
        feedEntries,
        feedEnabled: cfg.phishingFeedEnabled !== false,
        scriptMonitor: cfg.phishingScriptMonitorEnabled !== false
      });
    } catch(_e){
      return null;
    }
  }

  function hostLooksSuspicious(host){
    if (!ENABLE_CYBER) return null;
    const normalized = (host || '').toLowerCase();
    return IMMEDIATE_BLOCK_HOSTS.find((hint)=>normalized.includes(hint.toLowerCase()));
  }

  function setupPhishObserver(cfg, pinConfig, audienceContext = {}){
    if (!ENABLE_CYBER) return;
    if (!cfg || !cfg.phishingProtectionEnabled) return;
    if (phishObserver) return;
    try {
      const observerConfig = {
        strict: Boolean(cfg.phishingStrictMode),
        feedEnabled: cfg.phishingFeedEnabled !== false,
        scriptMonitor: cfg.phishingScriptMonitorEnabled !== false
      };
      const context = audienceContext || {};
      phishObserver = new MutationObserver(()=>{
        if (phishObserverTimer) return;
        phishObserverTimer = setTimeout(async ()=>{
          phishObserverTimer = null;
          try {
            const feedEntries = observerConfig.feedEnabled ? await loadPhishingFeed() : [];
            const phishingEval = evaluatePhishingSignals({
              strict: observerConfig.strict,
              feedEntries,
              feedEnabled: observerConfig.feedEnabled,
              scriptMonitor: observerConfig.scriptMonitor
            });
            const hint = hostLooksSuspicious(getHost());
            if (phishingEval){
              lockInteractionShield();
              handlePhishingHit(phishingEval, pinConfig, context);
            } else if (hint){
              lockInteractionShield();
              handlePhishingHit(createHostHintBlock(getHost(), hint), pinConfig, context);
            }
          } catch(_e){}
        }, 250);
      });
      phishObserver.observe(document.documentElement, {subtree: true, childList: true});
    } catch(_e){
      phishObserver = null;
    }
  }

  const POSITIVE_REASON_HINTS = ['lesson','class','study','gcse','a level','coursework','curriculum','revision','teacher','assignment','homework','safeguarding review','pastoral review','professional development'];
  const WEAK_REASON_HINTS = ['just','random','lol','fun','bored','test','testing','because','curious','nsfw','idk'];

  function evaluateOverridePolicy(context){
    const review = {
      score: 0,
      verdict: 'allow',
      factors: []
    };
    if (!context || typeof context !== 'object'){
      return review;
    }
    const factors = [];
    const addFactor = (code, label, weight)=>{
      factors.push({ code, label, weight });
      review.score += weight;
    };
    const heuristics = context.heuristics || {};
    const riskScore = Number.isFinite(heuristics.riskScore) ? heuristics.riskScore : 0;
    const threshold = Number.isFinite(heuristics.riskThreshold) ? heuristics.riskThreshold : 0;
    const riskDelta = riskScore - threshold;
    if (riskScore > 0){
      const base = riskScore >= threshold ? 20 : 8;
      addFactor('base-risk', `Risk score ${Math.round(riskScore)} vs threshold ${Math.round(threshold || 0)}`, base);
      if (riskDelta >= 2){
        addFactor('delta-risk', `Signal strength exceeded threshold by ${Math.round(riskDelta)}`, Math.min(18, Math.round(riskDelta * 3)));
      }
    }
    const signalList = Array.isArray(heuristics.signals) ? heuristics.signals : [];
    const severeSignals = signalList.filter((sig)=>sig && typeof sig.weight === 'number' && sig.weight >= 6);
    const ageGateSignal = signalList.some((sig)=>sig && sig.id && /age-gate/.test(sig.id));
    if (severeSignals.length){
      addFactor('severe-signals', `${severeSignals.length} high-weight signal${severeSignals.length === 1 ? '' : 's'} detected`, Math.min(18, severeSignals.length * 6));
    }
    if (ageGateSignal){
      addFactor('age-gate', '18+ gate or age prompt detected', 12);
    }
    const reasonRaw = typeof context.reason === 'string' ? context.reason.trim() : '';
    const reasonLower = reasonRaw.toLowerCase();
    if (!reasonRaw || reasonRaw.length < 6){
      addFactor('weak-reason', 'Reason missing or too short', 16);
    } else {
      const positiveHit = POSITIVE_REASON_HINTS.find((hint)=>reasonLower.includes(hint));
      if (positiveHit){
        addFactor('positive-context', `Educational context mentioned (“${positiveHit}”)`, -12);
      }
      const weakHit = WEAK_REASON_HINTS.find((hint)=>reasonLower.includes(hint));
      if (weakHit){
        addFactor('weak-language', `Reason includes weak language (“${weakHit}”)`, 10);
      }
    }
    if (context.overrideCountForHost && context.overrideCountForHost > 1){
      addFactor('repeat-host', `Previous overrides for ${context.host || 'this host'}`, Math.min(12, context.overrideCountForHost * 4));
    }
    review.score = Math.max(0, Math.min(100, factors.reduce((sum, item)=>sum + item.weight, 0)));
    review.factors = factors;
    if (review.score >= 65){
      review.verdict = 'escalate';
    } else if (review.score >= 35){
      review.verdict = 'review';
    } else {
      review.verdict = 'allow';
    }
    review.reasonSummary = reasonRaw;
    return review;
  }

  // --- On-screen media masking (images/videos) ---
  let styleInjected = false;
  function ensureStyles(){
    if (styleInjected) return; styleInjected = true;
    const st = document.createElement('style');
    st.textContent = `
      .sg-blur { filter: blur(36px) saturate(0.4) contrast(0.6) !important; pointer-events: none !important; }
      .sg-tag { position: absolute; top: 6px; left: 6px; background: rgba(185,28,28,0.9); color: #fff;
                padding: 2px 6px; font: 12px/1 system-ui,sans-serif; border-radius: 3px; z-index: 2147483647; }
      .sg-wrap { position: relative !important; display: inline-block; }
    `;
    document.documentElement.appendChild(st);
  }

  function textAround(el){
    try{
      const pieces = [];
      if (el.alt) pieces.push(el.alt);
      if (el.title) pieces.push(el.title);
      const aria = el.getAttribute && el.getAttribute('aria-label'); if (aria) pieces.push(aria);
      const src = (el.currentSrc || el.src || '').split(/[?#]/)[0];
      if (src) pieces.push(src.split('/').pop()||'');
      const fig = el.closest && el.closest('figure');
      if (fig){ const cap = fig.querySelector('figcaption'); if (cap) pieces.push(cap.innerText||''); }
      let sib = el.parentElement; let hops = 0;
      while (sib && hops < 2){ pieces.push(sib.innerText||''); sib = sib.parentElement; hops++; }
      return pieces.join(' ').slice(0, 2000);
    }catch(_e){ return ''; }
  }

  function mask(el){
    if (!el || el.__sg_masked) return; el.__sg_masked = true;
    ensureStyles();
    try {
      const parent = el.parentElement;
      if (parent && !parent.classList.contains('sg-wrap')){
        const wrap = document.createElement('span');
        wrap.className = 'sg-wrap';
        parent.insertBefore(wrap, el);
        wrap.appendChild(el);
      }
      el.classList.add('sg-blur');
      const tag = document.createElement('span');
      tag.className = 'sg-tag';
      tag.textContent = 'Blocked by Safeguard';
      const wrap2 = el.parentElement;
      if (wrap2 && wrap2.classList.contains('sg-wrap')) wrap2.appendChild(tag);
    } catch(_e) {}
  }

  function isStreamingHost(host){
    try{
      const h = (host||getHost()||'').toLowerCase();
      return [
        'amazon.', 'primevideo.', 'netflix.', 'hulu.', 'disney', 'hotstar',
        'hbo', 'max.com', 'paramount', 'peacocktv', 'tv.apple', 'apple.com'
      ].some(k => h.includes(k));
    }catch(_e){ return false; }
  }

  function showFullscreenOverlay(reason){
    try{
      if (document.getElementById('sg-fs-overlay')) return;
      const host = getHost();
      if (host && sessionStorage.getItem('sg-ov-video:' + host) === '1') return;
      const wrap = document.createElement('div');
      wrap.id = 'sg-fs-overlay';
      Object.assign(wrap.style, {
        position: 'fixed', inset: '0', zIndex: 2147483647,
        background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif', color: '#fff'
      });
      const box = document.createElement('div');
      Object.assign(box.style, { textAlign: 'center', maxWidth: '560px', padding: '16px', background: 'rgba(0,0,0,0.35)', borderRadius: '8px' });
      const h = document.createElement('h2'); h.textContent = 'Blocked by Safeguard'; h.style.margin='0 0 8px'; box.appendChild(h);
      const p = document.createElement('div'); p.textContent = reason || 'Video hidden on this site'; p.style.opacity='0.9'; p.style.margin='0 0 12px'; box.appendChild(p);
      const btn = document.createElement('button');
      let remaining = 5; btn.disabled = true;
      const update = ()=> { btn.textContent = remaining>0 ? `Show video (${remaining})` : 'Show video'; };
      update();
      const t = setInterval(()=>{ remaining--; update(); if (remaining<=0){ clearInterval(t); btn.disabled=false; } }, 1000);
      btn.onclick = ()=>{ try{ if(host) sessionStorage.setItem('sg-ov-video:'+host, '1'); }catch(_e){}; wrap.remove(); };
      Object.assign(btn.style, { padding:'8px 12px', fontSize:'14px' });
      box.appendChild(btn);
      wrap.appendChild(box);
      document.documentElement.appendChild(wrap);
    }catch(_e){}
  }


  const scanned = new WeakSet();
  function evaluateMedia(el){
    if (!el || scanned.has(el)) return false; scanned.add(el);
    // Heuristic: use surrounding text/attributes for a fast signal
    const t = textAround(el);
    // Use a reduced threshold for element-level masking
    const cfgSens = window.__sg_sensitivity || 60;
    const textThreshold = Math.max(3, Math.floor((12 - 6*(cfgSens/100)) * 0.6));
    if (scoreFromText(t) >= textThreshold){
      return true;
    }
    // Vision-based per-element check (on images only)
    if (el instanceof HTMLImageElement){
      const vision = runLocalVisionScan(el);
      if (vision && Array.isArray(vision.detections)){
        const hit = vision.detections.find((det)=>{
          if (!det || !det.label) return false;
          const conf = clamp01(det.confidence || 0);
          if (det.label === 'nsfw') return conf >= 0.7; // only blur clearly nude images
          return false;
        });
        if (hit) return true;
      }
    }
    return false;
  }

  function initMediaFilter(){
    const io = new IntersectionObserver((entries)=>{
      for (const e of entries){
        if (!e.isIntersecting) continue;
        const el = e.target;
        try { if (evaluateMedia(el)) mask(el); } catch(_err){}
      }
    }, { root: null, threshold: 0.01 });

    const sel = 'img, video';
    document.querySelectorAll(sel).forEach(n=>io.observe(n));

    const mo = new MutationObserver((muts)=>{
      for (const m of muts){
        m.addedNodes && m.addedNodes.forEach((n)=>{
          if (!(n instanceof Element)) return;
          if (n.matches && n.matches(sel)) io.observe(n);
          n.querySelectorAll && n.querySelectorAll(sel).forEach(c=>io.observe(c));
        });
      }
    });
    mo.observe(document.documentElement, { subtree: true, childList: true });
  }

  // --- Video frame heuristic (skin-tone ratio) ---
  function rgbToYCbCr(r,g,b){
    const cb = 128 - 0.168736*r - 0.331264*g + 0.5*b;
    const cr = 128 + 0.5*r - 0.418688*g - 0.081312*b;
    return { cb, cr };
  }

  function estimateSkinRatio(imgData){
    try{
      const d = imgData.data; let skin=0; const total = imgData.width*imgData.height;
      for(let i=0;i<d.length;i+=4){
        const r=d[i], g=d[i+1], b=d[i+2];
        const {cb,cr} = rgbToYCbCr(r,g,b);
        if (cb>77 && cb<127 && cr>133 && cr<173) skin++;
      }
      return skin/Math.max(1,total);
    }catch(_e){ return 0; }
  }

  function startVideoWatcher(video, sensitivity){
    if (!video || video.__sg_vwatch) return; video.__sg_vwatch = true;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const targetW = 96, targetH = 54;
    let blocked = false;
    let taintedCount = 0;
    const thr = 0.35 - 0.2 * (Math.max(10, Math.min(100, sensitivity||60)) / 100);
    const tick = ()=>{
      if (!video.isConnected){ return; }
      if (video.readyState < 2){ setTimeout(tick, 800); return; }
      try{
        canvas.width = targetW; canvas.height = targetH;
        ctx.drawImage(video, 0, 0, targetW, targetH);
        const data = ctx.getImageData(0,0,targetW,targetH);
        const ratio = estimateSkinRatio(data);
        if (ratio >= thr && !blocked){
          blocked = true;
          mask(video);
          try{ video.pause(); video.currentTime = Math.max(0, video.currentTime - 0.1); }catch(_e){}
        }
      }catch(_e){
        // Likely DRM/CORS tainted canvas (Prime/Netflix/etc.)
        taintedCount++;
        if (!blocked && taintedCount >= 2 && isStreamingHost()){
          blocked = true;
          mask(video);
          try{ video.pause(); }catch(_e2){}
        }
      }
      setTimeout(tick, 1000);
    };
    setTimeout(tick, 600);
  }

  function collectVideosDeep(root){
    const out = [];
    try{
      // Fast path for direct descendants
      root.querySelectorAll && root.querySelectorAll('video').forEach(v=>out.push(v));
      // Walk light DOM and recurse into open shadow roots
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
      let n = walker.currentNode;
      while(n){
        const el = /** @type {Element} */(n);
        if (el.shadowRoot && el.shadowRoot.mode === 'open'){
          try{ el.shadowRoot.querySelectorAll('video').forEach(v=>out.push(v)); }catch(_e){}
        }
        n = walker.nextNode();
      }
    }catch(_e){}
    return out;
  }

  function clearInteractionShield(){
    if (!ENABLE_CYBER) return;
    if (!interactionGuard) return;
    try { interactionGuard.el.remove(); } catch(_e){}
    interactionGuard = null;
  }

  function ensureInteractionShield(){
    if (!ENABLE_CYBER) return null;
    if (interactionGuard) return interactionGuard;
    const overlay = document.createElement('div');
    overlay.className = 'sg-interaction-shield';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = '2147483646';
    overlay.style.background = 'rgba(15,23,42,0.04)';
    overlay.style.pointerEvents = 'auto';
    overlay.style.cursor = 'wait';
    overlay.style.transition = 'opacity 120ms ease-out';
    document.documentElement.appendChild(overlay);
    interactionGuard = {
      el: overlay,
      locked: false,
      lock(){
        this.locked = true;
        overlay.style.cursor = 'not-allowed';
      },
      release(){
        if (this.locked) return;
        clearInteractionShield();
      }
    };
    return interactionGuard;
  }

  function lockInteractionShield(){
    if (!ENABLE_CYBER) return;
    const guard = ensureInteractionShield();
    guard.lock();
  }

  function releaseInteractionShield(){
    if (!ENABLE_CYBER) return;
    if (interactionGuard && !interactionGuard.locked){
      clearInteractionShield();
    }
  }

  function detachPhishObserver(){
    if (!ENABLE_CYBER) return;
    if (phishObserver){
      try { phishObserver.disconnect(); } catch(_e){}
      phishObserver = null;
    }
    if (phishObserverTimer){
      clearTimeout(phishObserverTimer);
      phishObserverTimer = null;
    }
  }

  function showInterstitial(reason, opts = {}){
    clearInteractionShield();
    detachPhishObserver();
    const doc = document;
    const pinConfig = opts && opts.pinConfig ? opts.pinConfig : null;
    const pinRequired = Boolean(pinConfig && pinConfig.requirePin && pinConfig.hash && pinConfig.salt);
    const pillText = typeof opts.pillText === 'string' && opts.pillText.trim() ? opts.pillText.trim() : 'On-device protection';
    const riskScore = typeof opts.riskScore === 'number' ? opts.riskScore : null;
    const riskThreshold = typeof opts.riskThreshold === 'number' ? opts.riskThreshold : null;
    const computedRiskMax = typeof opts.riskMax === 'number' && opts.riskMax > 0
      ? opts.riskMax
      : (riskThreshold != null ? riskThreshold + 12 : 24);
    const riskMax = computedRiskMax > 0 ? computedRiskMax : 24;
    const riskLevel = typeof opts.riskLevel === 'string' && opts.riskLevel.trim() ? opts.riskLevel.trim() : null;
    const riskSummary = typeof opts.riskSummary === 'string' && opts.riskSummary.trim() ? opts.riskSummary.trim() : null;
    const seededPercent = typeof opts.riskPercent === 'number' ? opts.riskPercent : null;
    const riskPercent = riskScore !== null
      ? (seededPercent !== null ? Math.max(0, Math.min(100, seededPercent)) : Math.max(0, Math.min(100, Math.round((riskScore / riskMax) * 100))))
      : null;
    const signals = Array.isArray(opts.signals) ? opts.signals.filter((signal)=>signal && typeof signal === 'object') : [];
    const supportLink = opts.supportLink && typeof opts.supportLink.href === 'string' ? opts.supportLink : null;
    const profileTone = normalizeTone(opts.profileTone);
    const profileLabel = typeof opts.profileLabel === 'string' && opts.profileLabel.trim() ? opts.profileLabel.trim() : null;
    const profileSuggestions = sanitizeSuggestionList(opts.profileSuggestions);
    doc.title = 'Safeguard – Page blocked';

    const root = doc.documentElement;
    while (root.firstChild) root.removeChild(root.firstChild);

    const head = doc.createElement('head');
    const style = doc.createElement('style');
    style.textContent = `
      :root {
        color-scheme: light dark;
        --bg-gradient: linear-gradient(140deg, #0b1f33 0%, #2563eb 50%, #16a34a 100%);
        --panel-bg: rgba(255,255,255,0.97);
        --panel-shadow: 0 24px 60px rgba(15,23,42,0.35);
        --text-primary: #0f172a;
        --text-secondary: #475569;
        --text-muted: #64748b;
        --pill-bg: rgba(37,99,235,0.12);
        --pill-text: #2563eb;
        --insight-bg: rgba(15,118,110,0.08);
        --insight-border: rgba(15,118,110,0.12);
        --insight-item-bg: rgba(255,255,255,0.55);
        --insight-item-border: rgba(15,118,110,0.14);
        --button-secondary-bg: rgba(15, 23, 42, 0.06);
        font-family: "Inter", "Segoe UI", system-ui, -apple-system, sans-serif;
        --input-bg: #fff;
      }
      @keyframes sgFadeIn {
        from { opacity: 0; transform: scale(0.98); }
        to { opacity: 1; transform: scale(1); }
      }
      @keyframes sgGlow {
        0% { box-shadow: var(--panel-shadow); }
        100% { box-shadow: var(--panel-shadow), 0 0 40px rgba(37, 99, 235, 0.25); }
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --panel-bg: rgba(15,23,42,0.92);
          --panel-shadow: 0 24px 60px rgba(0,0,0,0.55);
          --text-primary: #e2e8f0;
          --text-secondary: #cbd5f5;
          --text-muted: #94a3b8;
          --pill-bg: rgba(148,163,184,0.18);
          --pill-text: #93c5fd;
          --insight-bg: rgba(15,118,110,0.18);
          --insight-border: rgba(45,212,191,0.24);
          --insight-item-bg: rgba(15,118,110,0.12);
          --insight-item-border: rgba(45,212,191,0.2);
          --button-secondary-bg: rgba(148,163,184,0.18);
          --input-bg: rgba(15,23,42,0.85);
          --guidance-bg: rgba(15,23,42,0.8);
        }
        .sg-panel::after {
          opacity: 0.7;
        }
        .sg-insights h3 {
          color: #5eead4;
        }
        .sg-button--secondary {
          color: #e2e8f0;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .sg-overlay,
        .sg-panel {
          animation: none !important;
        }
        .sg-risk__meter-fill,
        .sg-button {
          transition: none !important;
        }
      }
      body {
        margin: 0;
        background: transparent;
      }
      .sg-overlay {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: clamp(18px, 4vw, 48px);
        overflow-y: auto;
        box-sizing: border-box;
        min-height: 100vh;
        background:
          radial-gradient(circle at 10% 10%, rgba(59,130,246,0.55), transparent 55%),
          radial-gradient(circle at 90% 15%, rgba(34,197,94,0.35), transparent 60%),
          radial-gradient(circle at 50% 85%, rgba(59,130,246,0.25), transparent 60%),
          var(--bg-gradient);
        color: var(--text-primary);
        animation: sgFadeIn 240ms ease-out;
      }
      .sg-panel {
        width: min(92%, 520px);
        background: var(--panel-bg);
        border-radius: 28px;
        padding: 36px;
        box-shadow: var(--panel-shadow);
        text-align: left;
        position: relative;
        overflow: hidden;
        animation: sgGlow 520ms ease-out;
        margin: clamp(24px, 6vh, 48px) auto;
      }
      .sg-panel::after {
        content: "";
        position: absolute;
        inset: 0;
        background: radial-gradient(circle at -10% -10%, rgba(37,99,235,0.18), transparent 45%),
                    radial-gradient(circle at 110% 20%, rgba(22,163,74,0.18), transparent 55%);
        pointer-events: none;
      }
      .sg-header {
        position: relative;
        z-index: 1;
        display: flex;
        align-items: center;
        gap: 16px;
        margin-bottom: 20px;
      }
      .sg-icon {
        width: 48px;
        height: 48px;
        border-radius: 16px;
        background: linear-gradient(135deg, #2563eb, #16a34a);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        font-weight: 700;
        font-size: 22px;
        box-shadow: 0 14px 30px rgba(15, 23, 42, 0.35);
      }
      .sg-title {
        margin: 0;
        font-size: 26px;
        font-weight: 650;
      }
      .sg-subtitle {
        margin: 4px 0 0;
        color: var(--text-secondary);
      }
      .sg-pill {
        display: inline-block;
        padding: 6px 12px;
        border-radius: 999px;
        background: var(--pill-bg);
        color: var(--pill-text);
        font-weight: 600;
        font-size: 12px;
        margin-bottom: 18px;
      }
      .sg-risk {
        margin: 12px 0 24px;
        background: rgba(37, 99, 235, 0.08);
        border-radius: 18px;
        padding: 18px 20px;
        border: 1px solid rgba(37,99,235,0.16);
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .sg-risk__header {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
      }
      .sg-risk__level {
        font-size: 14px;
        font-weight: 600;
        color: #1d4ed8;
        letter-spacing: 0.2px;
      }
      .sg-risk__score {
        margin: 0;
        font-size: 26px;
        font-weight: 700;
        color: var(--text-primary);
      }
      .sg-risk__score span {
        font-size: 13px;
        font-weight: 500;
        color: var(--text-secondary);
        margin-left: 6px;
      }
      .sg-risk__meter {
        position: relative;
        width: 100%;
        height: 10px;
        border-radius: 999px;
        background: rgba(148, 163, 184, 0.28);
        overflow: hidden;
      }
      .sg-risk__meter-fill {
        position: absolute;
        inset: 0;
        width: 0%;
        border-radius: inherit;
        background: linear-gradient(135deg, #2563eb, #16a34a);
        transition: width 320ms ease-out;
      }
      .sg-risk__meta {
        display: flex;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 8px;
        font-size: 12px;
        color: var(--text-secondary);
      }
      .sg-insights {
        margin: 20px 0 26px;
        background: var(--insight-bg);
        border-radius: 18px;
        padding: 18px 20px;
        border: 1px solid var(--insight-border);
      }
      .sg-insights h3 {
        margin: 0 0 12px;
        font-size: 15px;
        color: #0f766e;
        letter-spacing: 0.3px;
      }
      .sg-insights__list {
        margin: 0;
        padding: 0;
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 12px;
        color: var(--text-secondary);
        font-size: 13px;
      }
      .sg-insights__item {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        background: var(--insight-item-bg);
        border: 1px solid var(--insight-item-border);
        border-radius: 14px;
        padding: 12px 14px;
      }
      .sg-insights__icon {
        min-width: 32px;
        height: 32px;
        border-radius: 12px;
        background: rgba(13, 148, 136, 0.18);
        color: #0f766e;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 650;
        font-size: 12px;
        letter-spacing: 0.8px;
        text-transform: uppercase;
      }
      .sg-insights__body {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .sg-insights__body p {
        margin: 0;
        color: var(--text-secondary);
        line-height: 1.45;
      }
      .sg-insights__friendly {
        font-size: 12px;
        color: var(--text-muted);
      }
      .sg-insights__title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
        color: var(--text-primary);
      }
      .sg-insights__score {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 2px 6px;
        border-radius: 999px;
        background: rgba(13,148,136,0.14);
        color: #0f766e;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.3px;
      }
      .sg-explain {
        border: 1px solid rgba(37,99,235,0.16);
        border-radius: 20px;
        padding: 18px 22px;
        background: rgba(37,99,235,0.08);
        margin: 6px 0 24px;
      }
      .sg-explain__eyebrow {
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--text-muted);
        font-weight: 600;
      }
      .sg-explain__title {
        margin: 6px 0;
        font-size: 18px;
        color: var(--text-primary);
      }
      .sg-explain__suggestion {
        margin: 10px 0 0;
        font-weight: 600;
        color: var(--text-primary);
      }
      .sg-explain__context {
        margin: 6px 0 0;
      }
      .sg-reason {
        margin: 0 0 24px;
        color: var(--text-secondary);
      }
      .sg-reason strong {
        color: var(--text-primary);
      }
      .sg-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        position: relative;
        z-index: 1;
      }
      .sg-pin {
        margin-top: 18px;
        padding: 16px;
        border-radius: 18px;
        background: rgba(37, 99, 235, 0.08);
        display: none;
        flex-direction: column;
        gap: 12px;
      }
      .sg-pin--visible {
        display: flex;
      }
      .sg-pin__label {
        font-weight: 600;
        color: var(--text-secondary);
      }
      .sg-pin__input {
        border-radius: 14px;
        border: 1px solid rgba(15, 23, 42, 0.12);
        padding: 12px;
        font-size: 18px;
        letter-spacing: 6px;
        text-align: center;
        background: var(--input-bg);
        color: var(--text-primary);
        outline: none;
      }
      .sg-pin__actions {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }
      .sg-pin__reason {
        margin-top: 4px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 12px;
        border-radius: 14px;
        border: 1px solid rgba(15, 23, 42, 0.1);
        background: rgba(255,255,255,0.7);
      }
      @media (prefers-color-scheme: dark){
        .sg-pin__reason {
          background: rgba(30, 41, 59, 0.7);
          border-color: rgba(148, 163, 184, 0.24);
        }
      }
      .sg-pin__reason-label {
        font-size: 13px;
        font-weight: 600;
        color: var(--text-secondary);
      }
      .sg-pin__reason-input {
        border-radius: 12px;
        border: 1px solid rgba(15, 23, 42, 0.12);
        padding: 10px 12px;
        font-size: 14px;
        resize: vertical;
        min-height: 64px;
        background: var(--input-bg);
        color: var(--text-primary);
        outline: none;
      }
      .sg-pin__reason-input:focus {
        border-color: rgba(37, 99, 235, 0.45);
        box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12);
      }
      .sg-pin__message {
        min-height: 16px;
        font-size: 12px;
        color: #b91c1c;
      }
      .sg-pin__privacy {
        font-size: 11px;
        color: var(--text-muted);
      }
      .sg-actions__support {
        margin-left: auto;
        background: none;
        border: none;
        color: #2563eb;
        font-weight: 600;
        cursor: pointer;
        padding: 0;
        font-size: 13px;
        text-decoration: underline;
      }
      .sg-actions__support:hover {
        text-decoration: underline;
      }
      .sg-button {
        border: none;
        border-radius: 999px;
        padding: 12px 20px;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.15s ease, box-shadow 0.2s ease;
      }
      .sg-button--primary {
        background: linear-gradient(135deg, #16a34a, #0f766e);
        color: #fff;
        box-shadow: 0 12px 30px rgba(15,118,110,0.35);
      }
      .sg-button--primary:disabled {
        opacity: 0.6;
        cursor: default;
        box-shadow: none;
      }
      .sg-button--secondary {
        background: var(--button-secondary-bg);
        color: var(--text-primary);
      }
      .sg-button:not(:disabled):hover {
        transform: translateY(-1px);
      }
      .sg-support {
        margin-top: 24px;
        font-size: 13px;
        color: var(--text-muted);
      }
      .sg-support a {
        color: #2563eb;
        text-decoration: none;
        font-weight: 600;
      }
      .sg-support a:hover {
        text-decoration: underline;
      }
      .sg-guidance {
        margin-top: 24px;
        padding: 18px;
        border-radius: 18px;
        border: 1px solid rgba(15,23,42,0.1);
        background: var(--guidance-bg, rgba(255,255,255,0.8));
      }
      .sg-guidance h3 {
        margin: 0 0 8px;
        font-size: 15px;
        color: var(--text-primary);
      }
      .sg-guidance__intro {
        margin: 0 0 8px;
        font-size: 13px;
        color: var(--text-secondary);
      }
      .sg-guidance__list {
        margin: 0;
        padding-left: 18px;
        color: var(--text-secondary);
        font-size: 13px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      @media (max-width: 560px){
        .sg-panel {
          padding: 26px;
          border-radius: 20px;
        }
        .sg-header {
          flex-direction: column;
          align-items: flex-start;
        }
        .sg-icon {
          width: 44px;
          height: 44px;
          font-size: 20px;
        }
        .sg-title {
          font-size: 22px;
        }
      }
      @media (max-height: 820px){
        .sg-overlay {
          align-items: flex-start;
          padding-top: 32px;
          padding-bottom: 40px;
        }
      }
    `;
    head.appendChild(style);
    root.appendChild(head);

    const body = doc.createElement('body');
    root.appendChild(body);
    const overlay = doc.createElement('div');
    overlay.className = 'sg-overlay';
    body.appendChild(overlay);
    const panel = doc.createElement('div');
    panel.className = 'sg-panel';
    overlay.appendChild(panel);

    const header = doc.createElement('div');
    header.className = 'sg-header';

    const icon = doc.createElement('div');
    icon.className = 'sg-icon';
    const iconImg = doc.createElement('img');
    iconImg.src = chrome.runtime.getURL('assets/icons/icon48.png');
    iconImg.alt = 'Safeguard';
    iconImg.style.width = '48px';
    iconImg.style.height = '48px';
    icon.appendChild(iconImg);
    header.appendChild(icon);

    const headerText = doc.createElement('div');
    const title = doc.createElement('h1');
    title.className = 'sg-title';
    title.textContent = 'Safeguard blocked this page';
    const subtitle = doc.createElement('p');
    subtitle.className = 'sg-subtitle';
    subtitle.textContent = 'Our local rules flagged this content before it loaded.';
    headerText.appendChild(title);
    headerText.appendChild(subtitle);
    header.appendChild(headerText);
    panel.appendChild(header);

    const pill = doc.createElement('span');
    pill.className = 'sg-pill';
    pill.textContent = pillText;
    panel.appendChild(pill);

    if (riskScore !== null){
      const risk = doc.createElement('div');
      risk.className = 'sg-risk';
      const riskHeader = doc.createElement('div');
      riskHeader.className = 'sg-risk__header';
      const riskLevelEl = doc.createElement('div');
      riskLevelEl.className = 'sg-risk__level';
      riskLevelEl.textContent = riskLevel || 'Safeguard detection score';
      riskHeader.appendChild(riskLevelEl);
      const scoreEl = doc.createElement('p');
      scoreEl.className = 'sg-risk__score';
      scoreEl.textContent = String(Math.round(riskScore));
      if (riskMax){
        const maxSpan = doc.createElement('span');
        const roundedMax = Math.round(riskMax);
        maxSpan.textContent = riskScore > riskMax ? `/ ${roundedMax}+` : `/ ${roundedMax}`;
        scoreEl.appendChild(maxSpan);
      }
      riskHeader.appendChild(scoreEl);
      risk.appendChild(riskHeader);
      if (riskPercent !== null){
        const meter = doc.createElement('div');
        meter.className = 'sg-risk__meter';
        const fill = doc.createElement('div');
        fill.className = 'sg-risk__meter-fill';
        fill.style.width = `${riskPercent}%`;
        fill.setAttribute('aria-hidden', 'true');
        meter.appendChild(fill);
        risk.appendChild(meter);
      }
      if (riskSummary || riskThreshold !== null){
        const meta = doc.createElement('div');
        meta.className = 'sg-risk__meta';
        const summaryText = doc.createElement('span');
        summaryText.textContent = riskSummary || 'Safeguard combined signals exceeded the active threshold.';
        meta.appendChild(summaryText);
        if (riskThreshold !== null){
          const thresholdEl = doc.createElement('span');
          thresholdEl.textContent = `Threshold: ${Math.round(riskThreshold)}`;
          meta.appendChild(thresholdEl);
        }
        risk.appendChild(meta);
      }
      panel.appendChild(risk);
    }

    let insightsList = null;
    const hostName = getHost();
    const fallbackSignals = [
      { id: 'host', icon: 'URL', label: 'Site', detail: hostName || 'Unknown host', weight: 0 },
      { id: 'trigger', icon: 'AI', label: 'Trigger', detail: String(reason || 'Policy enforcement'), weight: 0 },
      { id: 'tip', icon: 'TIP', label: 'Next steps', detail: 'Review allowlist options with a safeguarding lead if this needs access.', weight: 0 }
    ];
    const displaySignals = (signals.length ? signals : fallbackSignals).slice(0, 5);
    const topSignal = pickHighestWeightSignal(displaySignals);
    const friendlyBlock = buildFriendlyExplanation({
      reason: reason || 'Policy enforcement',
      tone: profileTone,
      profileLabel,
      signal: topSignal,
      suggestions: profileSuggestions
    });
    const signalTopic = determineSignalTopic(topSignal);
    const microLessons = pickMicroLessons(profileTone, signalTopic, hostName || '');
    const explain = doc.createElement('div');
    explain.className = 'sg-explain';
    const explainEyebrow = doc.createElement('span');
    explainEyebrow.className = 'sg-explain__eyebrow';
    explainEyebrow.textContent = 'Why this was blocked';
    explain.appendChild(explainEyebrow);
    const explainTitle = doc.createElement('h2');
    explainTitle.className = 'sg-explain__title';
    explainTitle.textContent = friendlyBlock.heading;
    explain.appendChild(explainTitle);
    const explainDetail = doc.createElement('p');
    explainDetail.textContent = friendlyBlock.detail;
    explain.appendChild(explainDetail);
    const context = doc.createElement('p');
    context.className = 'sg-reason sg-explain__context';
    const contextBits = [];
    if (friendlyBlock.profileLabel) contextBits.push(`Profile: ${friendlyBlock.profileLabel}`);
    contextBits.push(`Safeguard rule: ${reason || 'Policy enforcement'}`);
    context.textContent = contextBits.join(' • ');
    explain.appendChild(context);
    if (friendlyBlock.suggestion){
      const suggestionPara = doc.createElement('p');
      suggestionPara.className = 'sg-explain__suggestion';
      suggestionPara.textContent = friendlyBlock.suggestion;
      explain.appendChild(suggestionPara);
    }
    panel.appendChild(explain);
    const heuristicsSnapshot = {
      riskScore,
      riskThreshold,
      riskLevel,
      riskSummary,
      riskPercent,
      riskMax,
      signals: displaySignals.map((signal)=>({
        id: signal.id || null,
        icon: signal.icon || null,
        label: signal.label || null,
        detail: signal.detail || null,
        weight: typeof signal.weight === 'number' ? signal.weight : null,
        meta: Array.isArray(signal.meta) ? signal.meta.slice(0, 3) : null
      }))
    };
    if (ENABLE_INSIGHTS_PANEL){
      const insights = doc.createElement('div');
      insights.className = 'sg-insights';
      const insightsTitle = doc.createElement('h3');
      insightsTitle.textContent = 'What Safeguard detected';
      insights.appendChild(insightsTitle);
      insightsList = doc.createElement('div');
      insightsList.className = 'sg-insights__list';
      insightsList.setAttribute('role', 'list');
      displaySignals.forEach((signal)=>{
        const item = doc.createElement('div');
        item.className = 'sg-insights__item';
        item.setAttribute('role', 'listitem');
        const icon = doc.createElement('div');
        icon.className = 'sg-insights__icon';
        const iconText = typeof signal.icon === 'string' && signal.icon.trim() ? signal.icon.trim().slice(0, 4) : 'SIG';
        icon.textContent = iconText.toUpperCase();
        item.appendChild(icon);
        const bodyWrap = doc.createElement('div');
        bodyWrap.className = 'sg-insights__body';
        const titleRow = doc.createElement('div');
        titleRow.className = 'sg-insights__title';
        const titleText = doc.createElement('span');
        titleText.textContent = signal.label || 'Signal detected';
        titleRow.appendChild(titleText);
        if (typeof signal.weight === 'number' && signal.weight){
          const weightChip = doc.createElement('span');
          weightChip.className = 'sg-insights__score';
          const rounded = Math.round(signal.weight);
          weightChip.textContent = `${rounded > 0 ? '+' : ''}${rounded}`;
          titleRow.appendChild(weightChip);
        }
        bodyWrap.appendChild(titleRow);
        if (signal.detail){
          const detail = doc.createElement('p');
          detail.textContent = String(signal.detail);
          bodyWrap.appendChild(detail);
        }
        const friendly = signalFriendlySummary(signal);
        if (friendly){
          const friendlyEl = doc.createElement('p');
          friendlyEl.className = 'sg-insights__friendly';
          friendlyEl.textContent = friendly;
          bodyWrap.appendChild(friendlyEl);
        }
        if (Array.isArray(signal.meta) && signal.meta.length){
          const metaDetail = doc.createElement('p');
          metaDetail.textContent = signal.meta.slice(0, 3).join(' • ');
          bodyWrap.appendChild(metaDetail);
        }
        item.appendChild(bodyWrap);
        insightsList.appendChild(item);
      });
      insights.appendChild(insightsList);
      panel.appendChild(insights);
    }

    const actions = doc.createElement('div');
    actions.className = 'sg-actions';

    const backBtn = doc.createElement('button');
    backBtn.className = 'sg-button sg-button--secondary';
    backBtn.type = 'button';
    backBtn.textContent = 'Back to safety';
    backBtn.addEventListener('click', ()=>{
      if (history.length > 1){
        history.back();
      } else {
        location.href = 'about:blank';
      }
    });
    actions.appendChild(backBtn);

    const continueBtn = doc.createElement('button');
    continueBtn.className = 'sg-button sg-button--primary';
    continueBtn.type = 'button';
    let remaining = 5;
    continueBtn.disabled = true;
    const updateContinue = ()=>{
      continueBtn.textContent = remaining > 0 ? `Continue anyway (${remaining})` : 'Continue anyway';
    };
    updateContinue();
    const timer = setInterval(()=>{
      remaining -= 1;
      updateContinue();
      if (remaining <= 0){
        clearInterval(timer);
        continueBtn.disabled = false;
      }
    }, 1000);

    const completeOverride = async (overrideReason)=>{
      let host = '';
      try {
        host = getHost();
        if (host) sessionStorage.setItem('sg-ov:' + host, '1');
      } catch(_e) {}
      if (pinRequired){
        let overrideCountForHost = 0;
        try {
          const snapshot = await new Promise((resolve)=>chrome.storage.local.get({ overrideLog: [] }, resolve));
          const existingLog = Array.isArray(snapshot.overrideLog) ? snapshot.overrideLog : [];
          overrideCountForHost = existingLog.filter((entry)=>entry && entry.host === host).length;
        } catch(_e){}
        const policyReview = evaluateOverridePolicy({
          host,
          url: (()=>{ try { return location.href; } catch(_err){ return null; } })(),
          reason: overrideReason,
          heuristics: heuristicsSnapshot,
          overrideCountForHost
        });
        await recordOverrideEvent(overrideReason, {
          pinRequired: true,
          policyReview,
          heuristics: heuristicsSnapshot
        });
      }
      location.reload();
    };

    let pinBlock = null;
    let pinInput = null;
    let pinSubmit = null;
    let pinError = null;
    let pinCancel = null;
    let pinReasonInput = null;

    if (pinRequired){
      pinBlock = doc.createElement('div');
      pinBlock.className = 'sg-pin';

      const pinLabel = doc.createElement('div');
      pinLabel.className = 'sg-pin__label';
      pinLabel.textContent = 'Parent PIN required to continue.';
      pinBlock.appendChild(pinLabel);

      pinInput = doc.createElement('input');
      pinInput.className = 'sg-pin__input';
      pinInput.type = 'password';
      pinInput.inputMode = 'numeric';
      pinInput.pattern = '\\d{4,8}';
      pinInput.autocomplete = 'off';
      pinInput.autocapitalize = 'off';
      pinInput.spellcheck = false;
      pinInput.maxLength = 8;
      pinInput.placeholder = '••••';
      pinInput.setAttribute('aria-label', 'Parent PIN');
      pinBlock.appendChild(pinInput);

      const pinActions = doc.createElement('div');
      pinActions.className = 'sg-pin__actions';
      pinSubmit = doc.createElement('button');
      pinSubmit.type = 'button';
      pinSubmit.className = 'sg-button sg-button--primary';
      pinSubmit.textContent = 'Unlock override';
      pinSubmit.disabled = true;
      pinCancel = doc.createElement('button');
      pinCancel.type = 'button';
      pinCancel.className = 'sg-button sg-button--secondary';
      pinCancel.textContent = 'Cancel';
      pinActions.appendChild(pinSubmit);
      pinActions.appendChild(pinCancel);
      pinBlock.appendChild(pinActions);

      pinError = doc.createElement('div');
      pinError.className = 'sg-pin__message';
      pinBlock.appendChild(pinError);

      const pinReasonWrapper = doc.createElement('div');
      pinReasonWrapper.className = 'sg-pin__reason';
      const pinReasonLabel = doc.createElement('label');
      pinReasonLabel.className = 'sg-pin__reason-label';
      pinReasonLabel.textContent = 'Reason for override';
      pinReasonLabel.setAttribute('for', 'sg-pin-reason');
      pinReasonWrapper.appendChild(pinReasonLabel);
      pinReasonInput = doc.createElement('textarea');
      pinReasonInput.id = 'sg-pin-reason';
      pinReasonInput.className = 'sg-pin__reason-input';
      pinReasonInput.rows = 3;
      pinReasonInput.placeholder = 'e.g. GCSE art research, safeguarding review';
      pinReasonInput.maxLength = 240;
      pinReasonInput.setAttribute('aria-label', 'Reason for override');
      pinReasonWrapper.appendChild(pinReasonInput);
      pinBlock.appendChild(pinReasonWrapper);

      const pinPrivacy = doc.createElement('div');
      pinPrivacy.className = 'sg-pin__privacy';
      pinPrivacy.textContent = 'Safeguard keeps this PIN on-device. Nothing is collected or shared.';
      pinBlock.appendChild(pinPrivacy);

      pinInput.addEventListener('input', ()=>{
        let digits = pinInput.value.replace(/\D+/g, '');
        if (digits.length > 8) digits = digits.slice(0, 8);
        if (pinInput.value !== digits) pinInput.value = digits;
        if (pinSubmit) pinSubmit.disabled = digits.length < 4;
        if (pinError) pinError.textContent = '';
      });
      pinInput.addEventListener('keydown', (event)=>{
        if (event.key === 'Enter' && pinSubmit && !pinSubmit.disabled){
          event.preventDefault();
          pinSubmit.click();
        }
      });
      pinCancel.addEventListener('click', ()=>{
        pinBlock.classList.remove('sg-pin--visible');
        if (pinInput) pinInput.value = '';
        if (pinSubmit) pinSubmit.disabled = true;
        if (pinError) pinError.textContent = '';
        if (pinReasonInput) pinReasonInput.value = '';
        continueBtn.disabled = false;
        updateContinue();
      });
      pinSubmit.addEventListener('click', async ()=>{
        if (!pinInput) return;
        const attempt = pinInput.value.trim();
        if (attempt.length < 4){
          if (pinError) pinError.textContent = 'PIN must be 4-8 digits.';
          pinSubmit.disabled = true;
          return;
        }
        pinSubmit.disabled = true;
        if (pinError) pinError.textContent = '';
        const ok = await verifyPinOverride(attempt, pinConfig);
        if (!ok){
          if (pinError) pinError.textContent = 'Incorrect PIN.';
          pinSubmit.disabled = false;
          pinInput.focus();
          pinInput.select();
          return;
        }
        const reasonValue = pinReasonInput ? pinReasonInput.value.trim() : '';
        if (!reasonValue || reasonValue.length < 3){
          if (pinError) pinError.textContent = 'Provide a short reason (3+ characters) for auditing.';
          pinSubmit.disabled = false;
          if (pinReasonInput) pinReasonInput.focus();
          return;
        }
        if (pinError) pinError.textContent = '';
        await completeOverride(reasonValue);
      });
    }

    continueBtn.addEventListener('click', ()=>{
      if (!pinRequired){
        completeOverride();
        return;
      }
      if (!pinBlock) return;
      if (!pinBlock.classList.contains('sg-pin--visible')){
        pinBlock.classList.add('sg-pin--visible');
        continueBtn.disabled = true;
        setTimeout(()=>{
          if (pinInput) pinInput.focus();
        }, 50);
        return;
      }
    });
    actions.appendChild(continueBtn);
    const computedSupportUrl = (() => {
      if (supportLink && supportLink.href) return supportLink.href;
      try {
        const localUrl = chrome.runtime.getURL('site/support.html');
        if (localUrl) return localUrl;
      } catch(_e){}
      return 'https://dipesthapa.github.io/safebrowse-ai/site/support.html';
    })();

    const supportBtn = doc.createElement('button');
    supportBtn.type = 'button';
    supportBtn.className = 'sg-actions__support';
    supportBtn.textContent = (supportLink && supportLink.text) ? supportLink.text : 'Need an exception?';
    supportBtn.addEventListener('click', ()=>{
      const href = computedSupportUrl;
      const target = supportLink && supportLink.target ? supportLink.target : '_blank';
      const features = supportLink && supportLink.windowFeatures ? supportLink.windowFeatures : 'noopener';
      window.open(href, target, features);
    });
    actions.appendChild(supportBtn);
    panel.appendChild(actions);

    if (pinBlock){
      panel.appendChild(pinBlock);
    }

    const guidance = doc.createElement('div');
    guidance.className = 'sg-guidance';
    const guidanceTitle = doc.createElement('h3');
    guidanceTitle.textContent = friendlyBlock.microTitle || 'AI literacy tips';
    guidance.appendChild(guidanceTitle);
    if (friendlyBlock.microIntro){
      const intro = doc.createElement('p');
      intro.className = 'sg-guidance__intro';
      intro.textContent = friendlyBlock.microIntro;
      guidance.appendChild(intro);
    }
    const guidanceList = doc.createElement('ul');
    guidanceList.className = 'sg-guidance__list';
    const lessons = microLessons.length ? microLessons : [
      'If this page is needed, ask a safeguarding lead to review it.',
      'Stick to trusted sites listed in your allowlist.',
      'Never share passwords or personal info on unfamiliar forms.'
    ];
    lessons.forEach((lesson)=>{
      const li = doc.createElement('li');
      li.textContent = lesson;
      guidanceList.appendChild(li);
    });
    guidance.appendChild(guidanceList);
    panel.appendChild(guidance);

    const support = doc.createElement('p');
    support.className = 'sg-support';
    support.appendChild(doc.createTextNode('Need to allow this permanently? Add it to your allowlist in the Safeguard popup or '));
    const supportAnchor = doc.createElement('a');
    supportAnchor.href = computedSupportUrl;
    supportAnchor.target = '_blank';
    supportAnchor.rel = 'noopener';
    supportAnchor.textContent = (supportLink && (supportLink.altText || supportLink.text)) ? (supportLink.altText || supportLink.text) : 'contact support';
    support.appendChild(supportAnchor);
    support.appendChild(doc.createTextNode('.'));
    panel.appendChild(support);
  }

  async function scan(){
    const [cfg, localOverrides] = await Promise.all([
      new Promise((resolve)=>chrome.storage.sync.get({enabled:true, allowlist:[], aggressive:false, sensitivity:60, profileTone: null, profileLabel: null, profileSafeSuggestions: []}, resolve)),
      new Promise((resolve)=>chrome.storage.local.get({
        requirePin: false,
        overridePinHash: null,
        overridePinSalt: null,
        overridePinIterations: 0
      }, resolve))
    ]);
    if(!cfg.enabled) return;
    const pinConfig = {
      requirePin: Boolean(localOverrides.requirePin && localOverrides.overridePinHash && localOverrides.overridePinSalt),
      hash: localOverrides.overridePinHash,
      salt: localOverrides.overridePinSalt,
      iterations: localOverrides.overridePinIterations
    };
    const profileTone = normalizeTone(cfg.profileTone);
    const profileLabel = typeof cfg.profileLabel === 'string' && cfg.profileLabel.trim() ? cfg.profileLabel.trim() : null;
    const profileSuggestions = sanitizeSuggestionList(cfg.profileSafeSuggestions);
    const profileContext = { profileTone, profileLabel, profileSuggestions };
    const host = getHost();
    try {
      if (host && sessionStorage.getItem('sg-ov:' + host) === '1'){
        sessionStorage.removeItem('sg-ov:' + host);
        return; // temporary override for this host (one refresh)
      }
    } catch(_e) {}
    if((cfg.allowlist||[]).includes(host)) return; // allowlisted

    const BL = await loadBlocklist();
    if(BL.domains && BL.domains.includes(host)) {
      lockInteractionShield();
      const blockPayload = createBlocklistInsights({ host });
      showInterstitial("domain blocklist", { pinConfig, ...profileContext, ...blockPayload });
      return;
    }

    if (ENABLE_CYBER){
      attachPhishFormGuard(cfg, pinConfig, profileContext);
      attachNetworkGuards(cfg, pinConfig, profileContext);
    }

    const text = document.body && document.body.innerText ? document.body.innerText.slice(0, 40000) : "";
    const urlEval = evaluateUrlSignals();
    const metaEval = evaluateMetaSignals();
    const bodyEval = evaluateKeywordSignals(text);
    const bodyRawScore = Number.isFinite(bodyEval.score) ? bodyEval.score : 0;
    const bodyScore = Math.min(12, bodyRawScore);
    const visualEval = evaluateVisualSignals();
    const urlScore = urlEval.score;
    const metaScore = metaEval.score;
    const isSocialMediaHost = isRiskyMediaHost(host);
    const visualScore = isSocialMediaHost ? 0 : visualEval.score; // keep blur, avoid full-page block on social feeds
    window.__sg_visualScore = visualScore;
    const total = urlScore + metaScore + bodyScore + visualScore;
    const sens = Number(cfg.sensitivity)||60; window.__sg_sensitivity = sens;
    const threshold = 12 - Math.floor(6 * (sens/100)); // 12..6
    if(total >= threshold) {
      lockInteractionShield();
      const heuristicPayload = createHeuristicInsights({
        host,
        urlEval,
        metaEval,
        bodyEval,
        bodyScore,
        visualEval: isSocialMediaHost ? { ...visualEval, score: 0 } : visualEval,
        total,
        threshold
      });
      showInterstitial("Heuristic risk score", { pinConfig, ...profileContext, ...heuristicPayload });
      return;
    }

    if (ENABLE_CYBER && cfg.phishingProtectionEnabled){
      const forcedHint = hostLooksSuspicious(host);
      if (forcedHint){
        lockInteractionShield();
        handlePhishingHit(createHostHintBlock(host, forcedHint), pinConfig, profileContext);
        return;
      }
      const feedEntries = await loadPhishingFeed();
      const phishingEval = evaluatePhishingSignals({
        strict: Boolean(cfg.phishingStrictMode),
        feedEntries,
        feedEnabled: cfg.phishingFeedEnabled !== false,
        scriptMonitor: cfg.phishingScriptMonitorEnabled !== false
      });
      if (phishingEval){
        lockInteractionShield();
        handlePhishingHit(phishingEval, pinConfig, profileContext);
        return;
      }
    }

    if (ENABLE_CYBER){
      releaseInteractionShield();
      setupPhishObserver(cfg, pinConfig, profileContext);
    }

    // No page-level block: still protect by masking on-screen images/videos
    initMediaFilter();
    if (cfg.aggressive){
      // Watch visible videos and sample frames periodically (deep: includes open shadow roots)
      const attachAll = ()=>{
        try{ collectVideosDeep(document).forEach(v=>startVideoWatcher(v, cfg.sensitivity)); }catch(_e){}
      };
      attachAll();
      new MutationObserver(()=>attachAll()).observe(document.documentElement, {subtree:true, childList:true});
      // Catch dynamically played videos
      document.addEventListener('play', (e)=>{
        const t = e.target; if (t && t instanceof HTMLVideoElement) startVideoWatcher(t, cfg.sensitivity);
      }, true);
      // Periodic safety scan (some apps replace DOM trees frequently)
      setInterval(attachAll, 2000);
      // Fallback: if no accessible <video> is found or sampling is blocked (DRM/closed shadow), show full-screen overlay on streaming hosts
      setTimeout(()=>{ try{
        const vids = collectVideosDeep(document);
        const anyMasked = vids.some(v=>v && v.__sg_masked);
        if (!anyMasked && isStreamingHost()){
          showFullscreenOverlay('Streaming video hidden (aggressive mode)');
        }
      }catch(_e){} }, 2500);
    }
  }

  scan();
})();
