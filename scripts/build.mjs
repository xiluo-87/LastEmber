// Bundles src/main.js with esbuild and inlines JS + CSS into ONE dist/index.html.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const js = await build({
  entryPoints: [path.join(root, 'src/main.js')], bundle: true, minify: true, write: false,
  format: 'iife', target: 'es2020', legalComments: 'none',
});
const css = await build({
  entryPoints: [path.join(root, 'src/ui/style.css')], bundle: true, minify: true, write: false,
});
const safe = (s) => s.replace(/<\/(script|style)/gi, '<\\/$1');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html
  .replace(/<link[^>]*href="[^"]*style\.css"[^>]*>/, () => `<style>${safe(css.outputFiles[0].text)}</style>`)
  .replace(/<script[^>]*src="[^"]*main\.js"[^>]*><\/script>/, () => `<script>${safe(js.outputFiles[0].text)}</script>`);
if (/src="[^"]*main\.js"|href="[^"]*style\.css"/.test(html)) throw new Error('inlining failed');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/index.html'), html);
console.log(`dist/index.html  ${(html.length / 1024).toFixed(1)} KB`);
