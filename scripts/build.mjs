import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');

const TARGETS = new Set(['chromium', 'firefox', 'safari']);

function usage() {
  // eslint-disable-next-line no-console
  console.log('Usage: node scripts/build.mjs <chromium|firefox|safari>');
}

async function readJson(filePath) {
  const text = await readFile(filePath, 'utf8');
  return JSON.parse(text);
}

function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!existsSync(envPath)) return {};
  const vars = {};
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return vars;
}

async function injectSecrets(targetDir, env) {
  const bgPath = path.join(targetDir, 'src', 'background.js');
  let src = await readFile(bgPath, 'utf8');
  for (const [key, val] of Object.entries(env)) {
    src = src.replaceAll(`__${key}__`, val);
  }
  await writeFile(bgPath, src, 'utf8');
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

  const env = loadEnv();
  await injectSecrets(outDir, env);

  if (target === 'chromium') {
    await cp(path.join(ROOT, 'manifest.json'), path.join(outDir, 'manifest.json'));
    // eslint-disable-next-line no-console
    console.log('✓ Chromium build ready at dist/chromium');
    return;
  }

  if (target === 'firefox') {
    const manifest = await readJson(path.join(ROOT, 'manifests', 'firefox.json'));
    await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    // eslint-disable-next-line no-console
    console.log('✓ Firefox build ready at dist/firefox');
    // eslint-disable-next-line no-console
    console.log('  Load in Firefox: about:debugging → This Firefox → Load Temporary Add-on → select dist/firefox/manifest.json');
    return;
  }

  if (target === 'safari') {
    // Safari uses the same Chromium MV3 manifest — xcrun converts it
    await cp(path.join(ROOT, 'manifest.json'), path.join(outDir, 'manifest.json'));
    // eslint-disable-next-line no-console
    console.log('✓ Safari source ready at dist/safari');
    // eslint-disable-next-line no-console
    console.log('');
    // eslint-disable-next-line no-console
    console.log('  Next step — run this command to generate the Xcode project:');
    // eslint-disable-next-line no-console
    console.log('');
    // eslint-disable-next-line no-console
    console.log('  xcrun safari-web-extension-converter dist/safari \\');
    // eslint-disable-next-line no-console
    console.log('    --app-name "Safeguard" \\');
    // eslint-disable-next-line no-console
    console.log('    --bundle-identifier co.cyberheroez.safeguard \\');
    // eslint-disable-next-line no-console
    console.log('    --swift --macos-only');
    // eslint-disable-next-line no-console
    console.log('');
    // eslint-disable-next-line no-console
    console.log('  Then open the .xcodeproj in Xcode, build, and enable in Safari → Settings → Extensions.');
  }
}

await main();
