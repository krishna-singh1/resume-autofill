/**
 * Parses every first-party script and validates manifest.json, so a typo in a
 * browser-only module (which the Node unit tests cannot import) is caught
 * before "Load unpacked" reports a cryptic error.
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function* scripts(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (name === 'vendor' || name === 'node_modules') continue;
    if (statSync(full).isDirectory()) yield* scripts(full);
    else if (/\.(m?js)$/.test(name)) yield full;
  }
}

let problems = 0;

for (const file of scripts(path.join(ROOT, 'src'))) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    problems += 1;
    console.error(`✗ ${path.relative(ROOT, file)}\n${error.stderr}`);
  }
}

const manifest = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const referenced = [
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  manifest.options_ui?.page,
  ...Object.values(manifest.icons || {}),
  ...Object.values(manifest.action?.default_icon || {}),
];
for (const file of referenced) {
  if (!existsSync(path.join(ROOT, file))) {
    problems += 1;
    console.error(`✗ manifest.json references missing file: ${file}`);
  }
}

if (problems) {
  console.error(`\n${problems} problem(s)`);
  process.exit(1);
}
console.log('All scripts parse and manifest references resolve.');
