import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const result = await build({
  entryPoints: [resolve(root, 'src/app.js')],
  bundle: true,
  loader: { '.webp': 'dataurl' },
  write: false,
  format: 'iife',
  target: ['chrome109', 'edge109', 'safari16'],
  minify: true,
  legalComments: 'inline',
  charset: 'utf8',
});

const [shell, styles, favicon, cover, license] = await Promise.all([
  readFile(resolve(root, 'src/shell.html'), 'utf8'),
  readFile(resolve(root, 'src/styles.css'), 'utf8'),
  readFile(resolve(root, 'src/favicon.svg'), 'utf8'),
  readFile(resolve(root, 'src/art/toy-theatre.webp')),
  readFile(resolve(root, 'node_modules/three/LICENSE'), 'utf8'),
]);

const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
await writeFile(resolve(root, 'favicon.svg'), favicon);

const html = shell
  .replace('COVER_ART_DATA', () => 'data:image/webp;base64,' + cover.toString('base64'))
  .replace('/* APP_STYLES */', () => styles)
  .replace('/* APP_SCRIPT */', () => js)
  .replace('<!-- THIRD_PARTY_LICENSE -->', () => `<!-- Three.js license\n${license}\n-->`);

await writeFile(resolve(root, 'index.html'), html);
console.log(`Built index.html (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB). Publish with favicon.svg and audio/ directory.`);
