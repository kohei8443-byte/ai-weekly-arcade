// Static checks for one game folder: single file, doctype, size, [hidden] rule, meta.json, and
// external / local resource loads found in HTML attributes, CSS url()/@import and JS loader calls.
// URLs that only appear as text (credits, comments, plain strings) are reported as info, not failures.
import fs from 'node:fs';
import path from 'node:path';
import { MAX_GAME_BYTES, readMeta, validateMeta } from './common.mjs';

const EXTERNAL = /^\s*(?:(?:https?|wss?|ftp):)?\/\/[^\s]/i;
const URLISH = /(?:\b(?:https?|wss?|ftp):\/\/|(?:^|[\s"'(=])\/\/[a-z0-9-]+\.[a-z])/i;
const HARMLESS = /^\s*(?:$|#|data:|blob:|javascript:|about:|mailto:|tel:)/i;

// Attributes that make the browser fetch something.
const LOAD_ATTRS = new Set(['src', 'srcset', 'poster', 'data', 'background', 'manifest', 'icon', 'xlink:href', 'imagesrcset', 'ping']);
// Elements whose href is fetched (anything except a, area, base handled separately).
const NAV_HREF = new Set(['a', 'area']);

function lineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return off => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= off) lo = mid; else hi = mid - 1; }
    return lo + 1;
  };
}

const blank = s => s.replace(/[^\n]/g, ' ');

// ---------- JS tokenizer: returns comment ranges and string literals with the code that precedes them ----------
function scanJs(src) {
  const strings = []; // { start, end, value, before }
  const code = [];    // code text with strings/comments blanked (same length)
  let i = 0, prevSig = '';
  const n = src.length;
  const isIdent = c => /[A-Za-z0-9_$]/.test(c);
  const regexAllowedAfterWord = /^(?:return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)$/;
  let lastWord = '';
  const out = src.split('');
  function readString(q, start) {
    let j = start + 1, val = '';
    while (j < n) {
      const c = src[j];
      if (c === '\\') { val += src[j + 1] || ''; j += 2; continue; }
      if (c === q) { j++; break; }
      if (c === '\n' && q !== '`') break;
      if (q === '`' && c === '$' && src[j + 1] === '{') {
        // skip the expression inside ${...}; nested template literals are rare in game code
        let depth = 1; j += 2;
        while (j < n && depth > 0) {
          if (src[j] === '{') depth++;
          else if (src[j] === '}') depth--;
          else if (src[j] === '"' || src[j] === "'" || src[j] === '`') { j = readString(src[j], j).end; continue; }
          j++;
        }
        val += '\u0000';
        continue;
      }
      val += c; j++;
    }
    return { end: j, value: val };
  }
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') {
      const e = src.indexOf('\n', i); const end = e < 0 ? n : e;
      for (let k = i; k < end; k++) out[k] = ' ';
      i = end; continue;
    }
    if (c === '/' && d === '*') {
      const e = src.indexOf('*/', i + 2); const end = e < 0 ? n : e + 2;
      for (let k = i; k < end; k++) if (out[k] !== '\n') out[k] = ' ';
      i = end; continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const { end, value } = readString(c, i);
      const before = out.slice(Math.max(0, i - 80), i).join('');
      strings.push({ start: i, end, value, before });
      for (let k = i + 1; k < end - 1; k++) if (out[k] !== '\n') out[k] = ' ';
      i = end; prevSig = c; lastWord = ''; continue;
    }
    if (c === '/') {
      const regexOk = prevSig === '' || /[(,=:[!&|?{};+\-*%<>~^]/.test(prevSig) || regexAllowedAfterWord.test(lastWord);
      if (regexOk) {
        let j = i + 1, inClass = false;
        while (j < n && src[j] !== '\n') {
          if (src[j] === '\\') { j += 2; continue; }
          if (src[j] === '[') inClass = true; else if (src[j] === ']') inClass = false;
          else if (src[j] === '/' && !inClass) break;
          j++;
        }
        j++;
        while (j < n && /[a-z]/i.test(src[j])) j++;
        for (let k = i + 1; k < j - 1; k++) out[k] = ' ';
        i = j; prevSig = '/'; lastWord = ''; continue;
      }
    }
    if (!/\s/.test(c)) {
      if (isIdent(c)) {
        let j = i; while (j < n && isIdent(src[j])) j++;
        lastWord = src.slice(i, j); prevSig = 'a'; i = j; continue;
      }
      prevSig = c; lastWord = '';
    }
    i++;
  }
  return { strings, code: out.join('') };
}

// Code just before a string literal that means "this string is fetched / loaded".
const JS_LOADERS = [
  [/\bfetch\s*\(\s*$/, 'fetch()'],
  [/\bimport\s*\(\s*$/, 'import()'],
  [/\bfrom\s*$/, 'import ... from'],
  [/^\s*import\s*$|[;\n]\s*import\s*$/, 'import'],
  [/\bimportScripts\s*\(\s*$/, 'importScripts()'],
  [/\bnew\s+(?:Shared)?Worker\s*\(\s*$/, 'new Worker()'],
  [/\bnew\s+(?:WebSocket|EventSource|Audio)\s*\(\s*$/, 'new WebSocket/EventSource/Audio()'],
  [/\bsendBeacon\s*\(\s*$/, 'sendBeacon()'],
  [/\.open\s*\(\s*(?:'[^']*'|"[^"]*"|`[^`]*`|\w+)\s*,\s*$/, 'XMLHttpRequest.open()'],
  [/\.(?:src|href|srcset|poster|data|background)\s*=\s*$/, '.src/.href assignment'],
  [/\bsetAttribute\s*\(\s*['"`](?:src|href|srcset|poster|data)['"`]\s*,\s*$/, 'setAttribute(src/href)'],
  [/\bnew\s+FontFace\s*\(\s*(?:'[^']*'|"[^"]*"|\w+)\s*,\s*$/, 'new FontFace()'],
  [/\b(?:audioWorklet|serviceWorker|paintWorklet)\s*\.\s*(?:addModule|register)\s*\(\s*$/, 'worklet/serviceWorker'],
  [/\bloadImage\s*\(\s*$/, 'loadImage()']
];

function checkCssText(css, baseOffset, lineOf, findings, where) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, blank);
  const urlRe = /url\(\s*(['"]?)([^'")]*)\1\s*\)/gi;
  let m;
  while ((m = urlRe.exec(clean))) {
    const v = m[2];
    const line = lineOf(baseOffset + m.index);
    if (EXTERNAL.test(v)) findings.fail.push(`line ${line}: ${where} url() loads an external resource: ${v.slice(0, 80)}`);
    else if (!HARMLESS.test(v)) findings.fail.push(`line ${line}: ${where} url() loads a local file "${v}" (games must be a single file; inline it as data:)`);
  }
  const impRe = /@import\s+(?:url\()?\s*['"]?([^'")\s;]+)/gi;
  while ((m = impRe.exec(clean))) {
    findings.fail.push(`line ${lineOf(baseOffset + m.index)}: ${where} @import "${m[1].slice(0, 80)}" (not allowed)`);
  }
}

function checkJs(src, baseOffset, lineOf, findings, where) {
  const { strings, code } = scanJs(src);
  for (const s of strings) {
    const line = lineOf(baseOffset + s.start);
    const val = s.value;
    const loader = JS_LOADERS.find(([re]) => re.test(s.before));
    if (loader) {
      if (EXTERNAL.test(val)) { findings.fail.push(`line ${line}: ${where} ${loader[1]} loads an external URL: ${val.slice(0, 80)}`); continue; }
      if (!HARMLESS.test(val) && !/\u0000/.test(val) && /^[\w./-]+\.[a-z0-9]{2,5}(?:[?#].*)?$/i.test(val.trim())) {
        findings.fail.push(`line ${line}: ${where} ${loader[1]} loads a local file "${val}" (games must be a single file)`);
        continue;
      }
    }
    // HTML or CSS written inside a JS string (innerHTML, style strings)
    const embedded = /(?:\b(?:src|href|srcset|poster)\s*=\s*['"]?|url\(\s*['"]?|@import\s+['"]?)((?:(?:https?|wss?):)?\/\/[^\s'")]+)/i.exec(val);
    if (embedded) { findings.fail.push(`line ${line}: ${where} string builds markup/CSS that loads ${embedded[1].slice(0, 80)}`); continue; }
    if (URLISH.test(val)) findings.info.push(`line ${line}: URL text in a string (not loaded): ${val.trim().slice(0, 80)}`);
  }
  // network APIs called with a non-literal argument cannot be resolved statically; the runtime check covers them
  const apiRe = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts)\b\s*\(?/g;
  let m;
  const seen = new Set();
  while ((m = apiRe.exec(code))) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    findings.warn.push(`line ${lineOf(baseOffset + m.index)}: ${where} uses ${m[1]}; games should make no network requests`);
  }
  return code;
}

export function staticCheck(gameDir) {
  const results = []; // { level: 'pass'|'warn'|'fail'|'info', check, msg }
  const add = (level, check, msg) => results.push({ level, check, msg });
  const dirName = path.basename(path.resolve(gameDir));
  const file = path.join(gameDir, 'index.html');

  // single file
  if (!fs.existsSync(file)) {
    add('fail', 'single-file', 'index.html is missing');
    return results;
  }
  const extras = fs.readdirSync(gameDir).filter(n => !['index.html', 'meta.json', 'README.md', 'NOTES.md', '.DS_Store'].includes(n));
  if (extras.length) add('warn', 'single-file', `extra files in the game folder are not published: ${extras.join(', ')}`);

  const raw = fs.readFileSync(file);
  const size = raw.length;
  if (size >= MAX_GAME_BYTES) add('fail', 'size', `index.html is ${(size / 1024).toFixed(1)} KB (limit ${MAX_GAME_BYTES / 1024} KB)`);
  else add('pass', 'size', `index.html is ${(size / 1024).toFixed(1)} KB (< ${MAX_GAME_BYTES / 1024} KB)`);

  const html = raw.toString('utf8');
  const lineOf = lineIndex(html);
  if (/^﻿?\s*<!doctype html\s*>/i.test(html)) add('pass', 'doctype', '<!doctype html> is the first thing in the file');
  else add('fail', 'doctype', 'file must start with <!doctype html>');

  // blank HTML comments (keep offsets so line numbers stay right)
  let doc = html.replace(/<!--[\s\S]*?-->/g, blank);

  const findings = { fail: [], warn: [], info: [] };

  // script and style blocks
  const scripts = [], styles = [];
  doc = doc.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (all, attrs, body, off) => {
    const at = all.indexOf('>') + 1;
    scripts.push({ attrs, body, bodyOffset: off + at });
    return all.slice(0, at) + blank(body) + all.slice(at + body.length);
  });
  doc = doc.replace(/<style\b([^>]*)>([\s\S]*?)<\/style\s*>/gi, (all, attrs, body, off) => {
    styles.push({ body, bodyOffset: off + all.indexOf('>') + 1 });
    return all.slice(0, all.indexOf('>') + 1) + blank(body) + all.slice(all.indexOf('>') + 1 + body.length);
  });

  let allCss = '';
  for (const s of styles) { checkCssText(s.body, s.bodyOffset, lineOf, findings, '<style>'); allCss += s.body + '\n'; }

  // tags and attributes
  const tagRe = /<([a-zA-Z][a-zA-Z0-9-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let m;
  while ((m = tagRe.exec(doc))) {
    const tag = m[1].toLowerCase();
    const attrsSrc = m[2];
    const line = lineOf(m.index);
    const attrRe = /([^\s=/>]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    const attrs = {};
    let a;
    while ((a = attrRe.exec(attrsSrc))) attrs[a[1].toLowerCase()] = a[3] ?? a[4] ?? a[5] ?? '';
    const rel = (attrs.rel || '').toLowerCase();
    for (const [name, value] of Object.entries(attrs)) {
      if (name === 'style') { checkCssText(value, m.index, lineOf, findings, `<${tag} style>`); allCss += value + '\n'; continue; }
      if (name.startsWith('on')) { checkJs(value, m.index, lineOf, findings, `<${tag} ${name}>`); continue; }
      const isHref = name === 'href' || name === 'action' || name === 'formaction';
      if (!LOAD_ATTRS.has(name) && !isHref) continue;
      const navigational = (name === 'href' && NAV_HREF.has(tag)) || name === 'action' || name === 'formaction';
      const values = name.endsWith('srcset') ? value.split(',').map(v => v.trim().split(/\s+/)[0]) : [value];
      for (const v of values) {
        if (HARMLESS.test(v)) continue;
        if (EXTERNAL.test(v)) {
          if (navigational) findings.fail.push(`line ${line}: <${tag} ${name}> links to ${v.slice(0, 80)} (games must not link out)`);
          else findings.fail.push(`line ${line}: <${tag}${rel ? ` rel=${rel}` : ''} ${name}> loads an external resource: ${v.slice(0, 80)}`);
        } else if (navigational) {
          findings.warn.push(`line ${line}: <${tag} ${name}="${v}"> points to another page`);
        } else {
          findings.fail.push(`line ${line}: <${tag} ${name}="${v}"> loads a local file (games must be a single file)`);
        }
      }
    }
    if (tag === 'iframe' || tag === 'frame' || tag === 'object' || tag === 'embed') {
      findings.fail.push(`line ${line}: <${tag}> is not allowed in a game`);
    }
    if (tag === 'meta' && /refresh/i.test(attrs['http-equiv'] || '') && EXTERNAL.test((attrs.content || '').replace(/^[^=]*=/, ''))) {
      findings.fail.push(`line ${line}: <meta http-equiv=refresh> navigates to an external URL`);
    }
  }

  let allJs = '', allCode = ''; // raw script text / script text with comments and strings blanked
  for (const s of scripts) {
    const type = (/\btype\s*=\s*["']?([^"'\s>]+)/i.exec(s.attrs) || [])[1] || '';
    if (/application\/(?:ld\+)?json|text\/(?:template|plain)/i.test(type)) continue;
    allCode += checkJs(s.body, s.bodyOffset, lineOf, findings, '<script>') + '\n';
    allJs += s.body + '\n';
  }

  if (findings.fail.length) for (const f of findings.fail) add('fail', 'no-external', f);
  else add('pass', 'no-external', 'no external or local resource loads found in HTML, CSS or JS');
  for (const f of findings.warn) add('warn', 'no-external', f);
  for (const f of findings.info) add('info', 'no-external', f);

  // [hidden] rule
  const cssNoComments = allCss.replace(/\/\*[\s\S]*?\*\//g, '');
  if (/\[hidden\][^{]*\{[^}]*display\s*:\s*none\s*!important/i.test(cssNoComments)) add('pass', 'hidden-rule', '[hidden] { display: none !important } is present');
  else add('fail', 'hidden-rule', 'CSS must contain [hidden] { display: none !important; } so overlays toggled with .hidden really hide');

  // spec skeleton hints (warnings only; the runtime checks are what really matter)
  const hints = [
    [/<meta[^>]+name=["']?viewport/i.test(doc), 'viewport meta tag'],
    [/<meta[^>]+charset/i.test(doc), 'charset meta tag'],
    [/window\.Platform\s*=\s*window\.Platform\s*\|\|/.test(allJs), 'Platform adapter (window.Platform = window.Platform || {...})'],
    [/demo/.test(allJs) && /location\.(?:search|href)|URLSearchParams/.test(allJs), '?demo=1 handling'],
    [/\bja\b/.test(allJs) && /\ben\b/.test(allJs), 'ja/en string table'],
    [/AudioContext/.test(allJs), 'WebAudio sound']
  ];
  for (const [ok, what] of hints) if (!ok) add('warn', 'spec', `could not find ${what}`);
  // localStorage must be wrapped in try/catch (it throws in some iframes / private modes)
  const lsRe = /localStorage/g;
  let unguarded = 0;
  while ((m = lsRe.exec(allCode))) {
    const before = allCode.slice(Math.max(0, m.index - 300), m.index);
    if (!/\btry\s*\{[^}]*$/.test(before)) unguarded++;
  }
  if (unguarded) add('warn', 'spec', `${unguarded} localStorage use(s) not obviously inside try { }`);

  // meta.json
  const { meta, error } = readMeta(gameDir);
  if (error) add('fail', 'meta', error);
  else {
    const { errors, warnings } = validateMeta(meta, dirName);
    if (errors.length) for (const e of errors) add('fail', 'meta', e);
    else add('pass', 'meta', `meta.json has all ${13} fields (week ${meta.week}, "${meta.slug}")`);
    for (const w of warnings) add('warn', 'meta', w);
  }
  return results;
}
