#!/usr/bin/env node
// QA for every game folder in games/ (wNN-<slug>), one after another, then a short summary.
//   node tools/qa-all.mjs          (same as: npm run qa:all)
// Runs tools/qa.mjs for each folder with the same Node binary, so it also works where npm scripts
// run in cmd.exe (Windows) and a shell loop would not.
// Exit code: 0 = every game passed (warnings allowed), 1 = at least one game failed, 2 = no games found.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(toolsDir, '..');
const gamesDir = path.join(repoDir, 'games');

if (process.argv.slice(2).some(a => a === '--help' || a === '-h')) {
  console.log('usage: node tools/qa-all.mjs   (runs node tools/qa.mjs on every games/wNN-<slug> folder)');
  process.exit(0);
}

const games = fs.existsSync(gamesDir)
  ? fs.readdirSync(gamesDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && /^w\d{2}-[a-z0-9]+(-[a-z0-9]+)*$/.test(d.name))
      .map(d => d.name)
      .sort()
  : [];

if (games.length === 0) {
  console.error(`qa-all: no game folders (wNN-<slug>) in ${gamesDir}`);
  process.exit(2);
}

const results = [];
for (const name of games) {
  console.log(`\n=== qa-all: games/${name} ===`);
  const r = spawnSync(process.execPath, [path.join(toolsDir, 'qa.mjs'), path.join('games', name)], { cwd: repoDir, stdio: 'inherit' });
  const code = r.error ? `error: ${r.error.message}` : r.status === null ? `signal ${r.signal}` : r.status;
  results.push({ name, ok: r.status === 0, code });
}

console.log('\n=== qa-all: summary ===');
for (const { name, ok, code } of results) console.log(`${ok ? 'PASSED' : 'FAILED'}  games/${name}${ok ? '' : ` (exit ${code})`}`);
const failed = results.filter(r => !r.ok).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
