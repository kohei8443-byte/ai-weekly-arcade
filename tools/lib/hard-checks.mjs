// Hard checks: the (必須) [A] items of QUALITY_BAR.md (the "mandatory, automatic" items),
// run by tools/qa.mjs on games whose meta.json has "quality_bar": 1 or more (or with --hard).
// Every result names the bar item it covers, e.g. "[1.3.2]". The checks talk to the game only through
// documented window.__game hooks (tools/README.md) and through browser instrumentation installed by
// HARD_INIT before the game script runs. Time-dependent checks use the game's stepped clock
// (__game.manual / __game.tick), so they give the same answer on a slow CI machine.
import fs from 'node:fs';
import path from 'node:path';
import { scanJs } from './static-check.mjs';

export const REQUIRED_HOOKS = ['state', 'score', 'snap', 'manual', 'tick', 'demo', 'tap', 'audioState', 'view', 'peak'];
export const OPTIONAL_HOOKS = ['autoplay', 'fail', 'texts', 'target'];

// Installed before the game: records listeners, audio graph connections to the speakers, AudioContexts,
// Platform calls in order, text drawn with fillText on visible canvases, and offers a virtual
// performance.now() that moves only with the stepped clock (so event handlers and the game agree on time).
export const HARD_INIT = `(() => {
  const H = window.__hard = { listeners: [], dest: [], compIn: [], ctxs: [], pf: [], fillMin: Infinity, fillWho: '' };
  window.Platform = {
    gameplayStart() { H.pf.push('start'); }, gameplayStop() { H.pf.push('stop'); },
    happytime() { H.pf.push('happy'); }, gameOver(s) { H.pf.push('over'); }
  };
  const ae = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (t, f, o) {
    try {
      const cap = o === true || !!(o && o.capture);
      const who = this === window ? 'window' : this === document ? 'document' : (this && this.tagName) ? this.tagName.toLowerCase() + (this.id ? '#' + this.id : '') : '';
      if (who) H.listeners.push({ type: String(t), cap, who });
    } catch (e) {}
    return ae.call(this, t, f, o);
  };
  for (const n of ['AudioContext', 'webkitAudioContext']) {
    const C = window[n]; if (typeof C !== 'function') continue;
    const Wrapped = function (...a) { const c = new C(...a); H.ctxs.push(c); return c; };
    Wrapped.prototype = C.prototype;
    try { Object.defineProperty(window, n, { value: Wrapped, configurable: true, writable: true }); } catch (e) {}
  }
  if (window.AudioNode) {
    const oc = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (d, ...a) {
      try {
        const offline = window.OfflineAudioContext && this.context instanceof OfflineAudioContext;
        if (!offline && d instanceof AudioDestinationNode) H.dest.push(this.constructor.name);
        if (!offline && window.DynamicsCompressorNode && d instanceof DynamicsCompressorNode) H.compIn.push(this.constructor.name);
      } catch (e) {}
      return oc.call(this, d, ...a);
    };
  }
  for (const m of ['fillText', 'strokeText']) {
    const f = CanvasRenderingContext2D.prototype[m];
    CanvasRenderingContext2D.prototype[m] = function (s, ...a) {
      try {
        const cv = this.canvas;
        if (cv && cv.isConnected && String(s).trim()) {
          const px = parseFloat((/(\\d+(?:\\.\\d+)?)px/.exec(this.font) || [])[1]);
          const tr = this.getTransform(), r = cv.getBoundingClientRect();
          const css = px * Math.hypot(tr.c, tr.d) * (r.height / cv.height);
          if (css > 0 && css < H.fillMin) { H.fillMin = css; H.fillWho = String(s).slice(0, 24); }
        }
      } catch (e) {}
      return f.call(this, s, ...a);
    };
  }
  const realNow = performance.now.bind(performance); let v = null;
  performance.now = () => v == null ? realNow() : v;
  // stepped clock: freeze performance.now, switch the game to manual time, then advance both together
  H.manual = () => { v = realNow(); window.__game.manual(true); };
  H.step = (ms, render) => { v += ms; window.__game.tick(ms, !!render); };
  H.run = (ms, every, render) => { const n = Math.max(1, Math.round(ms / every)); for (let i = 0; i < n; i++) H.step(ms / n, render && i === n - 1); };
  H.key = (type, key, code) => (document.activeElement || document.body).dispatchEvent(new KeyboardEvent(type, { key, code, bubbles: true, cancelable: true }));
  H.press = (key, code) => { H.key('keydown', key, code); H.key('keyup', key, code); };
  H.seed = n => { let s = n >>> 0; Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  H.dead = () => { const G = window.__game, s = G.snap && G.snap(); return !!(s && s.dead) || !/^(play|paused)$/.test(String(G.state)); };
  H.click = sel => { const el = document.querySelector(sel); if (el) el.click(); return !!el; };
  H.canvas = () => [...document.querySelectorAll('canvas')].filter(c => c.isConnected).sort((a, b) => b.width * b.height - a.width * a.height)[0] || null;
  // mean luminance (0..1) of the main canvas, downsampled
  const lc = document.createElement('canvas'); lc.width = 24; lc.height = 40;
  const lx = lc.getContext('2d', { willReadFrequently: true });
  H.luma = () => {
    const c = H.canvas(); if (!c) return 0;
    lx.clearRect(0, 0, 24, 40); lx.drawImage(c, 0, 0, 24, 40);
    const d = lx.getImageData(0, 0, 24, 40).data; let L = 0;
    for (let i = 0; i < d.length; i += 4) L += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    return L / (d.length / 4);
  };
  H.pixels = () => { const c = H.canvas(); if (!c) return null; const x = document.createElement('canvas'); x.width = c.width; x.height = c.height; const g = x.getContext('2d', { willReadFrequently: true }); g.drawImage(c, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; };
  H.diff = (a, b) => { if (!a || !b || a.length !== b.length) return -1; let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24) n++; return n; };
  H.visibleButtons = () => [...document.querySelectorAll('button,[role=button],a')].filter(b => {
    if (b.closest('[hidden]')) return false;
    const r = b.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false;
    if (b.checkVisibility && !b.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    return r.bottom > 0 && r.right > 0 && r.left < innerWidth && r.top < innerHeight;
  }).map(b => b.id || b.getAttribute('data-qa') || b.textContent.trim().slice(0, 12) || b.tagName.toLowerCase());
  // visible DOM text: [smallest font size in CSS px, the text], ignoring transparent text (hit areas over canvas drawings)
  H.domText = () => {
    let min = Infinity, who = '', all = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const t = n.textContent.trim(), el = n.parentElement; if (!t || !el || el.closest('script,style,[hidden]')) continue;
      if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1 || r.bottom <= 0 || r.top >= innerHeight) continue;
      const cs = getComputedStyle(el), col = cs.color.match(/[\\d.]+/g) || [];
      if (col.length === 4 && Number(col[3]) === 0) continue;
      if (cs.color === 'transparent') continue;
      all.push(t.slice(0, 30));
      const fs = parseFloat(cs.fontSize); if (fs < min) { min = fs; who = t.slice(0, 24); }
    }
    return { min, who, all };
  };
})();`;

const STORAGE_THROWS = `Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('storage blocked by qa'); } });`;

const BAR = {
  hooks: 'hooks', start: '1.1.1', first: '1.1.2', idle: '1.1.3', input: '1.2.1', unlock: '1.3.1', route: '1.3.2', text: '1.4.4',
  retry: '1.5.4', storage: '1.6.5', demo: '1.9.1', parity: '1.10.2', platform: '1.10.3', flash: '1.10.4'
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Differences between two snap() JSON strings (60 Hz first): numbers may differ by abs or by rel (a fraction),
// everything else (text, booleans, null, missing keys) must match.
function snapDiff(aJson, bJson, abs, rel) {
  const out = [];
  const walk = (a, b, at) => {
    if (typeof a === 'number' && typeof b === 'number') { if (Math.abs(a - b) > Math.max(abs, rel * Math.max(Math.abs(a), Math.abs(b)))) out.push(`${at || 'value'} ${a} vs ${b}`); return; }
    if (a && b && typeof a === 'object' && typeof b === 'object') { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], at ? `${at}.${k}` : k); return; }
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`${at || 'value'} ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
  };
  try { walk(JSON.parse(aJson), JSON.parse(bJson), ''); } catch (e) { if (aJson !== bJson) out.push('snap() is not JSON'); }
  return out;
}

// Runs every hard check. browser: a Chromium launched with --autoplay-policy=user-gesture-required.
// Returns [{ level, check: 'hard:<name>', msg: '[<bar id>] ...' }].
export async function runHardChecks(browser, origin, gameDir, { parallel = 2 } = {}) {
  const results = [];
  const add = (level, name, id, msg) => results.push({ level, check: `hard:${name}`, msg: `[${id}] ${msg}` });
  const src = fs.readFileSync(path.join(gameDir, 'index.html'), 'utf8');
  // the game's script code with comments and string contents blanked (source-text checks must not match comments)
  // (same length and line breaks as index.html, so line numbers still match; markup outside scripts is blanked)
  let code = src.replace(/[^\n]/g, ' ');
  for (const m of src.matchAll(/(<script\b[^>]*>)([\s\S]*?)<\/script>/gi)) {
    const at = m.index + m[1].length, js = scanJs(m[2]).code;
    code = code.slice(0, at) + js + code.slice(at + js.length);
  }
  // localStorage keys seen at the end of each browser check (reported once, after all checks)
  const storageKeys = new Set();
  const readKeys = async ev => { try { for (const k of await ev(() => { try { return Object.keys(localStorage); } catch (e) { return []; } })) storageKeys.add(k); } catch (e) { /* page gone */ } };
  let meta = {};
  try { meta = JSON.parse(fs.readFileSync(path.join(gameDir, 'meta.json'), 'utf8')); } catch (e) { /* the static checks report it */ }
  const slug = meta.slug || '';

  async function open(ctxOpts, { query = '', init = [], wait = 800 } = {}) {
    const context = await browser.newContext({ locale: 'ja-JP', reducedMotion: 'no-preference', ...ctxOpts });
    await context.route('**/*', r => (r.request().url().startsWith(origin) || /^(data|blob|about):/.test(r.request().url()) ? r.continue() : r.abort()));
    await context.addInitScript(HARD_INIT);
    for (const s of init) await context.addInitScript(s);
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(String(e.message || e).split('\n')[0]));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
    await page.goto(`${origin}/index.html${query}`, { waitUntil: 'load' });
    if (wait) await sleep(wait);
    return { page, context, errors, ev: (fn, arg) => page.evaluate(fn, arg) };
  }
  const errText = errs => (errs.length ? `; page errors: ${[...new Set(errs)].slice(0, 3).join(' | ')}` : '');

  // ---- hooks ----
  let hooks;
  {
    const { context, ev } = await open({ viewport: { width: 390, height: 780 } }, { wait: 500 });
    hooks = await ev(([req, opt]) => {
      const G = window.__game;
      if (!G) return { missing: req, optional: [] };
      const ok = k => (k === 'state' ? typeof G.state === 'string' : k === 'score' ? typeof G.score === 'number' : typeof G[k] === 'function');
      return { missing: req.filter(k => !ok(k)), optional: opt.filter(ok) };
    }, [REQUIRED_HOOKS, OPTIONAL_HOOKS]);
    await context.close();
    if (hooks.missing.length) add('fail', 'hooks', BAR.hooks, `window.__game is missing required hooks: ${hooks.missing.join(', ')} (see tools/README.md); the hard checks that need them are skipped and count as failed`);
    else add('pass', 'hooks', BAR.hooks, `all required window.__game hooks present; optional: ${hooks.optional.join(', ') || 'none'}`);
  }
  const has = k => !hooks.missing.includes(k) && (REQUIRED_HOOKS.includes(k) || hooks.optional.includes(k));
  const needs = (keys, name, id) => { const miss = keys.filter(k => !has(k)); if (miss.length) { add('fail', name, id, `skipped: needs __game.${miss.join(', __game.')}`); return false; } return true; };

  // a death in the stepped clock: no input until the run ends (bar 1.5.5 says waiting must not win), else __game.fail()
  const waitDeath = `(async () => {
    const H = window.__hard, G = window.__game; let t = 0;
    while (!H.dead() && t < 60000) { H.step(16); t += 16; }
    let forced = false;
    if (!H.dead() && typeof G.fail === 'function') { G.fail(); H.step(16); t += 16; forced = true; }
    return { t, dead: H.dead(), forced };
  })()`;

  const checks = [];
  const check = (id, fn) => { fn.bar = id; checks.push(fn); };

  // ---- 1.1.1 one tap anywhere starts, 1.3.1 audio unlock, 1.3.2 routing and peak, key prefix ----
  check(BAR.start, async () => {
    const { page, context, errors, ev } = await open({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, { wait: 1000 });
    try {
      const before = await ev(() => { const G = window.__game || {}; return { pf: window.__hard.pf.slice(), state: G.state, au: typeof G.audioState === 'function' ? G.audioState() : 'none' }; });
      const pt = await ev(() => {
        const c = window.__hard.canvas(); if (!c) return null;
        const r = c.getBoundingClientRect();
        for (const [fx, fy] of [[0.5, 0.45], [0.5, 0.55], [0.35, 0.5], [0.65, 0.6], [0.5, 0.35], [0.3, 0.7]]) {
          const x = r.left + r.width * fx, y = r.top + r.height * fy, el = document.elementFromPoint(x, y);
          if (el && !el.closest('button,a,[role=button],input')) return { x, y };
        }
        return null;
      });
      if (!pt) add('fail', 'one-tap-start', BAR.start, 'no point on the title screen that is not a button');
      else {
        await page.touchscreen.tap(pt.x, pt.y);
        let st = '';
        for (let i = 0; i < 10 && st !== 'play'; i++) { await sleep(100); st = await ev(() => (window.__game || {}).state); }
        add(st === 'play' ? 'pass' : 'fail', 'one-tap-start', BAR.start, st === 'play'
          ? `one tap on the title (not on a button, at ${Math.round(pt.x)},${Math.round(pt.y)}) starts the run`
          : `a tap on the title away from the buttons did not start the run (state "${st}")`);
        if (before.pf.length) add('fail', 'platform-load', BAR.platform, `Platform calls before any input: ${before.pf.join(' ')}`);
        let au = 'none';
        for (let i = 0; i < 15 && au !== 'running'; i++) { au = await ev(() => { const G = window.__game || {}; return typeof G.audioState === 'function' ? G.audioState() : (window.__hard.ctxs[0] || {}).state || 'none'; }); if (au !== 'running') await sleep(100); }
        const ctxState = await ev(() => window.__hard.ctxs.map(c => c.state).join(','));
        add(au === 'running' ? 'pass' : 'fail', 'audio-tap', BAR.unlock, `audio ${before.au} before the first tap, ${au} after it (mobile emulation, autoplay needs a gesture; contexts: ${ctxState || 'none'})`);
      }
      const ls = await ev(() => window.__hard.listeners.filter(l => l.who === 'window' || l.who === 'document'));
      const need = ['pointerup', 'touchend', 'click', 'keydown', 'mousedown'].filter(t => !ls.some(l => l.type === t && l.cap));
      const vis = ls.some(l => l.type === 'visibilitychange');
      const rc = /\.resume\(\)\s*(?:\.then\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)\s*)?\.catch\(/.test(code)
        || /\btry\s*\{[^}]{0,200}?\bawait\s+[\w$.]+\.resume\(\)[^}]{0,200}\}\s*catch\b/.test(code);
      add(!need.length && vis && rc ? 'pass' : 'fail', 'audio-unlock', BAR.unlock, !need.length && vis && rc
        ? 'unlock listeners on pointerup, touchend, click, keydown, mousedown (capture), resume on visibilitychange, resume().catch()'
        : `missing: ${[need.length ? `capture listeners on window/document for ${need.join(', ')}` : '', vis ? '' : 'a visibilitychange listener', rc ? '' : 'resume().catch(...)'].filter(Boolean).join('; ')}`);
      // a few taps on the play field fire sounds; then read what reached the speakers
      for (let i = 0; i < 10; i++) {
        const tp = await ev(() => { const G = window.__game || {}, t = typeof G.target === 'function' && G.target(); if (t) return t; const c = window.__hard.canvas(), r = c ? c.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight }; return { x: r.left + r.width / 2, y: r.top + r.height * 0.66 }; });
        const st = await ev(() => (window.__game || {}).state);
        if (st !== 'play') break;
        await page.touchscreen.tap(tp.x, tp.y); await sleep(160);
      }
      const g = await ev(() => ({ dest: window.__hard.dest.slice(), compIn: window.__hard.compIn.slice() }));
      const routeOk = g.dest.length > 0 && g.dest.every(n => n === 'DynamicsCompressorNode') && g.compIn.includes('GainNode');
      add(routeOk ? 'pass' : 'fail', 'audio-route', BAR.route, `connections to the speakers: [${g.dest.join(', ') || 'none'}]; into the compressor: [${[...new Set(g.compIn)].join(', ') || 'none'}] (need: only master gain -> compressor -> destination)`);
      if (has('peak')) {
        const peak = await ev(() => Promise.race([Promise.resolve(window.__game.peak(8)), new Promise(r => setTimeout(() => r(-1), 10000))]));
        add(peak >= 0 && peak < 1 ? 'pass' : 'fail', 'audio-peak', BAR.route, peak < 0 ? '__game.peak(8) did not finish in 10 s' : `8 SFX fired together peak at ${Number(peak).toFixed(3)} through the real bus (offline; need < 1.0)`);
      } else needs(['peak'], 'audio-peak', BAR.route);
      await readKeys(ev);
      if (errors.length) add('fail', 'audio-errors', BAR.unlock, `page errors during the audio check${errText(errors)}`);
    } finally { await context.close(); }
  });

  // ---- keyboard start, pause, no-input run, retry latency, Platform pairing (stepped clock) ----
  check(BAR.retry, async () => {
    if (!needs(['manual', 'tick', 'snap'], 'retry-latency', BAR.retry)) return;
    const { context, errors, ev } = await open({ viewport: { width: 1280, height: 720 } }, { wait: 1000 });
    try {
      const atLoad = await ev(() => window.__hard.pf.slice());
      const s = await ev(() => {
        const H = window.__hard, G = window.__game; H.manual();
        H.press(' ', 'Space'); H.step(16); H.step(16);
        const started = G.state;
        H.run(1000, 16);
        H.press('Escape', 'Escape'); H.step(16, true);
        const paused = G.state;
        H.run(300, 16);
        H.press('Escape', 'Escape'); H.step(16);
        return { started, paused, resumed: G.state };
      });
      add(s.started === 'play' ? 'pass' : 'fail', 'key-start', BAR.start, `Space on the title -> "${s.started}"`);
      const pauseOk = s.paused === 'paused' && s.resumed === 'play';
      const d = await ev(waitDeath);
      if (!d.dead) { add('fail', 'retry-latency', BAR.retry, `no game over after 60 s without input and no __game.fail() hook; cannot test retry`); return; }
      if (!d.forced) add(d.t >= 5000 ? 'pass' : 'warn', 'idle-run', BAR.idle, `with no input the run lasts ${(d.t / 1000 + 1.06).toFixed(1)} s (need at least 5 s)`);
      const r = await ev(() => {
        const H = window.__hard, G = window.__game; let t = 0, overAt = null, playAt = null;
        while (t < 5000) {
          H.press(' ', 'Space'); H.step(16); t += 16;
          const st = G.state;
          if (overAt == null && /^(over|gameover)$/.test(st)) overAt = t;
          if (st === 'play' && !(G.snap() || {}).dead) { playAt = t; break; }
        }
        return { overAt, playAt };
      });
      const lock = r.overAt != null ? r.playAt - r.overAt : r.playAt;
      const ok = r.playAt != null && r.playAt <= 1000 && lock >= 300;
      add(ok ? 'pass' : 'fail', 'retry-latency', BAR.retry, r.playAt == null ? 'holding Space after the game over never started a new run within 5 s'
        : `death -> playable ${r.playAt} ms with Space pressed every frame (need <= 1000), result screen at ${r.overAt ?? '-'} ms, lockout ${lock} ms (need >= 300)`);
      const pf = await ev(() => window.__hard.pf.slice());
      await readKeys(ev);
      let pairOk = atLoad.length === 0 && pf[0] === 'start', on = false;
      for (const c of pf) { if (c === 'start') { if (on) pairOk = false; on = true; } if (c === 'stop') { if (!on) pairOk = false; on = false; } }
      const overN = pf.filter(c => c === 'over').length;
      add(pairOk && overN >= 1 && pauseOk ? 'pass' : 'fail', 'platform-pair', BAR.platform, `on load [${atLoad.join(' ')}]; then ${pf.join(' ') || 'none'} (pause -> "${s.paused}", resume -> "${s.resumed}"; need start on input, never two starts without a stop, gameOver at the end)`);
      if (errors.length) add('fail', 'retry-errors', BAR.retry, `page errors${errText(errors)}`);
    } finally { await context.close(); }
  });
  {
    const raw = (code.match(/window\.Platform\s*\[/g) || []).length;
    const direct = (code.match(/Platform\s*\.\s*(?:gameplayStart|gameplayStop|happytime|gameOver)\s*\(/g) || []).length;
    add(raw >= 1 && direct === 0 ? 'pass' : 'fail', 'platform-helper', BAR.platform, `window.Platform[name] used ${raw} time(s) (inside platform()), ${direct} direct Platform.x() call(s) (need 0)`);
  }

  // ---- 1.2.1 input on pointerdown / keydown with a visible response on the next frame; touch-action ----
  check(BAR.input, async () => {
    const { page, context, errors, ev } = await open({ viewport: { width: 1280, height: 720 } }, { wait: 800 });
    try {
      const ta = await ev(() => { for (let e = window.__hard.canvas(); e; e = e.parentElement) if (getComputedStyle(e).touchAction === 'none') return e.tagName.toLowerCase() + (e.id ? '#' + e.id : ''); return null; });
      add(ta ? 'pass' : 'fail', 'touch-action', BAR.input, ta ? `canvas has touch-action: none (set on ${ta})` : 'neither the canvas nor its parents have touch-action: none');
      if (!needs(['manual', 'tick'], 'input-response', BAR.input)) return;
      const started = await ev(() => { const H = window.__hard; const ok = H.click('[data-qa=start]'); H.manual(); H.run(3000, 16); return ok && window.__game.state === 'play'; });
      if (!started) { add('fail', 'input-response', BAR.input, 'could not start a run through [data-qa=start]'); return; }
      const out = [];
      for (const how of ['pointer', 'key', 'pointer']) {
        if ((await ev(() => window.__game.state)) !== 'play') break;
        const tp = await ev(() => { const G = window.__game, t = typeof G.target === 'function' && G.target(); if (t) return t; const r = window.__hard.canvas().getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.66 }; });
        await page.mouse.move(tp.x, tp.y);
        const a = await ev(() => { const H = window.__hard; H.seed(7); H.step(0, true); window.__A = H.pixels(); H.seed(7); H.step(0, true); return H.diff(window.__A, H.pixels()); });
        if (how === 'pointer') await page.mouse.down(); else await page.keyboard.down('Space');
        const b = await ev(() => { const H = window.__hard; H.seed(7); H.step(0, true); return H.diff(window.__A, H.pixels()); });
        if (how === 'pointer') await page.mouse.up(); else await page.keyboard.up('Space');
        out.push({ how, stable: a === 0, changed: b });
        await ev(() => window.__hard.run(450, 16));
      }
      const unstable = out.filter(o => !o.stable).length, okN = out.filter(o => o.stable && o.changed > 3).length;
      const desc = out.map(o => `${o.how}down: ${o.stable ? o.changed + ' px changed' : 'render not repeatable'}`).join(', ');
      if (!out.length) add('fail', 'input-response', BAR.input, 'the run ended before the input test');
      else if (unstable === out.length) add('warn', 'input-response', BAR.input, `cannot tell: drawing the same frame twice gives different pixels (${desc})`);
      else add(okN === out.length - unstable ? 'pass' : 'fail', 'input-response', BAR.input, `a press alone (no release) changes the next drawn frame: ${desc}`);
      if (errors.length) add('fail', 'input-errors', BAR.input, `page errors${errText(errors)}`);
    } finally { await context.close(); }
  });

  // ---- 1.1.2 first payoff within 3 s; 1.10.2 frame-rate parity ----
  check(BAR.parity, async () => {
    if (!needs(['manual', 'tick', 'snap', 'demo'], 'fps-parity', BAR.parity)) return;
    const { page, context, errors, ev } = await open({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 }, { wait: 600 });
    try {
      // with __game.autoplay the game's own AI plays the human run; without it, plain taps at a few cadences (fresh page each)
      const firstPayoff = every => ev(every => {
        const H = window.__hard, G = window.__game, auto = typeof G.autoplay === 'function';
        if (!H.click('[data-qa=start]')) return { err: 'no [data-qa=start]' };
        H.manual(); if (auto) G.autoplay(true);
        let t = 0; const s0 = G.score;
        while (t < 6000 && G.score === s0 && !H.dead()) { if (!auto && t % every === 0) G.tap(); H.step(16); t += 16; }
        if (auto) G.autoplay(false);
        return { t, scored: G.score > s0, auto, every };
      }, every);
      let f = await firstPayoff(96);
      for (const every of [208, 400]) {
        if (f.err || f.auto || (f.scored && f.t <= 3000)) break;
        await page.reload({ waitUntil: 'load' }); await sleep(500);
        const g2 = await firstPayoff(every);
        if (g2.scored && (!f.scored || g2.t < f.t)) f = g2;
      }
      if (f.err) add('fail', 'first-payoff', BAR.first, f.err);
      else add(f.scored && f.t <= 3000 ? 'pass' : 'fail', 'first-payoff', BAR.first, f.scored
        ? `first score ${f.t} ms after the start tap (${f.auto ? 'game AI on the human run via __game.autoplay' : `no __game.autoplay; best of taps every 96, 208, 400 ms: every ${f.every} ms`}; need <= 3000)`
        : `no score within ${f.t} ms of the start tap${f.auto ? '' : ' (no __game.autoplay; taps every 96, 208 and 400 ms)'}`);
      const snaps = await ev(() => {
        const H = window.__hard, G = window.__game, out = [], take = () => { const s = G.snap() || {}; delete s.t; return JSON.stringify(s); };
        for (const hz of [144, 60, 30]) {
          G.demo(1234567); const N = Math.round(10 * hz);
          for (let i = 0; i < N; i++) H.step(10000 / N);
          out.push(take());
        }
        // the 60 Hz run sampled every 1 ms from 2 frames before to 2 frames after 10 s: a fixed-step game fed
        // other frame times may end one physics step apart, which still counts as the same run
        G.demo(1234567); const win = [];
        for (let i = 0; i < 598; i++) H.step(10000 / 600);
        for (let k = 0; k <= 68; k++) { win.push(take()); H.step(1); }
        return { at: out, win };
      });
      // bar 1.10.2: 144 Hz must match 60 Hz within a tolerance. Pass when the 144 Hz state equals the 60 Hz state at
      // some moment within 2 frames of 10 s, or when it differs from the 60 Hz state at 10 s only in numbers, each
      // within 2 or 2 %. 30 Hz is reported as a warning only.
      const near = (a, b) => b === a || snapDiff(a, b, 2, 0.02).length === 0;
      const ok144 = snaps.win.includes(snaps.at[0]) || near(snaps.at[1], snaps.at[0]);
      const ok30 = snaps.win.includes(snaps.at[2]) || near(snaps.at[1], snaps.at[2]);
      const d144 = snapDiff(snaps.at[1], snaps.at[0], 2, 0.02), d30 = snapDiff(snaps.at[1], snaps.at[2], 2, 0.02);
      const exact = snaps.at[0] === snaps.at[1] && snaps.at[1] === snaps.at[2];
      add(ok144 ? 'pass' : 'fail', 'fps-parity', BAR.parity, !ok144
        ? `demo seed 1234567 after 10 s differs between 144 and 60 Hz (not within 2 frames of time, not within 2 or 2 % per number): ${d144.slice(0, 6).join('; ')} | 60 Hz ${snaps.at[1].slice(0, 140)}`
        : `demo seed 1234567 after 10 s matches at 144 and 60 Hz${exact ? ' (identical, also at 30 Hz)' : ' within the tolerance'}: ${snaps.at[1].slice(0, 160)}`);
      if (ok144 && !ok30) add('warn', 'fps-parity-30', BAR.parity, `at 30 Hz the state after 10 s differs from 60 Hz: ${d30.slice(0, 6).join('; ')}`);
      if (errors.length) add('fail', 'parity-errors', BAR.parity, `page errors${errText(errors)}`);
    } finally { await context.close(); }
  });
  {
    const damp = code.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /\*=\s*0?\.\d/.test(l) && !/\bdt\b|delta|Math\.(?:exp|pow)/.test(l));
    add(damp.length ? 'fail' : 'pass', 'fps-damping', BAR.parity, damp.length ? `per-frame "*= 0.x" damping without dt on line(s) ${damp.map(d => d[0]).slice(0, 10).join(', ')}` : 'no per-frame "*= 0.x" damping without dt');
  }

  // ---- 1.9.1 demo rules + 1.10.4 flash rate (normal motion) ----
  // Steps ms of the stepped clock at 60 fps, drawing every frame, and measures the mean brightness.
  // An excursion is a jump of more than 8 % away from the last 3 frames, up or down. It is a flash when the
  // brightness comes back within 0.5 s (30 frames); a change that stays (a scene cut) is not a flash.
  // Also counts failures and restarts (snap().dead) and collects the drawn texts.
  const flashScan = `((ms) => {
    const H = window.__hard, G = window.__game, step = 1000 / 60, n = Math.round(ms / step), L = [];
    let events = [], flashes = [], open = null, since = 0, texts = new Set(), hasTexts = typeof G.texts === 'function';
    let deaths = 0, restarts = 0, was = !!(G.snap() || {}).dead;
    for (let i = 0; i < n; i++) {
      H.step(step, true);
      const l = H.luma(); L.push(l);
      if (open) {
        if (open.dir > 0 ? l <= open.base + 0.04 : l >= open.base - 0.04) { flashes.push(open.i); open = null; since = i; }
        else if (i - open.i > 30) { open = null; since = i; }
      } else if (L.length > 3 && i > since) {
        // compare only with frames after the last excursion ended, so the way back is not a second excursion
        const prev = L.slice(Math.max(since, L.length - 4), -1), lo = Math.min(...prev), hi = Math.max(...prev);
        if (l - lo > 0.08) { open = { i, dir: 1, base: lo }; events.push(i); }
        else if (hi - l > 0.08) { open = { i, dir: -1, base: hi }; events.push(i); }
      }
      const d = !!(G.snap() || {}).dead; if (d && !was) deaths++; if (!d && was) restarts++; was = d;
      if (hasTexts && i % 20 === 0) for (const s of G.texts()) texts.add(String(s));
    }
    const worst = a => { let w = 0; for (const e of a) w = Math.max(w, a.filter(f => f >= e && f < e + 60).length); return w; };
    return { frames: n, events: events.length, worst: worst(events), flashes: flashes.length, texts: [...texts], hasTexts, deaths, restarts };
  })`;
  check(BAR.demo, async () => {
    if (!needs(['manual', 'tick', 'snap'], 'demo', BAR.demo)) return;
    // a saved best (both common layouts), so a demo that wrongly shows BEST has something to show
    const seedSave = slug ? `try { localStorage.setItem(${JSON.stringify(slug + '-best')}, '999'); localStorage.setItem(${JSON.stringify(slug + '-save')}, '{"best":999,"runs":5}'); } catch (e) {}` : '';
    const { context, errors, ev } = await open({ viewport: { width: 405, height: 720 } }, { query: '?demo=1', init: [seedSave], wait: 800 });
    try {
      const r0 = await ev(() => { const H = window.__hard; let ls = null; try { ls = JSON.stringify(Object.entries(localStorage).sort()); } catch (e) {} return { btn: H.visibleButtons(), dom: H.domText().all, ls }; });
      await ev(() => window.__hard.manual());
      const fl = await ev(`(${flashScan})(30000)`);
      // keep going until the demo has failed and restarted at least once: at least 70 s in all, at most
      // 1.5 x session_length_sec + 15 s (a long demo run is allowed, bar 1.5.1), and never less than 70 s
      const capMs = Math.round(Math.max(70, 1.5 * (Number(meta.session_length_sec) || 45) + 15) * 1000);
      const r = await ev(([deaths0, restarts0, capMs]) => {
        const H = window.__hard, G = window.__game, states = new Set([G.state]); let deaths = deaths0, restarts = restarts0, was = !!(G.snap() || {}).dead, texts = new Set();
        const step = s => { const d = !!(G.snap() || {}).dead; if (d && !was) deaths++; if (!d && was) restarts++; was = d; states.add(G.state); };
        let t = 0;
        for (; t < capMs - 30000; t += 16) {
          if (t >= 40000 && deaths >= 1 && restarts >= 1) break;
          H.step(16, t % 480 === 0); step(); if (t % 480 === 0 && typeof G.texts === 'function') for (const s of G.texts()) texts.add(String(s));
        }
        let ls = null; try { ls = JSON.stringify(Object.entries(localStorage).sort()); } catch (e) {}
        return { btn: H.visibleButtons(), dom: H.domText().all, pf: H.pf.slice(), states: [...states], deaths, restarts, ls, texts: [...texts], sec: Math.round(30 + t / 1000) };
      }, [fl.deaths, fl.restarts, capMs]);
      const buttons = [...new Set([...r0.btn, ...r.btn])];
      add(buttons.length ? 'fail' : 'pass', 'demo-buttons', BAR.demo, buttons.length ? `visible buttons in ?demo=1: ${buttons.join(', ')}` : `no visible buttons in ?demo=1 (at load and after ${r.sec} s)`);
      add(r.pf.length ? 'fail' : 'pass', 'demo-platform', BAR.demo, `Platform calls in ${r.sec} s of ?demo=1: ${r.pf.length ? r.pf.join(' ') : 'none'}`);
      add(r.ls === r0.ls ? 'pass' : 'fail', 'demo-storage', BAR.demo, r.ls === r0.ls ? `localStorage unchanged by ${r.sec} s of ?demo=1` : 'localStorage changed during ?demo=1 (demo play must not save)');
      const loops = r.deaths >= 1 && r.restarts >= 1 && r.states.every(s => s === 'demo');
      add(loops ? 'pass' : 'fail', 'demo-loop', BAR.demo, `${r.sec} s of ?demo=1 (at most ${capMs / 1000} s): ${r.deaths} failure(s), ${r.restarts} restart(s), states [${r.states.join(', ')}] (need a failure, a restart and state "demo" throughout)`);
      const texts = [...fl.texts, ...r.texts, ...r0.dom, ...r.dom];
      // the game's own title (drawn as the demo label) may contain a BEST-like word; it is not a BEST display
      const esc = t => String(t || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const titleRe = new RegExp([meta.title_ja, meta.title_en].filter(Boolean).map(esc).join('|') || '(?!)', 'gi');
      const best = texts.filter(s => /\bbest\b|ベスト|最高/i.test(String(s).replace(titleRe, ' ')));
      if (fl.hasTexts || r0.dom.length) add(best.length ? 'fail' : 'pass', 'demo-best', BAR.demo, best.length ? `BEST is shown in ?demo=1: "${best[0]}"` : 'no BEST text drawn in ?demo=1');
      else add('warn', 'demo-best', BAR.demo, 'cannot read canvas text (no __game.texts()); the reviewer checks that BEST is hidden');
      const norm = s => String(s || '').toLowerCase().replace(/\s+/g, '');
      const hasJa = texts.some(s => norm(s).includes(norm(meta.title_ja))), hasEn = texts.some(s => norm(s).includes(norm(meta.title_en)));
      if (fl.hasTexts) add(hasJa && hasEn ? 'pass' : 'fail', 'demo-label', BAR.demo, `small bilingual title label in ?demo=1: ja "${meta.title_ja}" ${hasJa ? 'drawn' : 'missing'}, en "${meta.title_en}" ${hasEn ? 'drawn' : 'missing'}`);
      else add('warn', 'demo-label', BAR.demo, 'cannot read canvas text (no __game.texts()); the reviewer checks the bilingual title label');
      add(fl.worst <= 3 ? 'pass' : 'fail', 'flash-rate', BAR.flash, `${fl.frames} demo frames (30 s at 60 fps): ${fl.events} full-screen brightness jump(s) over 8 % (${fl.flashes} of them flashes that come back within 0.5 s), worst ${fl.worst} in any 1 s (need <= 3)`);
      if (errors.length) add('fail', 'demo-errors', BAR.demo, `page errors${errText(errors)}`);
    } finally { await context.close(); }
  });

  // ---- 1.10.4 under prefers-reduced-motion ----
  check(BAR.flash, async () => {
    if (!needs(['manual', 'tick'], 'flash-reduced', BAR.flash)) return;
    const { context, errors, ev } = await open({ viewport: { width: 405, height: 720 }, reducedMotion: 'reduce' }, { query: '?demo=1', wait: 600 });
    try {
      await ev(() => window.__hard.manual());
      const fl = await ev(`(${flashScan})(26000)`);
      const reduce = await ev(() => { const v = typeof window.__game.view === 'function' ? window.__game.view() : null; return v && 'reduce' in v ? !!v.reduce : null; });
      add(fl.flashes === 0 && reduce !== false ? 'pass' : 'fail', 'flash-reduced', BAR.flash, `prefers-reduced-motion: ${fl.flashes} full-screen flash(es) (a jump over 8 % that comes back within 0.5 s) in ${fl.frames} frames (need 0; scene cuts that stay are not flashes, ${fl.events - fl.flashes} seen); view().reduce = ${reduce}`);
      if (errors.length) add('fail', 'reduced-errors', BAR.flash, `page errors${errText(errors)}`);
    } finally { await context.close(); }
  });

  // ---- 1.4.4 text size at 360x640 and 800x450, DPR 1 ----
  for (const [vw, vh, need] of [[360, 640, 13], [800, 450, 12]]) {
    check(BAR.text, async () => {
      const name = `text-${vw}x${vh}`;
      if (!needs(['manual', 'tick'], name, BAR.text)) return;
      const { context, errors, ev } = await open({ viewport: { width: vw, height: vh } }, { wait: 600 });
      try {
        const r = await ev(async () => {
          const H = window.__hard, G = window.__game, dom = [], screens = [];
          const look = n => { const d = H.domText(); dom.push(d); screens.push(n); };
          H.manual(); H.run(200, 16, true); look('title');
          H.click('[data-qa=start]'); H.run(3000, 16, true); look('play');
          H.press('Escape', 'Escape'); H.run(300, 16, true); look('pause'); H.press('Escape', 'Escape'); H.step(16);
          let t = 0; while (!H.dead() && t < 60000) { H.step(16, t % 160 === 0); t += 16; }
          if (!H.dead() && typeof G.fail === 'function') G.fail();
          for (let i = 0; i < 160; i++) H.step(16, true);
          look('result');
          const v = typeof G.view === 'function' ? G.view() : null;
          let domMin = Infinity, domWho = '';
          dom.forEach((d, i) => { if (d.min < domMin) { domMin = d.min; domWho = `${screens[i]}: "${d.who}"`; } });
          return { v, domMin, domWho, fillMin: H.fillMin, fillWho: H.fillWho, state: G.state };
        });
        await readKeys(ev);
        const parts = [];
        let min = Infinity;
        if (r.v && r.v.K && r.v.dpr) {
          const kitFloor = /==== PIXEL KIT START ====/.test(src) ? 5 / 0.7 : null;
          const em = r.v.textMin != null && Number.isFinite(r.v.textMin) ? r.v.textMin : kitFloor;
          if (em != null) { const css = em * r.v.K / r.v.dpr; min = Math.min(min, css); parts.push(`pixel text ${css.toFixed(1)} px (${r.v.textMin != null ? 'smallest drawn' : 'kit floor'} ${em.toFixed(1)} buffer px x ${r.v.K}/${r.v.dpr})`); }
        }
        if (Number.isFinite(r.fillMin)) { min = Math.min(min, r.fillMin); parts.push(`canvas fillText ${r.fillMin.toFixed(1)} px ("${r.fillWho}")`); }
        if (Number.isFinite(r.domMin)) { min = Math.min(min, r.domMin); parts.push(`DOM ${r.domMin.toFixed(1)} px (${r.domWho})`); }
        if (!parts.length) add('warn', name, BAR.text, 'no text size found (no view() hook, no fillText, no visible DOM text)');
        else add(min >= need ? 'pass' : 'fail', name, BAR.text, `smallest text on title, play, pause and result: ${min.toFixed(1)} CSS px (need ${need}): ${parts.join('; ')}`);
        if (errors.length) add('fail', `${name}-errors`, BAR.text, `page errors${errText(errors)}`);
      } finally { await context.close(); }
    });
  }

  // ---- 1.6.5 the whole loop works when localStorage throws ----
  check(BAR.storage, async () => {
    if (!needs(['manual', 'tick'], 'storage-throws', BAR.storage)) return;
    const { context, errors, ev } = await open({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 }, { init: [STORAGE_THROWS], wait: 600 });
    try {
      const started = await ev(() => { const H = window.__hard; const ok = H.click('[data-qa=start]'); H.manual(); H.step(16); return ok && window.__game.state; });
      const d = await ev(waitDeath);
      const r = await ev(() => {
        const H = window.__hard, G = window.__game; H.run(2500, 16, true);
        const over = G.state; H.click('[data-qa=retry]'); H.step(16); return { over, after: G.state };
      });
      const ok = started === 'play' && d.dead && /^(over|gameover)$/.test(r.over) && r.after === 'play' && !errors.length;
      add(ok ? 'pass' : 'fail', 'storage-throws', BAR.storage, `with localStorage throwing: start -> ${started}, game over ${d.dead ? 'reached' : 'not reached'} -> ${r.over}, retry -> ${r.after}${errText(errors)}`);
    } finally { await context.close(); }
  });

  // run the checks a few at a time (they are CPU-bound; CI has 2 to 4 cores)
  const queue = checks.slice();
  async function worker() {
    while (queue.length) {
      const fn = queue.shift();
      try { await Promise.race([fn(), sleep(120000).then(() => { throw new Error('timed out after 120 s'); })]); }
      catch (e) { add('fail', 'crash', fn.bar || BAR.hooks, `a hard check crashed: ${String(e.message || e).split('\n')[0]}`); }
    }
  }
  await Promise.all(Array.from({ length: parallel }, worker));
  if (slug) {
    // keys seen after taps on the title, after a game over and retry, after the result screens and after ?demo=1
    const keys = [...storageKeys].sort(), bad = keys.filter(k => !k.startsWith(slug + '-'));
    add(bad.length ? 'fail' : 'pass', 'storage-keys', BAR.storage, bad.length ? `localStorage keys without the "${slug}-" prefix: ${bad.join(', ')}` : `localStorage keys use the "${slug}-" prefix (${keys.length ? keys.join(', ') : 'none written'}; read after play, game over, retry and the result screen)`);
  }
  add('info', 'covered', '1.10.1', 'the functional checks above (file, network, errors, start/play/over/retry, pause, language, demo) are bar item 1.10.1');
  const order = Object.values(BAR);
  const idOf = r => (/^\[([^\]]+)\]/.exec(r.msg) || [])[1] || '';
  const rank = r => { const i = order.indexOf(idOf(r)); return i < 0 ? 99 : i; };
  return results.sort((a, b) => rank(a) - rank(b));
}
