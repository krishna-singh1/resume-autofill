/**
 * PDF text extraction, backed by the vendored Mozilla pdf.js build.
 *
 * pdf.js hands back positioned text runs, not lines. Since the resume parser
 * is line-oriented we regroup runs by their vertical position first —
 * otherwise a two-column header collapses into one unreadable string.
 */

import * as pdfjs from '../vendor/pdf.min.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('src/vendor/pdf.worker.min.mjs');

/** Text runs whose baselines differ by less than this belong to one line. */
const LINE_TOLERANCE = 3;
/** A horizontal gap this wide reads as column separation, not a word space. */
const COLUMN_GAP = 18;

function runsToLines(items) {
  const rows = [];

  for (const item of items) {
    if (!item.str) continue;
    const x = item.transform[4];
    const y = item.transform[5];
    const row = rows.find((candidate) => Math.abs(candidate.y - y) <= LINE_TOLERANCE);
    if (row) row.runs.push({ x, str: item.str, width: item.width || 0 });
    else rows.push({ y, runs: [{ x, str: item.str, width: item.width || 0 }] });
  }

  rows.sort((a, b) => b.y - a.y); // PDF origin is bottom-left

  return rows.map((row) => {
    row.runs.sort((a, b) => a.x - b.x);
    let line = '';
    let cursorEnd = null;
    for (const run of row.runs) {
      // LaTeX-style templates emit `\hfill` as one very wide space run, so a
      // wide whitespace run is itself a column break, not a word space.
      if (/^\s+$/.test(run.str)) {
        if (run.width > COLUMN_GAP) line += '   ';
        else if (!/\s$/.test(line)) line += ' ';
        cursorEnd = run.x + run.width;
        continue;
      }
      if (cursorEnd !== null) {
        const gap = run.x - cursorEnd;
        if (gap > COLUMN_GAP) line += '   ';
        else if (gap > 1 && !/\s$/.test(line) && !/^\s/.test(run.str)) line += ' ';
      }
      line += run.str;
      cursorEnd = run.x + run.width;
    }
    return line.replace(/\s+$/, '');
  });
}

/**
 * URLs behind link annotations. Icon-font resumes show a glyph plus a handle
 * ("in  jane-doe") with the real URL only in the annotation, so without this
 * LinkedIn/GitHub would be lost.
 */
async function linkUrls(page) {
  const annotations = await page.getAnnotations().catch(() => []);
  return annotations
    .filter((annotation) => annotation.subtype === 'Link' && typeof annotation.url === 'string')
    .map((annotation) => annotation.url.replace(/^mailto:/i, ''));
}

/** @param {ArrayBuffer} buffer @returns {Promise<string>} */
export async function extractPdfText(buffer) {
  const document = await pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false }).promise;
  const pages = [];
  const links = new Set();

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(runsToLines(content.items).join('\n'));
    for (const url of await linkUrls(page)) links.add(url);
    page.cleanup();
  }

  await document.destroy();
  const text = pages.join('\n\n');
  return links.size ? `${text}\n\nLinks: ${[...links].join('  ')}` : text;
}
