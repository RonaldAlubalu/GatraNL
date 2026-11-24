// Makes the smaller copies of the photos in public/img that the pages offer to phones (name-<width>.webp).
// Only needed after adding or replacing a photo. Run: npm install --no-save sharp && node images.mjs
import sharp from 'sharp';
import { existsSync } from 'node:fs';

const sizes = {
  hero: [400, 642],
  'aan-het-werk': [480, 800],
  'wie-ik-ben': [480, 800],
  'wie-ben-ik': [480, 800, 1200],
  gesprek: [800, 1400],
  spelalfabet: [520],
  logo: [168],
};
for (const [name, widths] of Object.entries(sizes)) {
  for (const width of widths) {
    const out = `public/img/${name}-${width}.webp`;
    if (existsSync(out) && !process.argv.includes('--again')) continue;
    const info = await sharp(`public/img/${name}.webp`).resize({ width, withoutEnlargement: true }).webp({ quality: 80 }).toFile(out);
    console.log(out, Math.round(info.size / 1024) + ' kB');
  }
}
