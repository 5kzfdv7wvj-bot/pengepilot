import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const out = path.join(root, 'www');

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const rootEntries = await readdir(root, { withFileTypes: true });
const htmlFiles = rootEntries
  .filter(entry => entry.isFile() && entry.name.endsWith('.html'))
  .map(entry => entry.name);

if (!htmlFiles.includes('index.html') || !htmlFiles.includes('login.html')) {
  throw new Error('PengePilot web entrypoints are missing. Refusing to build an incomplete native bundle.');
}

for (const file of htmlFiles) {
  await cp(path.join(root, file), path.join(out, file));
}

for (const dir of ['assets']) {
  const source = path.join(root, dir);
  try {
    const info = await stat(source);
    if (info.isDirectory()) await cp(source, path.join(out, dir), { recursive: true });
  } catch {
    throw new Error(`Required web directory is missing: ${dir}`);
  }
}

console.log(`Prepared PengePilot native web bundle with ${htmlFiles.length} HTML pages in ${path.relative(root, out)}/`);
