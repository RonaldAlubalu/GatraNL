// Puts the pages in src/pages into the layout and writes them to public/.
// Run: node build.mjs            (add "serve" to also look at the result on http://localhost:8090)
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');
const layout = read('src/layout.html');
// The address the pages call their own. The deploy sets the test address until gatra.nl points at the server.
const site = (process.env.SITE_URL || 'https://gatra.nl').replace(/\/$/, '');

// Photos that have smaller copies (name-<width>.webp, made by images.mjs) are offered in every size.
const imageFiles = readdirSync(join(root, 'public/img'));
const withSizes = (html) => html.replace(/<img\b[^>]*>/g, (tag) => {
  const name = tag.match(/src="\/img\/([\w-]+)\.webp"/)?.[1];
  if (!name || tag.includes('srcset')) return tag;
  const widths = imageFiles.map((f) => f.match(new RegExp(`^${name}-(\\d+)\\.webp$`))?.[1]).filter(Boolean).map(Number).sort((a, b) => a - b);
  if (!widths.length) return tag;
  const full = Number(tag.match(/width="(\d+)"/)?.[1]);
  const set = widths.map((w) => `/img/${name}-${w}.webp ${w}w`);
  if (full > widths.at(-1)) set.push(`/img/${name}.webp ${full}w`);
  const sizes = tag.includes('sizes=') ? '' : ' sizes="100vw"';
  return tag.replace('<img', `<img srcset="${set.join(', ')}"${sizes}`);
});
const paths = [];


for (const file of readdirSync(join(root, 'src/pages'))) {
  const slug = file.replace(/\.html$/, '');
  const source = read(`src/pages/${file}`);
  const meta = JSON.parse(source.match(/^<!--\s*(\{.*\})\s*-->/)[1]);
  const content = source.replace(/^<!--.*-->\n/, '').replace(/\{\{> (\w+)\}\}/g, (_, name) => read(`src/${name}.html`).trim());
  const path = slug === 'index' ? '/' : `/${slug}/`;
  paths.push(path);
  const html = withSizes(layout
    .replaceAll('{{title}}', meta.title)
    .replaceAll('{{description}}', meta.description)
    .replaceAll('{{site}}', site)
    .replaceAll('{{path}}', path)
    .replace('{{year}}', new Date().getFullYear())
    .replace('{{slug}}', slug === 'index' ? 'home' : slug)
    .replace(/\{\{nav:([\w-]+)\}\}/g, (_, name) => (name === slug ? ' aria-current="page"' : ''))
    .replace('{{content}}', content.trim()));
  const out = slug === 'index' ? 'public/index.html' : `public/${slug}/index.html`;
  mkdirSync(dirname(join(root, out)), { recursive: true });
  writeFileSync(join(root, out), html);
  console.log('written', out);
}

// For search engines: the list of pages, and where to find it.
writeFileSync(join(root, 'public/sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.sort().map((p) => `  <url><loc>${site}${p}</loc></url>`).join('\n')}\n</urlset>\n`);
writeFileSync(join(root, 'public/robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`);

if (process.argv[2] === 'serve') {
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.xml': 'application/xml', '.txt': 'text/plain' };
  createServer((req, res) => {
    let path = join(root, 'public', decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'index.html');
    if (!existsSync(path)) { res.writeHead(404); res.end('Niet gevonden'); return; }
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
    res.end(readFileSync(path));
  }).listen(8090, () => console.log('http://localhost:8090'));
}
