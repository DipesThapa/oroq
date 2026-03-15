import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
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
