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
    const thr = 0.35 - 0.2 * (Math.max(10, Math.min(100, sensitivity||60)) / 100);
    const tick = ()=>{
      if (!video.isConnected){ return; }
      if (video.readyState < 2 || video.paused || video.currentTime===0){ setTimeout(tick, 800); return; }
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
      }catch(_e){ /* Likely tainted canvas; skip sampling */ }
      setTimeout(tick, 1000);
    };
    setTimeout(tick, 600);
  }

  function showInterstitial(reason){
    // Safely replace the document without using innerHTML
    const doc = document;
    while (doc.documentElement.firstChild) {
      doc.documentElement.removeChild(doc.documentElement.firstChild);
    }

    const wrap = doc.createElement('div');
    Object.assign(wrap.style, { fontFamily: 'system-ui, sans-serif', margin: '4rem', textAlign: 'center' });

    const h1 = doc.createElement('h1');
    h1.textContent = 'Safeguard';
    wrap.appendChild(h1);

    const p1 = doc.createElement('p');
    p1.textContent = 'This page was blocked by local rules (MVP).';
    wrap.appendChild(p1);

    const p2 = doc.createElement('p');
    const b = doc.createElement('b');
    b.textContent = 'Reason: ';
    const reasonText = doc.createElement('span');
    reasonText.textContent = String(reason || '');
    p2.appendChild(b);
    p2.appendChild(reasonText);
    wrap.appendChild(p2);

    const button = doc.createElement('button');
    button.id = 'sg-override';
    let remaining = 5;
    button.disabled = true;
    const updateBtn = () => { button.textContent = remaining > 0 ? `Show anyway (${remaining})` : 'Show anyway'; };
    updateBtn();
    const timer = setInterval(() => { remaining -= 1; updateBtn(); if (remaining <= 0) { clearInterval(timer); button.disabled = false; } }, 1000);
    button.addEventListener('click', () => {
      try {
        const host = getHost();
        if (host) sessionStorage.setItem('sg-ov:' + host, '1');
      } catch(_e) {}
      location.reload();
    });
    wrap.appendChild(button);

    doc.documentElement.appendChild(wrap);
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
      // Watch visible videos and sample frames periodically
      const sel = 'video';
      document.querySelectorAll(sel).forEach(v=>startVideoWatcher(v, cfg.sensitivity));
      new MutationObserver((muts)=>{
        muts.forEach(m=>{
          m.addedNodes && m.addedNodes.forEach(n=>{
            if (n instanceof HTMLVideoElement) startVideoWatcher(n, cfg.sensitivity);
            if (n.querySelectorAll) n.querySelectorAll('video').forEach(v=>startVideoWatcher(v, cfg.sensitivity));
          });
        });
      }).observe(document.documentElement, {subtree:true, childList:true});
    }
  }

  scan();
})();
