// Init script injected into every game page by qa.mjs / capture.mjs before the game's own script runs.
// It installs a recording window.Platform (games keep it because they use `window.Platform || {...}`)
// and window.__qa helpers that find buttons, the score and the canvas without knowing the game's ids.
// Games can make detection exact with data-qa="start|retry|resume|pause|lang|score" attributes
// and/or a window.__game = { state, score } debug object (see template/index.html).
export const PROBE = `(() => {
  const log = { gameplayStart: 0, gameplayStop: 0, happytime: 0, gameOver: 0, lastScore: null };
  window.Platform = {
    gameplayStart() { log.gameplayStart++; }, gameplayStop() { log.gameplayStop++; },
    happytime() { log.happytime++; }, gameOver(s) { log.gameOver++; log.lastScore = s; }
  };
  const vis = el => {
    if (!el || !el.isConnected) return false;
    if (el.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    if (r.bottom <= 0 || r.right <= 0 || r.left >= innerWidth || r.top >= innerHeight) return false;
    // covered by something that is not part of the element (e.g. a panel above it)
    const cx = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
    const top = document.elementFromPoint(cx, cy);
    return !top || top === el || el.contains(top) || top.contains(el);
  };
  const buttons = () => [...document.querySelectorAll('button,[role=button],a.btn,.btn')].filter(vis);
  const label = b => [...new Set([b.id, b.getAttribute('data-qa'), (b.textContent || '').trim(), b.getAttribute('aria-label')].filter(Boolean))].join(' ');
  // A button that names its role with data-qa is only ever that role: the label guess skips it for other roles
  // (a pause menu's "restart" button must never be taken for the game over screen's retry button).
  const pick = (selectors, re) => {
    for (const s of selectors) for (const el of document.querySelectorAll(s)) if (vis(el)) return el;
    return buttons().find(b => { const q = b.getAttribute('data-qa'); return (!q || selectors.includes('[data-qa=' + q + ']')) && re.test(label(b)); }) || null;
  };
  const center = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, label: label(el).slice(0, 40) }; };
  const area = el => { const r = el.getBoundingClientRect(); return r.width * r.height; };
  const START = ['[data-qa=start]', '#start', '#startBtn', '#startButton', '#play', '#playBtn', '#playButton', '#btnStart', '#btnPlay'];
  const RETRY = ['[data-qa=retry]', '#retry', '#retryBtn', '#retryButton', '#again', '#againBtn', '#restart', '#restartBtn', '#btnRetry', '#btnAgain'];
  const RESUME = ['[data-qa=resume]', '#resume', '#resumeBtn', '#resumeButton', '#btnResume'];
  const PAUSE = ['[data-qa=pause]', '#pauseBtn', '#pause-btn', '#pauseButton', '#btnPause'];
  const LANG = ['[data-qa=lang]', '#lang', '#langBtn', '#langButton', '#langToggle', '#btnLang'];
  window.__qa = {
    log,
    start() {
      const el = pick(START, /start|play|スタート|はじめ|あそぶ|遊ぶ/i);
      if (el) return center(el);
      // fallback: the biggest visible button that is not a small toolbar chip
      const big = buttons().filter(b => area(b) > 2500).sort((a, b) => area(b) - area(a))[0];
      return center(big);
    },
    retry() { return center(pick(RETRY, /retry|again|restart|もう一[回度]|もういち|リトライ|再挑戦|もう1回/i)); },
    resume() { return center(pick(RESUME, /resume|continue|つづける|続ける|再開/i)); },
    pause() { return center(pick(PAUSE, /^\\W*(?:II|❚❚|⏸)\\W*$|pause|一時停止/i)); },
    lang() { return center(pick(LANG, /^\\s*(?:EN|JA|English|日本語|EN\\s*\\/\\s*JA|JA\\s*\\/\\s*EN)\\s*$/i)); },
    score() {
      const g = window.__game;
      if (g && typeof g.score === 'number') return g.score;
      const el = document.querySelector('[data-qa=score]') || document.getElementById('score');
      if (!el) return null;
      const n = parseInt((el.textContent || '').replace(/[^0-9-]/g, ''), 10);
      return Number.isFinite(n) ? n : null;
    },
    state() { const g = window.__game; return g && typeof g.state === 'string' ? g.state : null; },
    canvas() {
      const cs = [...document.querySelectorAll('canvas')].filter(c => { const r = c.getBoundingClientRect(); return r.width > 20 && r.height > 20; })
        .sort((a, b) => area(b) - area(a));
      if (!cs[0]) return null;
      const r = cs[0].getBoundingClientRect();
      const x = Math.max(0, r.left), y = Math.max(0, r.top);
      return { x, y, width: Math.min(innerWidth, r.right) - x, height: Math.min(innerHeight, r.bottom) - y };
    },
    // A point inside the canvas (fractions fx, fy) that is not on a button or link; null if it is.
    safePoint(fx, fy) {
      const c = this.canvas() || { x: 0, y: 0, width: innerWidth, height: innerHeight };
      const x = c.x + c.width * fx, y = c.y + c.height * fy;
      const el = document.elementFromPoint(x, y);
      if (el && el.closest('button,a,input,select,textarea,[role=button],label')) return null;
      return { x, y };
    },
    // Pixel statistics of the game canvas itself (DOM overlays excluded). Colours are quantised to
    // 4 bits per channel; fully transparent pixels count as one colour.
    canvasStats() {
      const c = [...document.querySelectorAll('canvas')].sort((a, b) => area(b) - area(a))[0];
      if (!c || !c.width || !c.height) return null;
      const W = 120, H = Math.max(1, Math.round(c.height * 120 / c.width));
      const o = document.createElement('canvas'); o.width = W; o.height = H;
      const g = o.getContext('2d');
      try { g.drawImage(c, 0, 0, W, H); } catch (e) { return null; }
      const px = g.getImageData(0, 0, W, H).data;
      const counts = new Map(); let transparent = 0;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] === 0) { transparent++; counts.set(-1, (counts.get(-1) || 0) + 1); continue; }
        const k = (px[i] >> 4) << 12 | (px[i + 1] >> 4) << 8 | (px[i + 2] >> 4) << 4 | (px[i + 3] >> 4);
        counts.set(k, (counts.get(k) || 0) + 1);
      }
      const total = px.length / 4;
      return { distinct: counts.size, dominant: Math.max(...counts.values()) / total, transparent: transparent / total };
    },
    // Hide everything except canvases (and neutralise page backgrounds) for a canvas-only screenshot.
    isolateCanvas(on) {
      let st = document.getElementById('__qa_iso');
      if (on && !st) {
        st = document.createElement('style'); st.id = '__qa_iso';
        st.textContent = '*{visibility:hidden!important} canvas{visibility:visible!important} html,body{background:#000!important}';
        document.documentElement.appendChild(st);
      } else if (!on && st) st.remove();
    },
    hScroll() { const s = document.scrollingElement; return s ? s.scrollWidth - innerWidth : 0; },
    text() { return (document.body.innerText || '').slice(0, 2000); }
  };
})();`;
