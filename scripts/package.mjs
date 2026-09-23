/**
 * Builds the Chrome Web Store upload: dist/resume-autofill-<version>.zip
 * containing only what the extension needs at runtime.
 *
 *   npm run package            build (refuses if this version was already packaged)
 *   npm run package -- --force rebuild the same version
 *   npm run package -- --verify also load the unzipped build in a headless browser
 *
 * The store rejects re-uploads of an existing version, so the version check
 * catches a forgotten bump before the upload does.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const INCLUDE = ['manifest.json', 'icons', 'src'];
/** The store's hard limit is far higher; this just flags an accidental blob. */
const SIZE_WARNING_BYTES = 5 * 1024 * 1024;

const flags = new Set(process.argv.slice(2));
const run = (command, args, options = {}) => execFileSync(command, args, { cwd: ROOT, stdio: 'inherit', ...options });

const manifest = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const { version } = manifest;

if (!/^\d+(\.\d+){0,3}$/.test(version)) {
  console.error(`manifest version "${version}" is not a valid Chrome version (1-4 dot-separated integers).`);
  process.exit(1);
}
if (pkg.version !== version) {
  console.error(`package.json version (${pkg.version}) and manifest.json version (${version}) differ — bump both.`);
  process.exit(1);
}

const zipPath = path.join(DIST, `resume-autofill-${version}.zip`);
if (existsSync(zipPath) && !flags.has('--force')) {
  console.error(`${path.relative(ROOT, zipPath)} already exists. Bump "version" in manifest.json and package.json, or pass --force.`);
  process.exit(1);
}

console.log('› syntax + manifest check');
run(process.execPath, ['scripts/check-syntax.mjs']);
console.log('› unit tests');
run(process.execPath, ['--test', 'tests/*.test.js'], { stdio: 'pipe' });

mkdirSync(DIST, { recursive: true });
rmSync(zipPath, { force: true });
run('zip', ['-q', '-r', '-X', zipPath, ...INCLUDE, '-x', '*.DS_Store', '*/.*']);

const listing = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' }).trim().split('\n');
const stray = listing.filter((entry) => !INCLUDE.some((root) => entry === root || entry.startsWith(`${root}/`)));
if (stray.length) {
  console.error(`Unexpected files in the zip:\n  ${stray.join('\n  ')}`);
  process.exit(1);
}

const bytes = Number(execFileSync('stat', ['-f%z', zipPath], { encoding: 'utf8' }).trim());
console.log(`\n✓ ${path.relative(ROOT, zipPath)}  ${(bytes / 1024).toFixed(0)} KB, ${listing.filter((e) => !e.endsWith('/')).length} files`);
if (bytes > SIZE_WARNING_BYTES) console.warn('  ! larger than expected — check nothing extra was bundled');

if (flags.has('--verify')) {
  const unpacked = mkdtempSync(path.join(tmpdir(), 'resume-autofill-pkg-'));
  try {
    execFileSync('unzip', ['-q', zipPath, '-d', unpacked]);
    const { launchWithExtension } = await import('../tests/e2e/browser.mjs');
    const browser = await launchWithExtension({ extensionPath: unpacked });
    try {
      const page = await browser.cdp.openPage(`chrome-extension://${browser.extensionId}/src/ui/popup.html`);
      const status = await browser.cdp.evaluate(page.session, `new Promise((r) => setTimeout(() => r(document.getElementById('status').textContent), 500))`);
      console.log(`✓ packaged build loads in ${browser.browserName}; popup says: "${status}"`);
    } finally {
      browser.close();
    }
  } finally {
    rmSync(unpacked, { recursive: true, force: true });
  }
}

console.log('\nUpload at https://chrome.google.com/webstore/devconsole — listing text is in store/listing.md');
