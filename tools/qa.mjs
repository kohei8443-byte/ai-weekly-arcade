#!/usr/bin/env node
// QA for one game folder.
//   node tools/qa.mjs games/w01-orbit-hopper [--json] [--shots qa-shots/w01] [--play-sec 30] [--extra-sec N] [--demo-sec 20]
// Static checks (single file, doctype, size, external loads, [hidden] rule, meta.json), then a headless
// run on a 390x780 touch phone and a 1280x720 desktop: no page errors, canvas not blank,
// title -> start -> random play (30 s; then long press/drag "stress" input up to the game's session length
// if it is still running) -> game over -> retry, and ?demo=1 running on its own.
// Exit code: 0 = pass (warnings allowed), 1 = at least one failure, 2 = usage error.
import fs from 'node:fs';
import path from 'node:path';
import { staticCheck } from './lib/static-check.mjs';
import { PROBE } from './lib/probe.mjs';
import { launchBrowser, startServer, createImageAnalyzer, parseArgs, sleep } from './lib/common.mjs';

const USAGE = 'usage: node tools/qa.mjs <gameDir> [--json] [--shots <dir>] [--play-sec 30] [--extra-sec N] [--demo-sec 20] [--static-only]';

const PROFILES = [
  { name: 'phone', viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: 'desktop', viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false }
];

// Small seeded RNG so a failing run can be reproduced.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Canvas pixels read directly (2D canvases); WebGL canvases without preserveDrawingBuffer read back
// as transparent, so then fall back to a screenshot with every DOM element except canvases hidden.
async function canvasStats(page, probe, analyzer) {
  const st = await probe('canvasStats');
  if (st && st.transparent < 1) return st;
  await probe('isolateCanvas', true);
  try {
    const clip = await probe('canvas');
    if (!clip) return st;
    const s2 = await analyzer.stats(await page.screenshot({ clip }));
    return { ...s2, via: 'screenshot' };
  } finally {
    await probe('isolateCanvas', false);
  }
}

async function runProfile(browser, origin, profile, analyzer, opts) {
  const results = [];
  const add = (level, check, msg) => results.push({ level, check: `${profile.name}:${check}`, msg });
  const { name, ...ctxOpts } = profile;
  const context = await browser.newContext({ ...ctxOpts, locale: 'ja-JP', reducedMotion: 'no-preference' });
  await context.addInitScript(PROBE);
  const external = [];
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(origin) || /^(data|blob|about):/.test(url)) return route.continue();
    external.push(url);
    return route.abort();
  });
  const errors = [], consoleErrors = [];
  let phase = 'load';
  const watch = page => {
    page.on('pageerror', e => errors.push(`[${phase}] ${String(e.message || e).split('\n')[0]}`));
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(`[${phase}] ${m.text().slice(0, 200)}`); });
  };
  const shot = async (page, label, clip) => {
    const buf = await page.screenshot(clip ? { clip } : {});
    if (opts.shots) fs.writeFileSync(path.join(opts.shots, `${profile.name}-${label}.png`), buf);
    return buf;
  };
  const rand = rng(profile.name === 'phone' ? 1234 : 5678);

  const page = await context.newPage();
  watch(page);
  const cdp = profile.hasTouch ? await context.newCDPSession(page) : null;
  const tap = async p => {
    if (profile.hasTouch) await page.touchscreen.tap(p.x, p.y);
    else await page.mouse.click(p.x, p.y);
  };
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x, y })) });
  const probe = (fn, ...a) => page.evaluate(([f, args]) => window.__qa[f](...args), [fn, a]);

  // Long press-and-drag plus held keys: ends games that random taps cannot (timers, wear-out mechanics).
  async function stressAction() {
    let p = null;
    for (let k = 0; k < 6 && !p; k++) p = await probe('safePoint', 0.25 + rand() * 0.5, 0.3 + rand() * 0.5);
    if (!p) p = { x: profile.viewport.width / 2, y: profile.viewport.height / 2 };
    const steps = 30 + Math.floor(rand() * 40), radius = 40 + rand() * 80;
    if (profile.hasTouch) await touch('touchStart', [[p.x, p.y]]);
    else { await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.keyboard.down('Space'); }
    for (let i = 0; i < steps; i++) {
      const a = i / 5, x = p.x + Math.cos(a) * radius, y = p.y + Math.sin(a) * radius;
      if (profile.hasTouch) await touch('touchMove', [[x, y]]); else await page.mouse.move(x, y);
      await sleep(40);
    }
    if (profile.hasTouch) await touch('touchEnd', []);
    else { await page.keyboard.up('Space'); await page.mouse.up(); }
    await sleep(100 + rand() * 200);
  }

  async function randomAction() {
    let p = null;
    for (let k = 0; k < 6 && !p; k++) p = await probe('safePoint', 0.12 + rand() * 0.76, 0.2 + rand() * 0.72);
    const r = rand();
    if (profile.hasTouch) {
      if (!p || r < 0.6) { if (p) await tap(p); }
      else if (r < 0.85) {
        const dx = (rand() - 0.5) * 220, dy = (rand() - 0.5) * 220;
        await touch('touchStart', [[p.x, p.y]]);
        for (let i = 1; i <= 5; i++) { await sleep(16); await touch('touchMove', [[p.x + dx * i / 5, p.y + dy * i / 5]]); }
        await touch('touchEnd', []);
      } else {
        await touch('touchStart', [[p.x, p.y]]);
        await sleep(250 + rand() * 500);
        await touch('touchEnd', []);
      }
    } else {
      const keys = ['Space', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
      const key = keys[Math.floor(rand() * keys.length)];
      if (r < 0.3 && p) await tap(p);
      else if (r < 0.45 && p) {
        await page.mouse.move(p.x, p.y); await page.mouse.down();
        await page.mouse.move(p.x + (rand() - 0.5) * 300, p.y + (rand() - 0.5) * 200, { steps: 6 });
        await page.mouse.up();
      } else if (r < 0.85) await page.keyboard.press(key);
      else { await page.keyboard.down(key); await sleep(200 + rand() * 600); await page.keyboard.up(key); }
    }
    await sleep(120 + rand() * 330);
  }

  try {
    // ---------- title ----------
    await page.goto(`${origin}/index.html`, { waitUntil: 'load' });
    await sleep(1200);
    const titleShot = await shot(page, '1-title');
    const tstats = await analyzer.stats(titleShot);
    if (tstats.distinct < 3 || tstats.dominant > 0.995) add('fail', 'title', `title screen looks blank (${tstats.distinct} colours, ${(tstats.dominant * 100).toFixed(1)}% one colour)`);
    const hs = await probe('hScroll');
    if (hs > 1) add('warn', 'layout', `page scrolls horizontally by ${hs}px`);
    const canvasRect = await probe('canvas');
    if (!canvasRect) add('fail', 'canvas', 'no visible <canvas> found');

    // language toggle (desktop only; it is the same code on phones)
    if (!profile.hasTouch) {
      const lp = await probe('lang');
      if (!lp) add('warn', 'lang', 'no language toggle button found (expected [data-qa=lang], #lang or a button labelled EN/JA)');
      else {
        const before = await probe('text');
        const htmlLang = await page.evaluate(() => document.documentElement.lang);
        phase = 'lang';
        await tap(lp); await sleep(300);
        const after = await probe('text');
        const htmlLang2 = await page.evaluate(() => document.documentElement.lang);
        if (after === before && htmlLang === htmlLang2) add('fail', 'lang', `clicking "${lp.label}" did not change any text`);
        else add('pass', 'lang', `language toggle "${lp.label}" switches text (${htmlLang || '?'} -> ${htmlLang2 || '?'})`);
        if (opts.shots) await shot(page, '1b-title-lang');
        const lp2 = await probe('lang');
        if (lp2) { await tap(lp2); await sleep(200); }
      }
    }

    // ---------- start ----------
    phase = 'start';
    const log0 = await page.evaluate(() => ({ ...window.__qa.log }));
    const sp = await probe('start');
    if (!sp) add('fail', 'start', 'no start button found on the title screen (add data-qa="start")');
    else {
      await tap(sp);
      await sleep(800);
      const still = await probe('start');
      const log1 = await page.evaluate(() => ({ ...window.__qa.log }));
      const started = log1.gameplayStart > log0.gameplayStart || !still || (still && Math.abs(still.y - sp.y) > 2 && still.label !== sp.label);
      if (!started) add('fail', 'start', `tapping "${sp.label}" did not start the game (button still visible, no Platform.gameplayStart)`);
      else add('pass', 'start', `"${sp.label}" starts the game`);
      if (log1.gameplayStart === log0.gameplayStart) add('warn', 'platform', 'Platform.gameplayStart() was not called on start');
    }

    // ---------- play ----------
    phase = 'play';
    const playShot = canvasRect ? await shot(page, '2-play', await probe('canvas') || undefined) : null;
    if (canvasRect) {
      const st = await canvasStats(page, probe, analyzer);
      if (!st || st.distinct < 3 || st.dominant > 0.995) add('fail', 'canvas', `canvas looks blank during play (${st ? `${st.distinct} colours, ${(st.dominant * 100).toFixed(1)}% one colour` : 'unreadable'})`);
      else add('pass', 'canvas', `canvas renders (${st.distinct} colours, largest ${(st.dominant * 100).toFixed(0)}%${st.via ? `, ${st.via}` : ''})`);
    }
    // pause / resume (desktop only)
    if (!profile.hasTouch) {
      const pp = await probe('pause');
      if (!pp) add('warn', 'pause', 'no pause button found (expected [data-qa=pause] or #pauseBtn)');
      else {
        phase = 'pause';
        await tap(pp); await sleep(300);
        const rp = await probe('resume');
        if (!rp) add('warn', 'pause', `pause button "${pp.label}" did not show a resume button`);
        else { await tap(rp); await sleep(300); add('pass', 'pause', 'pause and resume buttons work'); }
        phase = 'play';
      }
    }
    const goBefore = (await page.evaluate(() => window.__qa.log.gameOver));
    const t0 = Date.now();
    let over = false, laterShot = null, actions = 0, stressed = false;
    // phase 1: random input for playSec; phase 2 (only if still alive): stress input for extraSec more
    while (Date.now() - t0 < (opts.playSec + opts.extraSec) * 1000) {
      const st = await page.evaluate(() => ({ retry: !!window.__qa.retry(), go: window.__qa.log.gameOver, resume: window.__qa.resume(), state: window.__qa.state() }));
      if (st.retry || st.go > goBefore || st.state === 'over' || st.state === 'gameover') { over = true; break; }
      if (st.resume) { await tap(st.resume); await sleep(200); continue; }
      if (errors.length >= 20) break; // the game keeps throwing; no point playing on
      if (!laterShot && Date.now() - t0 > 2500 && canvasRect) laterShot = await shot(page, '3-later', await probe('canvas') || undefined);
      if (Date.now() - t0 < opts.playSec * 1000) await randomAction();
      else { stressed = true; await stressAction(); }
      actions++;
    }
    const playSecs = ((Date.now() - t0) / 1000).toFixed(1);
    if (playShot && laterShot) {
      const d = await analyzer.diff(playShot, laterShot);
      if (d < 0.002) add('warn', 'canvas', 'canvas did not change between 0.8 s and 2.5 s of play');
    }

    // ---------- game over -> retry ----------
    if (!over) {
      add('warn', 'gameover', `no game over after ${playSecs} s of random and stress input (${actions} actions); retry was not tested`);
    } else {
      phase = 'gameover';
      await sleep(700);
      await shot(page, '4-over');
      const logOver = await page.evaluate(() => ({ ...window.__qa.log }));
      add('pass', 'gameover', `game over reached after ${playSecs} s (${actions} actions${stressed ? `; random input alone did not end the game in ${opts.playSec} s, long press/drag did` : ''}), score ${await probe('score') ?? '?'}`);
      if (logOver.gameOver === goBefore) add('warn', 'platform', 'Platform.gameOver(score) was not called at game over');
      let rp = null;
      for (let k = 0; k < 15 && !rp; k++) { rp = await probe('retry'); if (!rp) await sleep(200); }
      if (!rp) rp = await probe('start');
      if (!rp) add('fail', 'retry', 'game over, but no retry button found (add data-qa="retry")');
      else {
        phase = 'retry';
        // games often ignore retry taps for a few hundred ms after the game over screen appears (to avoid accidental restarts)
        await sleep(600);
        rp = (await probe('retry')) || rp;
        await tap(rp);
        await sleep(900);
        const after = await page.evaluate(() => ({ retry: window.__qa.retry(), log: { ...window.__qa.log }, score: window.__qa.score() }));
        const ok = !after.retry && (after.log.gameplayStart > logOver.gameplayStart || after.score === 0 || after.score === null);
        if (!ok) add('fail', 'retry', `tapping "${rp.label}" did not restart the game`);
        else {
          const a = canvasRect ? await shot(page, '5-retry', await probe('canvas') || undefined) : null;
          for (let k = 0; k < 6; k++) await randomAction();
          const b = canvasRect ? await page.screenshot({ clip: await probe('canvas') || undefined }) : null;
          const moved = a && b ? await analyzer.diff(a, b) : 1;
          if (moved < 0.002) add('warn', 'retry', 'canvas did not change after retry');
          add('pass', 'retry', `"${rp.label}" restarts the game`);
        }
      }
    }
    await page.close();

    // ---------- ?demo=1 ----------
    phase = 'demo';
    const demo = await context.newPage();
    watch(demo);
    await demo.goto(`${origin}/index.html?demo=1`, { waitUntil: 'load' });
    await sleep(1000);
    const dprobe = (fn, ...a) => demo.evaluate(([f, args]) => window.__qa[f](...args), [fn, a]);
    const clip = await dprobe('canvas') || undefined;
    const first = await demo.screenshot({ clip });
    if (opts.shots) fs.writeFileSync(path.join(opts.shots, `${profile.name}-6-demo.png`), first);
    const s0 = await dprobe('score');
    let maxDiff = 0, scoreChanged = false, prev = first;
    const steps = Math.max(1, Math.round(opts.demoSec / 5));
    for (let i = 0; i < steps; i++) {
      await sleep(opts.demoSec * 1000 / steps);
      const cur = await demo.screenshot({ clip });
      maxDiff = Math.max(maxDiff, await analyzer.diff(prev, cur), await analyzer.diff(first, cur));
      prev = cur;
      const s = await dprobe('score');
      if (s !== null && s !== s0) scoreChanged = true;
    }
    if (opts.shots) fs.writeFileSync(path.join(opts.shots, `${profile.name}-7-demo-end.png`), prev);
    const dstat = await canvasStats(demo, dprobe, analyzer) || { distinct: 0, dominant: 1 };
    const dlog = await demo.evaluate(() => ({ ...window.__qa.log }));
    const demoErrors = errors.filter(e => e.startsWith('[demo]'));
    if (dstat.distinct < 3 || dstat.dominant > 0.995) add('fail', 'demo', '?demo=1 canvas looks blank');
    else if (!scoreChanged && maxDiff < 0.003) add('fail', 'demo', `?demo=1 ran ${opts.demoSec} s but neither the score nor the canvas changed`);
    else if (!demoErrors.length) add('pass', 'demo', `?demo=1 plays by itself for ${opts.demoSec} s (score ${scoreChanged ? 'changed' : 'unchanged'}, canvas ${(maxDiff * 100).toFixed(0)}% changed)`);
    if (await dprobe('start')) add('fail', 'demo', '?demo=1 still shows the title screen / start button (demo mode must hide overlays and play by itself)');
    if (await dprobe('retry')) add('warn', 'demo', '?demo=1 is stuck on a game over screen (demo should restart by itself)');
    if (dlog.gameplayStart || dlog.gameOver) add('warn', 'demo', '?demo=1 calls Platform.gameplayStart/gameOver (demo play should not report to portals)');
    await demo.close();
  } catch (e) {
    add('fail', 'run', `QA run crashed in phase "${phase}": ${e.message.split('\n')[0]}`);
  } finally {
    await context.close();
  }

  if (errors.length) add('fail', 'errors', `${errors.length} page error(s): ${[...new Set(errors)].slice(0, 5).join(' | ')}`);
  else add('pass', 'errors', 'no page errors');
  if (consoleErrors.length) add('fail', 'console', `${consoleErrors.length} console error(s): ${[...new Set(consoleErrors)].slice(0, 3).join(' | ')}`);
  if (external.length) add('fail', 'network', `blocked ${external.length} external request(s): ${[...new Set(external)].slice(0, 5).join(', ')}`);
  else add('pass', 'network', 'no external requests at runtime');
  return results;
}

function printReport(gameDir, results, secs) {
  const icon = { pass: 'PASS', warn: 'WARN', fail: 'FAIL', info: 'info' };
  const groups = new Map();
  for (const r of results) {
    const g = r.check.includes(':') ? r.check.split(':')[0] : 'static';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(r);
  }
  const out = [`QA report: ${gameDir}`, ''];
  const titles = { static: 'Static checks', phone: 'Phone 390x780 (touch)', desktop: 'Desktop 1280x720' };
  for (const [g, rs] of groups) {
    out.push(`== ${titles[g] || g}`);
    for (const r of rs) out.push(`  ${icon[r.level].padEnd(4)}  ${r.check.replace(/^\w+:/, '').padEnd(12)} ${r.msg}`);
    out.push('');
  }
  const fails = results.filter(r => r.level === 'fail').length, warns = results.filter(r => r.level === 'warn').length;
  out.push(fails ? `RESULT: FAILED (${fails} failure(s), ${warns} warning(s)) in ${secs} s` : `RESULT: PASSED (${warns} warning(s)) in ${secs} s`);
  console.log(out.join('\n'));
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2), { json: 'bool', shots: 'string', 'play-sec': 'string', 'extra-sec': 'string', 'demo-sec': 'string', 'static-only': 'bool', help: 'bool' });
  } catch (e) { console.error(e.message); console.error(USAGE); process.exit(2); }
  if (args.help || args._.length !== 1) { console.error(USAGE); process.exit(args.help ? 0 : 2); }
  const gameDir = args._[0];
  if (!fs.existsSync(gameDir) || !fs.statSync(gameDir).isDirectory()) { console.error(`not a folder: ${gameDir}`); process.exit(2); }
  const opts = {
    shots: args.shots || null,
    playSec: Number(args['play-sec'] || 30),
    demoSec: Number(args['demo-sec'] || 20),
    extraSec: 0
  };
  // stress phase length: the game's own session length (meta.json), 20..90 s
  {
    let len = 60;
    try { len = Number(JSON.parse(fs.readFileSync(path.join(gameDir, 'meta.json'), 'utf8')).session_length_sec) || 60; } catch (e) { /* meta errors are reported by the static checks */ }
    opts.extraSec = args['extra-sec'] != null ? Number(args['extra-sec']) : Math.min(90, Math.max(20, len));
  }
  if (opts.shots) fs.mkdirSync(opts.shots, { recursive: true });
  const t0 = Date.now();
  const results = staticCheck(gameDir);

  if (!args['static-only'] && fs.existsSync(path.join(gameDir, 'index.html'))) {
    const server = await startServer(gameDir);
    let browser;
    try {
      browser = await launchBrowser();
      const analyzer = await createImageAnalyzer(browser);
      const per = await Promise.all(PROFILES.map(p => runProfile(browser, server.origin, p, analyzer, opts)));
      for (const r of per) results.push(...r);
      await analyzer.close();
    } catch (e) {
      results.push({ level: 'fail', check: 'browser:launch', msg: e.message.split('\n')[0] });
    } finally {
      if (browser) await browser.close();
      await server.close();
    }
  }

  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  const failed = results.some(r => r.level === 'fail');
  if (args.json) console.log(JSON.stringify({ gameDir, passed: !failed, seconds: Number(secs), results }, null, 2));
  else printReport(gameDir, results, secs);
  process.exit(failed ? 1 : 0);
}

main();
