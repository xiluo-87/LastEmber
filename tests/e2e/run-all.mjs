// Runs every e2e script one after another (each starts its own server + browser) and prints a summary. Exit code 1 if any failed.
// Usage: node tests/e2e/run-all.mjs [name ...]     (names without .mjs; default = all)
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const ALL = ['smoke', 'gather-craft', 'building', 'creatures', 'survival', 'endgame', 'panels-fit', 'compass', 'audio-levels', 'persistence', 'robustness', 'embed', 'playthrough'];
const names = process.argv.slice(2).length ? process.argv.slice(2) : ALL;
const results = [];
for (const n of names) {
  const t0 = Date.now();
  const r = spawnSync('node', [path.join(dir, `${n}.mjs`)], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 20 * 60 * 1000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const fails = out.split('\n').filter((l) => /FAIL:/.test(l));
  results.push({ n, ok: r.status === 0, secs: ((Date.now() - t0) / 1000).toFixed(0), fails });
  console.log(`${r.status === 0 ? 'PASS' : 'FAIL'}  ${n}  (${results.at(-1).secs}s)`);
  for (const f of fails.slice(0, 6)) console.log(`      ${f.trim()}`);
  if (r.status !== 0 && !fails.length) console.log(out.split('\n').slice(-12).map((l) => `      ${l}`).join('\n'));
}
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} e2e scripts passed${bad.length ? `; failed: ${bad.map((b) => b.n).join(', ')}` : ''}`);
process.exit(bad.length ? 1 : 0);
