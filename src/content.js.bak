(function(){
  const BLOCK_WORDS = ["explicit","nsfw","xxx","torrent"]; // MVP heuristic

  function getHost(){
    try { return location.hostname.replace(/^www\./,'').toLowerCase(); } catch(e){ return ''; }
  }

  async function loadBlocklist(){
    try {
      const url = chrome.runtime.getURL('data/blocklist.json');
      const res = await fetch(url);
      if(!res.ok) return {domains:[]};
      return await res.json();
    } catch(_e){ return {domains:[]}; }
  }

  function shouldBlock(text){
    const lower = text.toLowerCase();
    return BLOCK_WORDS.some(w => lower.includes(w));
  }

  function showInterstitial(reason){
    document.documentElement.innerHTML = `
      <div style="font-family:system-ui;margin:4rem;text-align:center">
        <h1>Safeguard</h1>
        <p>This page was blocked by local rules (MVP).</p>
        <p><b>Reason:</b> ${reason}</p>
        <button id="sg-override">Show anyway</button>
      </div>`;
    document.getElementById('sg-override').onclick = () => location.reload();
  }

  async function scan(){
    const cfg = await new Promise(r => chrome.storage.sync.get({enabled:true, allowlist:[]}, r));
    if(!cfg.enabled) return;
    const host = getHost();
    if((cfg.allowlist||[]).includes(host)) return; // allowlisted

    const BL = await loadBlocklist();
    if(BL.domains && BL.domains.includes(host)) { showInterstitial("domain blocklist"); return; }

    const text = document.body && document.body.innerText ? document.body.innerText.slice(0, 40000) : "";
    if(shouldBlock(text)) showInterstitial("keyword heuristic match");
  }

  scan();
})();
