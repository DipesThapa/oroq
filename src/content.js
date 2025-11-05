(function(){
  // Advanced textual heuristic (non-exhaustive, on-device). Balanced for privacy and speed.
  const KW_STRONG = [
    'porn','xxx','hentai','onlyfans','pornhub','xvideos','xnxx','xhamster','redtube','youporn','brazzers','spankbang',
    'pornographie','pornografía','porno','sex tape','live sex','webcam sex','camgirl','cam boy',
    'nude','nudity','hardcore','softcore','fetish','bdsm','orgasm','blowjob','handjob','anal','threesome','milf','teen'
  ];
  const KW_MEDIUM = [
    'adult','nsfw','explicit','erotic','escort','models','amateur','nsfw', '18+', 'age verification'
  ];
  const HOST_HINTS = ['porn','xxx','sex','hentai','xh','xv','xnxx','onlyfans','cam'];
  const AGE_GATE_RX = /(18\+|adults? only|are you 18|age verification|enter if 18)/i;
  const NEGATIVE_RX = /(sex education|sexual education|sex ed|reproductive health|biology|anatomy|consent education|porn addiction help|porn recovery|filter porn|block porn|family safety|child safety|parental control|safesearch|wikipedia|encyclopedia|news report)/i;

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

  function scoreFromText(text){
    const lower = (text||'').toLowerCase();
    let s = 0;
    if (AGE_GATE_RX.test(lower)) s += 5;
    if (NEGATIVE_RX.test(lower)) s -= 4; // de-emphasize educational/safety contexts
    // strong terms (higher weight)
    for (const w of KW_STRONG) { if (lower.includes(w)) s += 3; }
    // medium terms (lower weight)
    for (const w of KW_MEDIUM) { if (lower.includes(w)) s += 1; }
    return s;
  }

  function scoreFromTitleAndMeta(){
    let s = 0;
    try{ s += scoreFromText(document.title||''); }catch(_e){}
    try{
      const metas = document.querySelectorAll('meta[name="description"], meta[name="keywords"], meta[property="og:title"], meta[property="og:description"]');
      metas.forEach(m=>{ const v=m.content||''; s += Math.min(6, scoreFromText(v)); });
    }catch(_e){}
    return s;
  }

  function scoreFromUrl(){
    let s = 0;
    try{
      const { hostname, pathname } = new URL(location.href);
      if (/\.xxx$/i.test(hostname)) s += 8;
      const hostL = hostname.toLowerCase();
      if (HOST_HINTS.some(h=>hostL.includes(h))) s += 6;
      const pathL = (pathname||'').toLowerCase();
      if (/(\/porn|\/xxx|\/hentai|\/adult|\/sex)/.test(pathL)) s += 2;
    }catch(_e){}
    return s;
  }

  // --- On-screen media masking (images/videos) ---
  let styleInjected = false;
  function ensureStyles(){
    if (styleInjected) return; styleInjected = true;
    const st = document.createElement('style');
    st.textContent = `
      .sg-blur { filter: blur(28px) saturate(0.6) contrast(0.8) !important; }
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
    return scoreFromText(t) >= textThreshold;
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

  function showInterstitial(reason){
    const doc = document;
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
        --pill-bg: rgba(37,99,235,0.12);
        --pill-text: #2563eb;
        font-family: "Inter", "Segoe UI", system-ui, -apple-system, sans-serif;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--bg-gradient);
        color: var(--text-primary);
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
        background: rgba(15, 23, 42, 0.06);
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
    `;
    head.appendChild(style);
    root.appendChild(head);

    const body = doc.createElement('body');
    root.appendChild(body);

    const panel = doc.createElement('div');
    panel.className = 'sg-panel';
    body.appendChild(panel);

    const header = doc.createElement('div');
    header.className = 'sg-header';

    const icon = doc.createElement('div');
    icon.className = 'sg-icon';
    icon.textContent = 'S';
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
    pill.textContent = 'On-device protection';
    panel.appendChild(pill);

    const reasonPara = doc.createElement('p');
    reasonPara.className = 'sg-reason';
    const reasonLabel = doc.createElement('strong');
    reasonLabel.textContent = 'Reason: ';
    reasonPara.appendChild(reasonLabel);
    reasonPara.append(String(reason || 'Policy enforcement'));
    panel.appendChild(reasonPara);

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
    continueBtn.addEventListener('click', ()=>{
      try {
        const host = getHost();
        if (host) sessionStorage.setItem('sg-ov:' + host, '1');
      } catch(_e) {}
      location.reload();
    });
    actions.appendChild(continueBtn);
    panel.appendChild(actions);

    const support = doc.createElement('p');
    support.className = 'sg-support';
    support.innerHTML = 'Need to allow this permanently? Add it to your allowlist in the Safeguard popup or <a href="https://dipesthapa.github.io/safebrowse-ai/support.html" target="_blank" rel="noopener">contact support</a>.';
    panel.appendChild(support);
  }

  async function scan(){
    const cfg = await new Promise(r => chrome.storage.sync.get({enabled:true, allowlist:[], aggressive:false, sensitivity:60}, r));
    if(!cfg.enabled) return;
    const host = getHost();
    try {
      if (host && sessionStorage.getItem('sg-ov:' + host) === '1') return; // temporary override for this host (tab/session)
    } catch(_e) {}
    if((cfg.allowlist||[]).includes(host)) return; // allowlisted

    const BL = await loadBlocklist();
    if(BL.domains && BL.domains.includes(host)) { showInterstitial("domain blocklist"); return; }

    const text = document.body && document.body.innerText ? document.body.innerText.slice(0, 40000) : "";
    const urlScore = scoreFromUrl();
    const metaScore = scoreFromTitleAndMeta();
    const bodyScore = Math.min(12, scoreFromText(text));
    const total = urlScore + metaScore + bodyScore;
    const sens = Number(cfg.sensitivity)||60; window.__sg_sensitivity = sens;
    const threshold = 12 - Math.floor(6 * (sens/100)); // 12..6
    if(total >= threshold) { showInterstitial("advanced heuristic score"); return; }

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
