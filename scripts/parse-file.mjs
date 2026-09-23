/**
 * Dev tool: run a real resume through the extension's own extraction and
 * parsing code (pdf.js inside an extension page, then parser.js) and print
 * what the profile editor would be pre-filled with.
 *
 *   node scripts/parse-file.mjs ~/Downloads/resume.pdf [--text]
 *
 * --text also prints the extracted plain text, which is what to look at when
 * the parser gets something wrong.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { launchWithExtension } from '../tests/e2e/browser.mjs';

const [, , filePath, ...flags] = process.argv;
if (!filePath) {
  console.error('usage: node scripts/parse-file.mjs <resume.pdf|.docx|.txt> [--text]');
  process.exit(2);
}

const bytes = readFileSync(filePath).toString('base64');
const name = path.basename(filePath);
const browser = await launchWithExtension();

try {
  const page = await browser.cdp.openPage(`chrome-extension://${browser.extensionId}/src/ui/options.html`);
  const result = await browser.cdp.evaluate(page.session, `(async () => {
    const [{ extractPdfText }, { extractDocxText }, { parseResumeText }] = await Promise.all([
      import('../core/pdf.js'), import('../core/docx.js'), import('../core/parser.js'),
    ]);
    const buffer = Uint8Array.from(atob(${JSON.stringify(bytes)}), (c) => c.charCodeAt(0)).buffer;
    const name = ${JSON.stringify(name.toLowerCase())};
    const started = performance.now();
    const text = name.endsWith('.pdf') ? await extractPdfText(buffer)
      : name.endsWith('.docx') ? await extractDocxText(buffer)
      : new TextDecoder().decode(buffer);
    const extractMs = Math.round(performance.now() - started);
    const parsed = parseResumeText(text);
    return { text, extractMs, ...parsed };
  })()`);

  if (flags.includes('--text')) {
    console.log('──── extracted text ────');
    console.log(result.text);
    console.log('────────────────────────\n');
  }

  const { profile, warnings } = result;
  console.log(`${name} · ${result.text.length} chars extracted in ${result.extractMs} ms via ${browser.browserName}\n`);
  console.log('Basics  ', JSON.stringify(profile.basics, null, 2));
  console.log('Links   ', JSON.stringify(profile.links));
  console.log(`\nWork (${profile.work.length})`);
  for (const entry of profile.work) {
    console.log(`  • ${entry.title || '?'} @ ${entry.company || '?'}  [${entry.startDate || '?'} → ${entry.current ? 'present' : entry.endDate || '?'}]${entry.location ? `  ${entry.location}` : ''}`);
    for (const highlight of entry.highlights) console.log(`      - ${highlight.slice(0, 110)}${highlight.length > 110 ? '…' : ''}`);
  }
  console.log(`\nEducation (${profile.education.length})`);
  for (const entry of profile.education) {
    console.log(`  • ${entry.degree || '?'}${entry.field ? ` in ${entry.field}` : ''} — ${entry.school || '?'}  [${entry.startDate || '?'} → ${entry.endDate || '?'}]${entry.gpa ? `  GPA ${entry.gpa}` : ''}`);
  }
  console.log(`\nSkills (${profile.skills.length})  ${profile.skills.join(', ')}`);
  console.log(`\nProjects (${profile.projects.length})`);
  for (const project of profile.projects) console.log(`  • ${project.name}${project.url ? `  ${project.url}` : ''}`);
  console.log(`\nWarnings: ${warnings.length ? warnings.map((w) => `\n  ! ${w}`).join('') : 'none'}`);
} finally {
  browser.close();
}
