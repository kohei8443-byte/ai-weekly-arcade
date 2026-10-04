#!/usr/bin/env node
// Records YouTube / itch.io media for one game from its ?demo=1 attract mode.
//   node tools/capture.mjs games/w01-orbit-hopper media/w01-orbit-hopper [--seconds 30] [--gif-start 4] [--lang ja|en] [--keep-raw]
// Writes to <outDir>:
//   vertical.mp4      1080x1920 H.264 30 fps (rendered at 360x640, deviceScaleFactor 3)
//   horizontal.mp4    1920x1080 H.264 30 fps (portrait game centred, title and tagline at the sides)
//   preview.gif       6 s, 480 px wide, 12 fps (palettegen)
//   cover.png         630x500 itch.io cover (title screen composited)
//   thumb-base.png    1280x720 YouTube thumbnail base (gameplay on the right, room for text on the left)
//   title.png / play.png   raw 1080x1920 screenshots
//   capture.json      what was made, durations and sizes
// Media are not committed to git; upload them as GitHub Release assets or keep them locally.
// Needs ffmpeg on PATH (or FFMPEG=/path/to/ffmpeg) and Chromium for Playwright (or CHROMIUM_PATH).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { launchBrowser, startServer, readMeta, parseArgs, sleep, escapeHtml } from './lib/common.mjs';

const USAGE = 'usage: node tools/capture.mjs <gameDir> <outDir> [--seconds 30] [--gif-start 4] [--gif-seconds 6] [--lang ja|en] [--keep-raw]';
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const DISCLOSURE_JA = 'コードはAI（Claude）、絵と音はコードで生成、判断するのは人間（kouhei）';

function ffmpeg(args, what) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw new Error(`ffmpeg not found (${r.error.message}). Install ffmpeg or set FFMPEG=/path/to/ffmpeg`);
  if (r.status !== 0) throw new Error(`ffmpeg failed while making ${what}: ${(r.stderr || '').trim().split('\n').slice(-3).join(' ')}`);
}

function probeDuration(file) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-i', file], { encoding: 'utf8' });
  const m = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(r.stderr || '');
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
}

const hueOf = week => Math.round((200 + week * 137.508) % 360);

// ---------- wrapper pages (served from the same origin as the game) ----------
// Font size so a title of n characters fits on one line in `room` px (Japanese titles rarely have break points).
const fitSize = (title, room, max, min) => Math.max(min, Math.min(max, Math.floor(room / Math.max(1, [...String(title || '')].length))));

function widePage(meta) {
  const e = escapeHtml, h = hueOf(meta.week || 0), nn = String(meta.week || 0).padStart(2, '0');
  const ts = fitSize(meta.title_ja, 170, 26, 16);
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>wide</title><style>
  html,body{margin:0;height:100%;overflow:hidden}
  body{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;color:#f6efe0;
    font-family:system-ui,"Hiragino Sans","Noto Sans JP",sans-serif;
    background:radial-gradient(90% 120% at 50% 50%,hsl(${h} 45% 20%) 0%,hsl(${h + 30} 50% 9%) 70%)}
  /* the game keeps a real phone layout (360x640 CSS px) and is scaled down to the 360 px tall viewport */
  .box{width:202.5px;height:360px;overflow:hidden;box-shadow:0 0 40px #0009}
  .frame{width:360px;height:640px;border:0;display:block;transform:scale(.5625);transform-origin:0 0}
  .side{padding:0 22px;display:flex;flex-direction:column;gap:8px;min-width:0}
  .t,.s,.ai{word-break:auto-phrase;text-wrap:balance}
  .l{align-items:flex-end;text-align:right}
  .k{font-size:9px;font-weight:800;letter-spacing:.28em;color:hsl(${h + 60} 80% 75%)}
  .t{font-size:${ts}px;font-weight:900;line-height:1.15}
  .s{font-size:11px;line-height:1.6;color:#f6efe0cc;max-width:15em}
  .en{font-size:15px;font-weight:800;line-height:1.2}
  .ai{font-size:8px;line-height:1.5;color:#f6efe099;max-width:20em;margin-top:10px}
  </style></head><body>
  <div class="side l"><div class="k">AI WEEKLY ARCADE #${nn}</div><div class="t">${e(meta.title_ja || '')}</div><div class="s">${e(meta.tagline_ja || '')}</div></div>
  <div class="box"><iframe class="frame" src="index.html?demo=1" scrolling="no"></iframe></div>
  <div class="side r"><div class="en">${e(meta.title_en || '')}</div><div class="s">${e(meta.tagline_en || '')}</div><div class="ai">${e(DISCLOSURE_JA)}</div></div>
  </body></html>`;
}

function composePage({ width, height, shot, meta, kind }) {
  const e = escapeHtml, h = hueOf(meta.week || 0), nn = String(meta.week || 0).padStart(2, '0');
  const img = `data:image/png;base64,${shot.toString('base64')}`;
  const isCover = kind === 'cover';
  const phoneH = isCover ? height - 36 : height - 48;
  const phoneW = Math.round(phoneH * 9 / 16);
  const ts = fitSize(meta.title_ja, width - phoneW - 90, 34, 18);
  const text = isCover ? `<div class="txt"><div class="k">AI WEEKLY ARCADE</div><div class="n">#${nn}</div>
      <div class="t">${e(meta.title_ja || '')}</div><div class="en">${e(meta.title_en || '')}</div></div>` : '';
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>compose</title><style>
  html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:#000}
  body{position:relative;font-family:system-ui,"Hiragino Sans","Noto Sans JP",sans-serif;color:#f6efe0}
  .bg{position:absolute;inset:-40px;background:url(${img}) center/cover;filter:blur(24px) brightness(.5) saturate(1.2)}
  .tint{position:absolute;inset:0;background:linear-gradient(90deg,hsl(${h} 50% 8% / .92) 0%,hsl(${h} 50% 8% / .55) ${isCover ? 55 : 60}%,transparent 100%)}
  .phone{position:absolute;top:${(height - phoneH) / 2}px;${isCover ? 'right:28px' : `right:${Math.round(width * 0.08)}px`};width:${phoneW}px;height:${phoneH}px;
    background:url(${img}) center/cover;border-radius:${isCover ? 14 : 22}px;box-shadow:0 12px 40px #000a,0 0 0 2px #ffffff30}
  .txt{position:absolute;left:30px;top:0;bottom:0;width:${width - phoneW - 80}px;display:flex;flex-direction:column;justify-content:center;gap:6px}
  .k{font-size:12px;font-weight:800;letter-spacing:.26em;color:hsl(${h + 60} 80% 75%)}
  .n{font-size:72px;font-weight:900;line-height:1;letter-spacing:-.02em}
  .t{font-size:${ts}px;font-weight:900;line-height:1.2;overflow-wrap:anywhere;word-break:auto-phrase;text-wrap:balance}
  .en{font-size:18px;font-weight:700;color:#f6efe0cc}
  </style></head><body><div class="bg"></div><div class="tint"></div><div class="phone"></div>${text}</body></html>`;
}

// ---------- recording ----------
async function record(browser, origin, { url, viewport, size, seconds, tmp, locale, label, onMid }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 3, locale, recordVideo: { dir: tmp, size } });
  await context.route('**/*', r => (r.request().url().startsWith(origin) || /^(data|blob|about):/.test(r.request().url()) ? r.continue() : r.abort()));
  const errors = [];
  const page = await context.newPage();
  const t0 = Date.now();
  page.on('pageerror', e => errors.push(String(e.message || e)));
  await page.goto(url, { waitUntil: 'load' });
  await sleep(1500); // let the attract AI get going and fonts settle
  const trimStart = (Date.now() - t0) / 1000;
  const mid = sleep(seconds * 500).then(() => onMid && onMid(page));
  await sleep(seconds * 1000 + 600);
  await mid;
  const video = page.video();
  await context.close();
  const raw = await video.path();
  if (errors.length) console.warn(`capture: ${label}: page errors during recording: ${errors.slice(0, 3).join(' | ')}`);
  return { raw, trimStart, errors };
}

function encodeMp4(raw, trimStart, seconds, w, h, out) {
  ffmpeg(['-ss', trimStart.toFixed(2), '-i', raw, '-t', String(seconds),
    '-vf', `fps=30,scale=${w}:${h}:flags=lanczos,setsar=1,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', '-an', out], path.basename(out));
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2), { seconds: 'string', 'gif-start': 'string', 'gif-seconds': 'string', lang: 'string', 'keep-raw': 'bool', help: 'bool' });
  } catch (e) { console.error(e.message); console.error(USAGE); process.exit(2); }
  if (args.help || args._.length !== 2) { console.error(USAGE); process.exit(args.help ? 0 : 2); }
  const [gameDir, outDir] = args._;
  if (!fs.existsSync(path.join(gameDir, 'index.html'))) { console.error(`no index.html in ${gameDir}`); process.exit(2); }
  const seconds = Number(args.seconds || 30);
  const gifStart = Number(args['gif-start'] || 4);
  const gifSeconds = Number(args['gif-seconds'] || 6);
  const locale = args.lang === 'en' ? 'en-US' : 'ja-JP'; // games pick their language from navigator.language
  const { meta } = readMeta(gameDir);
  const m = meta || { week: 0, title_ja: path.basename(path.resolve(gameDir)), title_en: '', tagline_ja: '', tagline_en: '' };
  fs.mkdirSync(outDir, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(outDir, '.raw-')); // raw webm recordings, removed at the end
  const t0 = Date.now();
  const server = await startServer(gameDir, { '/__wide.html': widePage(m) });
  const browser = await launchBrowser(['--force-device-scale-factor=3']);
  const made = {};
  const out = name => path.join(outDir, name);
  try {
    // title screen (no demo): source for cover.png
    {
      const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, locale });
      const p = await ctx.newPage();
      await p.goto(`${server.origin}/index.html`, { waitUntil: 'load' });
      await sleep(2000);
      await p.screenshot({ path: out('title.png') });
      await ctx.close();
      made.title = 'title.png';
    }

    console.log(`capture: recording vertical ${seconds}s ...`);
    // one recording at a time so CPU contention does not drop frames
    let playShot = null;
    const v = await record(browser, server.origin, {
      url: `${server.origin}/index.html?demo=1`, viewport: { width: 360, height: 640 }, size: { width: 1080, height: 1920 },
      seconds, tmp, locale, label: 'vertical',
      onMid: async page => { playShot = await page.screenshot(); }
    });
    console.log(`capture: recording horizontal ${seconds}s ...`);
    const hz = await record(browser, server.origin, {
      url: `${server.origin}/__wide.html`, viewport: { width: 640, height: 360 }, size: { width: 1920, height: 1080 },
      seconds, tmp, locale, label: 'horizontal'
    });
    fs.writeFileSync(out('play.png'), playShot);
    made.play = 'play.png';

    console.log('capture: encoding mp4 ...');
    encodeMp4(v.raw, v.trimStart, seconds, 1080, 1920, out('vertical.mp4'));
    encodeMp4(hz.raw, hz.trimStart, seconds, 1920, 1080, out('horizontal.mp4'));
    made.vertical = 'vertical.mp4';
    made.horizontal = 'horizontal.mp4';

    console.log('capture: gif ...');
    ffmpeg(['-ss', String(gifStart), '-t', String(gifSeconds), '-i', out('vertical.mp4'),
      '-vf', 'fps=12,scale=480:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
      '-loop', '0', out('preview.gif')], 'preview.gif');
    made.gif = 'preview.gif';

    console.log('capture: cover and thumbnail base ...');
    for (const [kind, w, h, src, file] of [['cover', 630, 500, out('title.png'), 'cover.png'], ['thumb', 1280, 720, out('play.png'), 'thumb-base.png']]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      const p = await ctx.newPage();
      await p.setContent(composePage({ width: w, height: h, shot: fs.readFileSync(src), meta: m, kind }), { waitUntil: 'load' });
      await sleep(200);
      await p.screenshot({ path: out(file) });
      await ctx.close();
      made[kind] = file;
    }

    if (args['keep-raw']) {
      fs.copyFileSync(v.raw, out('vertical-raw.webm'));
      fs.copyFileSync(hz.raw, out('horizontal-raw.webm'));
    }
    const info = {
      game: path.basename(path.resolve(gameDir)), week: m.week, seconds,
      files: Object.fromEntries(Object.entries(made).map(([k, f]) => [k, { file: f, bytes: fs.statSync(out(f)).size }])),
      durations: { vertical: probeDuration(out('vertical.mp4')), horizontal: probeDuration(out('horizontal.mp4')), gif: gifSeconds },
      pageErrors: [...v.errors, ...hz.errors],
      madeAt: new Date().toISOString()
    };
    fs.writeFileSync(out('capture.json'), JSON.stringify(info, null, 2) + '\n');
    console.log(`capture: done in ${((Date.now() - t0) / 1000).toFixed(0)} s -> ${outDir}`);
    for (const [k, f] of Object.entries(info.files)) console.log(`  ${f.file.padEnd(16)} ${(f.bytes / 1024 / 1024).toFixed(2)} MB`);
    if (info.pageErrors.length) { console.error('capture: the game threw errors while recording (see capture.json)'); process.exitCode = 1; }
  } finally {
    await browser.close();
    await server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch(e => { console.error(`capture: ${e.message}`); process.exit(1); });
