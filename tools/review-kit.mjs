#!/usr/bin/env node
// Inputs for the reviewer panel (QUALITY_BAR.md section 2.2): frames, contact sheets and play logs of one game.
//   node tools/review-kit.mjs games/wNN-<slug> <outDir> [--seed 12345] [--tapper-sec 60]
//   npm run review-kit -- games/wNN-<slug> <outDir>
// Writes, for each of the phone (390x780) and CrazyGames-size (800x450) views:
//   <view>/title.png                  the title screen after 1.5 s
//   <view>/demo/demo-SS.ss.png        ?demo=1 at 4 fps for 0-10 s, then 2 fps to 30 s
//   <view>/play/NN-<what>.png         the naive tapper's run: early frames, the failure, the result screen
//   <view>/contact-demo.png, <view>/contact-play.png   one image per strip, labelled with times
// and at the top level:
//   naive-tapper.json   every tap and what followed (state, score), per view
//   demo-run.json       the demo timeline: score changes, failures, restarts, by run time
//   summary.json        hooks found, run lengths, first score, failure times, files, page errors, and
//                       "autoplay": 10 runs of the game's AI with human-like error (__game.autoplay), bar 1.5.1
// Works on any game: with the window.__game hooks of tools/README.md the demo is stepped
// (deterministic for --seed); without them it is recorded in real time and some fields are null.
import fs from 'node:fs';
import path from 'node:path';
import { PROBE } from './lib/probe.mjs';
import { launchBrowser, startServer, readMeta, parseArgs, sleep } from './lib/common.mjs';

const USAGE = 'usage: node tools/review-kit.mjs <gameDir> <outDir> [--seed 12345] [--tapper-sec 60]';
const VIEWS = [
  { name: '390x780', viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, thumb: 130, cols: 8 },
  { name: '800x450', viewport: { width: 800, height: 450 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false, thumb: 200, cols: 6 }
];
const DEMO_TIMES = [...Array.from({ length: 40 }, (_, i) => (i + 1) * 0.25), ...Array.from({ length: 40 }, (_, i) => 10.5 + i * 0.5)];

// Seeded RNG for the tapper, so a kit can be rebuilt the same way.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const gaussOf = r => () => Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r());

async function newPage(browser, origin, view, query, errors) {
  const { name, thumb, cols, ...opts } = view;
  const context = await browser.newContext({ ...opts, locale: 'ja-JP' });
  await context.route('**/*', r => (r.request().url().startsWith(origin) || /^(data|blob|about):/.test(r.request().url()) ? r.continue() : r.abort()));
  await context.addInitScript(PROBE);
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(`[${name}${query}] ${String(e.message || e).split('\n')[0]}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`[${name}${query}] ${m.text().slice(0, 160)}`); });
  await page.goto(`${origin}/index.html${query}`, { waitUntil: 'load' });
  return { page, context };
}

// Reads whatever the game offers; every field may be null on games without hooks.
const READ = () => {
  const G = window.__game, Q = window.__qa;
  let snap = null; try { snap = G && typeof G.snap === 'function' ? G.snap() : null; } catch (e) { snap = null; }
  return {
    state: (G && typeof G.state === 'string') ? G.state : (Q ? Q.state() : null),
    score: (G && typeof G.score === 'number') ? G.score : (Q ? Q.score() : null),
    dead: snap ? !!snap.dead : null,
    retry: Q ? !!Q.retry() : false
  };
};

async function contactSheet(browser, files, labels, thumbW, cols, out, title) {
  if (!files.length) return null;
  const imgs = files.map((f, i) => `<figure><img src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}"><figcaption>${labels[i]}</figcaption></figure>`).join('');
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#1d1d24;color:#eee;font:12px system-ui,sans-serif}
    h1{font-size:14px;margin:8px 10px} .g{display:grid;grid-template-columns:repeat(${cols},${thumbW}px);gap:6px;padding:0 10px 10px}
    figure{margin:0} img{width:${thumbW}px;display:block;image-rendering:auto} figcaption{text-align:center;padding:2px 0}
  </style><h1>${title}</h1><div class="g">${imgs}</div>`;
  const ctx = await browser.newContext({ viewport: { width: cols * (thumbW + 6) + 20, height: 400 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.setContent(html, { waitUntil: 'load' });
  await p.screenshot({ path: out, fullPage: true });
  await ctx.close();
  return out;
}

// ?demo=1 frames and (phone view only) the demo timeline log.
async function demoPass(browser, origin, view, dir, seed, errors, withLog) {
  const { page, context } = await newPage(browser, origin, view, '?demo=1', errors);
  const files = [], labels = [];
  const fmt = t => t.toFixed(2).padStart(5, '0');
  let log = null;
  try {
    await sleep(600);
    const stepped = await page.evaluate(() => { const G = window.__game; return !!(G && ['manual', 'tick', 'demo'].every(k => typeof G[k] === 'function')); });
    if (stepped) {
      await page.evaluate(seed => { const G = window.__game; G.manual(true); G.demo(seed); }, seed);
      let cur = 0;
      for (const t of DEMO_TIMES) {
        await page.evaluate(ms => { const G = window.__game, n = Math.max(1, Math.round(ms / (1000 / 60))); for (let i = 0; i < n; i++) G.tick(ms / n, i === n - 1); }, (t - cur) * 1000);
        cur = t;
        const f = path.join(dir, `demo-${fmt(t)}.png`); await page.screenshot({ path: f }); files.push(f); labels.push(`${t.toFixed(2)} s`);
      }
      if (withLog) {
        // a fresh demo run with the same seed, sampled every 100 ms of game time for 60 s
        log = await page.evaluate(([seed, readSrc]) => {
          const G = window.__game, R = (0, eval)('(' + readSrc + ')');
          G.demo(seed); const ev = []; let prev = R(), lastSnap = null;
          ev.push({ t: 0, event: 'start', ...prev });
          for (let i = 1; i <= 600; i++) {
            for (let k = 0; k < 6; k++) G.tick(100 / 6, false);
            const s = R(), t = +(i / 10).toFixed(1);
            let snap = null; try { snap = typeof G.snap === 'function' ? G.snap() : null; } catch (e) { snap = null; }
            if (s.score !== prev.score && s.score < prev.score) ev.push({ t, event: 'restart', ...s });
            else if (s.score !== prev.score) ev.push({ t, event: 'score', ...s });
            if (s.dead && !prev.dead) ev.push({ t, event: 'failure', ...s, snap });
            if (s.state !== prev.state) ev.push({ t, event: 'state', ...s });
            prev = s; lastSnap = snap;
          }
          return { stepped: true, seed, events: ev, last: lastSnap };
        }, [seed, READ.toString()]);
      }
    } else {
      // no stepped clock: real-time screenshots on a wall-clock schedule, and a sampled log
      const t0 = Date.now(), ev = []; let prev = await page.evaluate(READ);
      ev.push({ t: 0, event: 'start', ...prev });
      for (const t of DEMO_TIMES) {
        const w = t * 1000 - (Date.now() - t0); if (w > 0) await sleep(w);
        const f = path.join(dir, `demo-${fmt(t)}.png`); await page.screenshot({ path: f }); files.push(f);
        const real = (Date.now() - t0) / 1000; labels.push(`${real.toFixed(2)} s`);
        const s = await page.evaluate(READ);
        if (s.score !== prev.score) ev.push({ t: +real.toFixed(2), event: s.score < prev.score ? 'restart' : 'score', ...s });
        if (s.state !== prev.state) ev.push({ t: +real.toFixed(2), event: 'state', ...s });
        prev = s;
      }
      if (withLog) log = { stepped: false, seed: null, events: ev, note: 'no __game.manual/tick/demo: real time, sampled with the screenshots (30 s)' };
    }
  } finally { await context.close(); }
  return { files, labels, log };
}

// The naive tapper: a first-time player with no knowledge of the game. It taps the main input target with
// human-like jitter (position +-12 px, 150-300 ms reaction plus a 200-700 ms think pause), never reads
// internal state to decide, retries after the result screen, and logs what the game reports.
async function tapperPass(browser, origin, view, dir, seed, tapperSec, errors) {
  const { page, context } = await newPage(browser, origin, view, '', errors);
  const r = rng(seed ^ 0x9e3779b9), gauss = gaussOf(r);
  const taps = [], runs = [], files = [], labels = [];
  const shot = async (what, t) => { const f = path.join(dir, `${String(files.length + 1).padStart(2, '0')}-${what}.png`); await page.screenshot({ path: f }); files.push(f); labels.push(`${what} ${t.toFixed(1)} s`); };
  const tapAt = async p => { if (view.hasTouch) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y); };
  try {
    await sleep(1500);
    await shot('title', 0);
    const start = await page.evaluate(() => window.__qa.start());
    if (!start) return { error: 'no start button found', taps, runs, files, labels };
    await tapAt(start);
    const t0 = Date.now(), now = () => (Date.now() - t0) / 1000;
    let runStart = now(), run = { n: 1, start: 0, taps: 0, failureAt: null, score: null }, shotsThisRun = new Set();
    while (now() < tapperSec && runs.length < 4) {
      const s = await page.evaluate(READ);
      const t = now() - runStart;
      for (const mark of [1, 3, 6, 10]) if (t >= mark && !shotsThisRun.has(mark) && run.n === 1 && run.failureAt == null) { shotsThisRun.add(mark); await shot(`run1-${mark}s`, now()); }
      const over = s.retry || s.state === 'over' || s.state === 'gameover' || s.dead === true;
      if (over && run.failureAt == null) {
        run.failureAt = +now().toFixed(2); run.score = s.score;
        await shot(`run${run.n}-failure`, now());
        await sleep(1600); await shot(`run${run.n}-result`, now());
        runs.push({ ...run, length: +(run.failureAt - run.start).toFixed(2) });
        // a person reads the result, then taps retry
        await sleep(600 + r() * 900);
        let rp = null; for (let k = 0; k < 10 && !rp; k++) { rp = await page.evaluate(() => window.__qa.retry() || window.__qa.start()); if (!rp) await sleep(200); }
        if (!rp) break;
        await tapAt(rp);
        runStart = now(); run = { n: run.n + 1, start: +now().toFixed(2), taps: 0, failureAt: null, score: null };
        continue;
      }
      if (s.state === 'paused') { const rp = await page.evaluate(() => window.__qa.resume()); if (rp) await tapAt(rp); continue; }
      // where would a newcomer tap: the game's input target if it says, else the middle of the lower canvas
      const tp = await page.evaluate(() => { const G = window.__game; let t = null; try { t = G && typeof G.target === 'function' ? G.target() : null; } catch (e) { t = null; } if (t) return t; const c = window.__qa.canvas(); return c ? { x: c.x + c.width / 2, y: c.y + c.height * 0.62 } : { x: innerWidth / 2, y: innerHeight * 0.62 }; });
      const p = { x: tp.x + Math.max(-12, Math.min(12, gauss() * 6)), y: tp.y + Math.max(-12, Math.min(12, gauss() * 6)) };
      const safe = await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return !(el && el.closest('button,a,[role=button]')); }, [p.x, p.y]);
      await sleep(150 + r() * 150); // reaction
      if (safe) { await tapAt(p); run.taps++; const a = await page.evaluate(READ); taps.push({ t: +now().toFixed(2), run: run.n, x: Math.round(p.x), y: Math.round(p.y), state: a.state, score: a.score }); }
      // think 200-700 ms, but keep watching so the failure frame is caught while the game holds it
      const until = Date.now() + 200 + r() * 500;
      while (Date.now() < until) {
        const w = await page.evaluate(READ);
        if (w.retry || w.state === 'over' || w.state === 'gameover' || w.dead === true) break;
        await sleep(60);
      }
    }
    if (run.failureAt == null && runs.length < 4) runs.push({ ...run, length: null, note: `still running after ${tapperSec} s` });
  } finally { await context.close(); }
  return { taps, runs, files, labels };
}

// Bar 1.5.1: ten real runs played by the game's own AI (__game.autoplay, with its human-like error) on the
// stepped clock, each started with a fixed Math.random seed. Returns null when the game lacks the hooks.
async function autoplayRuns(browser, origin, errors) {
  const { page, context } = await newPage(browser, origin, VIEWS[0], '', errors);
  try {
    await sleep(600);
    return await page.evaluate(() => {
      const G = window.__game;
      if (!G || !['manual', 'tick', 'autoplay'].every(k => typeof G[k] === 'function')) return null;
      const startBtn = () => document.querySelector('[data-qa=start]'), retryBtn = () => document.querySelector('[data-qa=retry]');
      G.manual(true);
      const runs = [];
      for (let seed = 1; seed <= 10; seed++) {
        let s = seed >>> 0; const keep = Math.random;
        Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
        const b = G.state === 'over' || G.state === 'gameover' ? retryBtn() : startBtn();
        if (b) b.click();
        for (let i = 0; i < 30; i++) G.tick(16);
        Math.random = keep;
        if (G.state !== 'play') { runs.push({ seed, sec: null, note: `could not start a run (state "${G.state}")` }); break; }
        G.autoplay(true);
        let t = 0; while (G.state === 'play' && t < 300000) { G.tick(16); t += 16; }
        G.autoplay(false);
        runs.push({ seed, sec: G.state === 'play' ? null : +(t / 1000 + 0.48).toFixed(1), score: G.score, note: G.state === 'play' ? 'still running after 300 s' : undefined });
        for (let i = 0; i < 150; i++) G.tick(16);
      }
      const secs = runs.map(r => r.sec).filter(v => v != null).sort((a, b) => a - b), n = secs.length;
      return { runs, medianSec: n ? (n % 2 ? secs[(n - 1) / 2] : (secs[n / 2 - 1] + secs[n / 2]) / 2) : null, unfinished: runs.filter(r => r.sec == null).length };
    });
  } finally { await context.close(); }
}

async function main() {
  let args;
  try { args = parseArgs(process.argv.slice(2), { seed: 'string', 'tapper-sec': 'string', help: 'bool' }); }
  catch (e) { console.error(e.message); console.error(USAGE); process.exit(2); }
  if (args.help || args._.length !== 2) { console.error(USAGE); process.exit(args.help ? 0 : 2); }
  const [gameDir, outDir] = args._;
  if (!fs.existsSync(path.join(gameDir, 'index.html'))) { console.error(`no index.html in ${gameDir}`); process.exit(2); }
  const seed = Number(args.seed || 12345) >>> 0, tapperSec = Number(args['tapper-sec'] || 60);
  const { meta } = readMeta(gameDir);
  fs.mkdirSync(outDir, { recursive: true });
  const t0 = Date.now(), errors = [];
  const server = await startServer(gameDir);
  const browser = await launchBrowser();
  const summary = { game: path.basename(path.resolve(gameDir)), title_ja: meta?.title_ja ?? null, title_en: meta?.title_en ?? null, quality_bar: meta?.quality_bar ?? 0, seed, views: {}, hooks: null };
  const tapperLog = {}, files = [];
  let demoLog = null;
  try {
    // which hooks the game offers
    {
      const ctx = await browser.newContext(); const p = await ctx.newPage();
      await p.goto(`${server.origin}/index.html`, { waitUntil: 'load' }); await sleep(400);
      summary.hooks = await p.evaluate(() => { const G = window.__game; if (!G) return []; return Object.keys(Object.getOwnPropertyDescriptors(G)); });
      await ctx.close();
    }
    for (const view of VIEWS) {
      const vdir = path.join(outDir, view.name), ddir = path.join(vdir, 'demo'), pdir = path.join(vdir, 'play');
      for (const d of [ddir, pdir]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }
      console.log(`review-kit: ${view.name} demo frames ...`);
      const demo = await demoPass(browser, server.origin, view, ddir, seed, errors, view === VIEWS[0]);
      if (demo.log) demoLog = demo.log;
      console.log(`review-kit: ${view.name} naive tapper (${tapperSec} s) ...`);
      const tap = await tapperPass(browser, server.origin, view, pdir, seed, tapperSec, errors);
      tapperLog[view.name] = { taps: tap.taps, runs: tap.runs, error: tap.error || null };
      const titleSrc = tap.files[0];
      if (titleSrc) fs.copyFileSync(titleSrc, path.join(vdir, 'title.png'));
      const cd = await contactSheet(browser, demo.files, demo.labels, view.thumb, view.cols, path.join(vdir, 'contact-demo.png'), `${summary.game} ?demo=1 ${view.name}`);
      const cp = await contactSheet(browser, tap.files, tap.labels, view.thumb, view.cols, path.join(vdir, 'contact-play.png'), `${summary.game} naive tapper ${view.name}`);
      const lengths = tap.runs.map(r => r.length).filter(v => v != null);
      summary.views[view.name] = {
        demoFrames: demo.files.length, playFrames: tap.files.length, contactDemo: cd && path.relative(outDir, cd), contactPlay: cp && path.relative(outDir, cp),
        tapper: { runs: tap.runs.length, firstRunSec: tap.runs[0] ? tap.runs[0].length : null, runLengthsSec: lengths, scores: tap.runs.map(r => r.score), taps: tap.taps.length, error: tap.error || null }
      };
      files.push(...demo.files, ...tap.files);
    }
    console.log('review-kit: autoplay runs (bar 1.5.1) ...');
    summary.autoplay = await autoplayRuns(browser, server.origin, errors);
    if (summary.autoplay) summary.autoplay.sessionLengthSec = meta?.session_length_sec ?? null;
    if (demoLog) {
      const ev = demoLog.events || [];
      summary.demo = {
        stepped: demoLog.stepped,
        firstScoreSec: (ev.find(e => e.event === 'score') || {}).t ?? null,
        failuresSec: ev.filter(e => e.event === 'failure').map(e => e.t),
        restartsSec: ev.filter(e => e.event === 'restart').map(e => e.t)
      };
    }
    fs.writeFileSync(path.join(outDir, 'naive-tapper.json'), JSON.stringify(tapperLog, null, 1) + '\n');
    fs.writeFileSync(path.join(outDir, 'demo-run.json'), JSON.stringify(demoLog, null, 1) + '\n');
    summary.pageErrors = [...new Set(errors)].slice(0, 20);
    summary.seconds = Math.round((Date.now() - t0) / 1000);
    summary.files = files.length;
    summary.madeAt = new Date().toISOString();
    fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
    console.log(`review-kit: done in ${summary.seconds} s -> ${outDir}`);
    if (summary.pageErrors.length) { console.error(`review-kit: the game threw errors (see summary.json)`); process.exitCode = 1; }
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch(e => { console.error(`review-kit: ${e.stack || e.message}`); process.exit(1); });
