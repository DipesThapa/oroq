import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');

const TARGETS = new Set(['chromium', 'firefox']);

function usage() {
  // eslint-disable-next-line no-console
  console.log('Usage: node scripts/build.mjs <chromium|firefox>');
}

async function readJson(filePath) {
  const text = await readFile(filePath, 'utf8');
  return JSON.parse(text);
}

async function ensureEmptyDir(dirPath) {
  await rm(dirPath, { recursive: true, force: true });
  await mkdir(dirPath, { recursive: true });
}

async function copyInto(targetDir) {
  const items = [
    'assets',
    'data',
    'site',
    'src',
    'LICENSE',
    'README.md'
  ];
  for (const item of items) {
    await cp(path.join(ROOT, item), path.join(targetDir, item), { recursive: true });
  }
}

async function main() {
  const target = (process.argv[2] || '').trim().toLowerCase();
  if (!TARGETS.has(target)) {
    usage();
    process.exit(1);
  }

  await mkdir(DIST, { recursive: true });

  const outDir = path.join(DIST, target);
  await ensureEmptyDir(outDir);
  await copyInto(outDir);

  if (target === 'chromium') {
    await cp(path.join(ROOT, 'manifest.json'), path.join(outDir, 'manifest.json'));
    return;
  }

  if (target === 'firefox') {
    const manifest = await readJson(path.join(ROOT, 'manifests', 'firefox.json'));
    await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  }
}

await main();

