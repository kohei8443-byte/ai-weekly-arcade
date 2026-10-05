// Shared helpers for the qa / capture / hub tools.
// Only dependency: playwright (loaded lazily so hub.mjs works without it).
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

export const MAX_GAME_BYTES = 300 * 1024; // one self-contained index.html (CLAUDE.md section 4, QUALITY_BAR.md 1.10.1)

// ---------- meta.json ----------

const STRING_FIELDS = [
  'slug', 'title_ja', 'title_en', 'tagline_ja', 'tagline_en',
  'how_to_play_ja', 'how_to_play_en', 'genre', 'video_hook_ja'
];
// Optional fields: "quality_bar": 1 marks a game built to QUALITY_BAR.md (qa runs the hard checks).
export const OPTIONAL_META_FIELDS = ['quality_bar'];
export const META_FIELDS = [
  'slug', 'week', 'title_ja', 'title_en', 'tagline_ja', 'tagline_en', 'how_to_play_ja', 'how_to_play_en',
  'controls', 'genre', 'tags', 'session_length_sec', 'video_hook_ja'
];

export function readMeta(gameDir) {
  const file = path.join(gameDir, 'meta.json');
  if (!fs.existsSync(file)) return { meta: null, error: 'meta.json is missing' };
  try {
    return { meta: JSON.parse(fs.readFileSync(file, 'utf8')), error: null };
  } catch (e) {
    return { meta: null, error: `meta.json is not valid JSON: ${e.message}` };
  }
}

// Returns { errors: [], warnings: [] }. dirName is the folder name (e.g. "w01-orbit-hopper").
export function validateMeta(meta, dirName = '') {
  const errors = [], warnings = [];
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return { errors: ['meta.json must be a JSON object'], warnings };
  for (const k of META_FIELDS) if (!(k in meta)) errors.push(`missing field "${k}"`);
  for (const k of STRING_FIELDS) {
    if (k in meta && (typeof meta[k] !== 'string' || !meta[k].trim())) errors.push(`"${k}" must be a non-empty string`);
  }
  if ('slug' in meta && typeof meta.slug === 'string' && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(meta.slug)) {
    errors.push(`"slug" must be lowercase kebab-case (got "${meta.slug}")`);
  }
  if ('week' in meta && !(Number.isInteger(meta.week) && meta.week >= 1 && meta.week <= 999)) {
    errors.push('"week" must be an integer between 1 and 999');
  }
  for (const k of ['controls', 'tags']) {
    if (!(k in meta)) continue;
    const v = meta[k];
    if (!Array.isArray(v) || v.length === 0 || !v.every(s => typeof s === 'string' && s.trim())) {
      errors.push(`"${k}" must be a non-empty array of non-empty strings`);
    }
  }
  if (Array.isArray(meta.tags)) {
    const bad = meta.tags.filter(t => typeof t === 'string' && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(t));
    if (bad.length) errors.push(`"tags" must be lowercase with hyphens (bad: ${bad.join(', ')})`);
  }
  if ('session_length_sec' in meta) {
    const v = meta.session_length_sec;
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) errors.push('"session_length_sec" must be a positive number');
  }
  // Japanese fields should contain Japanese; English fields should not be Japanese.
  const jp = /[぀-ヿ㐀-鿿]/;
  for (const k of ['title_ja', 'tagline_ja', 'how_to_play_ja', 'video_hook_ja']) {
    if (typeof meta[k] === 'string' && meta[k].trim() && !jp.test(meta[k])) warnings.push(`"${k}" has no Japanese characters`);
  }
  for (const k of ['title_en', 'tagline_en', 'how_to_play_en']) {
    if (typeof meta[k] === 'string' && jp.test(meta[k])) warnings.push(`"${k}" contains Japanese characters`);
  }
  if ('quality_bar' in meta && !(Number.isInteger(meta.quality_bar) && meta.quality_bar >= 0)) errors.push('"quality_bar" must be a whole number (1 = built to QUALITY_BAR.md)');
  const known = new Set([...META_FIELDS, ...OPTIONAL_META_FIELDS]);
  for (const k of Object.keys(meta)) if (!known.has(k)) warnings.push(`unknown field "${k}" (ignored by hub)`);
  const m = /^w(\d{2,3})-(.+)$/.exec(dirName);
  if (m) {
    if (Number.isInteger(meta.week) && Number(m[1]) !== meta.week) errors.push(`folder week ${m[1]} does not match "week": ${meta.week}`);
    if (typeof meta.slug === 'string' && m[2] !== meta.slug) errors.push(`folder slug "${m[2]}" does not match "slug": "${meta.slug}"`);
  } else if (dirName && dirName !== 'template') {
    warnings.push(`folder name "${dirName}" does not follow wNN-<slug>`);
  }
  return { errors, warnings };
}

// ---------- static file server (games are always tested over http, like Pages / itch) ----------

const MIME = {
  '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff2': 'font/woff2'
};

// virtual: { "/__path.html": "<html>..." } extra in-memory pages.
export function startServer(rootDir, virtual = {}) {
  const root = path.resolve(rootDir);
  const server = http.createServer((req, res) => {
    let urlPath;
    try {
      urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    } catch {
      // A malformed escape such as "/100%.png" must not crash the tool.
      res.writeHead(400); res.end('bad request'); return;
    }
    if (Object.hasOwn(virtual, urlPath) && virtual[urlPath] != null) {
      res.writeHead(200, { 'content-type': MIME[path.extname(urlPath)] || 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(virtual[urlPath]);
      return;
    }
    let file = path.join(root, urlPath);
    // An encoded slash ("..%2F") survives URL parsing, so check containment after decoding.
    // Comparing with root + separator also blocks sibling folders such as "<root>-old".
    if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ origin: `http://127.0.0.1:${port}`, close: () => new Promise(r => server.close(() => r())) });
    });
  });
}

// ---------- browser ----------

let playwrightModule = null;
async function loadPlaywright() {
  if (!playwrightModule) {
    try {
      playwrightModule = await import('playwright');
    } catch (e) {
      throw new Error('playwright is not installed. Run "npm ci" (or "npm install") in the repo root first.');
    }
  }
  return playwrightModule;
}

// Finds a Chromium binary when Playwright's own revision is not installed (e.g. preinstalled browsers in a sandbox).
function findFallbackChromium() {
  const dirs = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers', path.join(process.env.HOME || '', '.cache/ms-playwright')].filter(Boolean);
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue;
    const revs = fs.readdirSync(d).filter(n => /^chromium-\d+$/.test(n)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const r of revs) {
      for (const sub of ['chrome-linux/chrome', 'chrome-linux64/chrome']) {
        const p = path.join(d, r, sub);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  return null;
}

// extraArgs: e.g. ['--force-device-scale-factor=3'] so screencasts / recordVideo capture device pixels
// (with only the emulated deviceScaleFactor, Chromium screencasts at CSS-pixel size).
// autoplay: 'no-user-gesture-required' (default: tools hear the game at once) or 'user-gesture-required'
// (like a real phone; the hard checks use it to test the audio unlock).
export async function launchBrowser(extraArgs = [], { autoplay = 'no-user-gesture-required' } = {}) {
  const { chromium } = await loadPlaywright();
  const args = [`--autoplay-policy=${autoplay}`, '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', ...extraArgs];
  const opts = { args };
  if (process.env.CHROMIUM_PATH) return chromium.launch({ ...opts, executablePath: process.env.CHROMIUM_PATH });
  try {
    return await chromium.launch(opts);
  } catch (e) {
    const fallback = findFallbackChromium();
    if (!fallback || !/Executable doesn't exist|browserType\.launch/i.test(String(e.message))) throw e;
    return chromium.launch({ ...opts, executablePath: fallback });
  }
}

// ---------- misc ----------

export const sleep = ms => new Promise(r => setTimeout(r, ms));

export function parseArgs(argv, flags = {}) {
  // flags: { name: 'bool' | 'string' }
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (flags[k] === 'bool') out[k] = true;
      else if (flags[k] === 'string') out[k] = v != null ? v : argv[++i];
      else throw new Error(`unknown option --${k}`);
    } else out._.push(a);
  }
  return out;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Analysis page: decodes PNG buffers inside a blank Chromium page (no image deps in Node).
export async function createImageAnalyzer(browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setContent('<!doctype html><title>analyzer</title>');
  async function run(fn, pngs, extra) {
    return page.evaluate(async ({ fnSrc, b64s, extra }) => {
      const load = async b64 => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        const W = 160, H = Math.max(1, Math.round(img.height * 160 / img.width));
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0, W, H);
        return g.getImageData(0, 0, W, H);
      };
      const imgs = [];
      for (const b of b64s) imgs.push(await load(b));
      return (0, eval)('(' + fnSrc + ')')(imgs, extra);
    }, { fnSrc: fn.toString(), b64s: pngs.map(b => b.toString('base64')), extra });
  }
  return {
    // distinct colours (quantised to 4 bits/channel) and the share of the most common colour
    stats: png => run(([d]) => {
      const counts = new Map();
      const px = d.data;
      for (let i = 0; i < px.length; i += 4) {
        const k = (px[i] >> 4) << 8 | (px[i + 1] >> 4) << 4 | (px[i + 2] >> 4);
        counts.set(k, (counts.get(k) || 0) + 1);
      }
      const total = px.length / 4;
      return { distinct: counts.size, dominant: Math.max(...counts.values()) / total };
    }, [png]),
    // fraction of sampled pixels that differ noticeably between two screenshots
    diff: (a, b) => run(([x, y]) => {
      if (x.width !== y.width || x.height !== y.height) return 1;
      let changed = 0;
      for (let i = 0; i < x.data.length; i += 4) {
        const dd = Math.abs(x.data[i] - y.data[i]) + Math.abs(x.data[i + 1] - y.data[i + 1]) + Math.abs(x.data[i + 2] - y.data[i + 2]);
        if (dd > 24) changed++;
      }
      return changed / (x.data.length / 4);
    }, [a, b]),
    close: () => ctx.close()
  };
}
