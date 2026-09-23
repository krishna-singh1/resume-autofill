/**
 * End-to-end test: loads the unpacked extension into a real headless Chrome,
 * seeds a profile through the service worker, and fills the mock forms in
 * tests/fixtures/forms over the DevTools protocol.
 *
 *   node tests/e2e/run.mjs            (or: npm run test:e2e)
 *   CHROME_PATH=/path/to/chrome node tests/e2e/run.mjs
 *
 * Requires Chrome >= 116 and Node >= 22 (global WebSocket). No npm packages.
 */

import { existsSync, readFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import { freePort, launchWithExtension, ROOT, waitUntil } from './browser.mjs';

const FORMS = path.join(ROOT, 'tests/fixtures/forms');
// ------------------------------------------------------------------ helpers

let failures = 0;
let passes = 0;

function check(condition, message, detail) {
  if (condition) {
    passes += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${message}${detail === undefined ? '' : `\n      got: ${JSON.stringify(detail)}`}`);
  }
}

function equal(actual, expected, message) {
  check(actual === expected, `${message} (= ${JSON.stringify(expected)})`, actual);
}

// ------------------------------------------------------------ static server

function serveForms(port) {
  const server = http.createServer((request, response) => {
    // /grnhse/... lets the greenhouse site rule trigger on localhost.
    const cleaned = request.url.split('?')[0].replace(/^\/grnhse/, '');
    const file = path.join(FORMS, path.normalize(cleaned).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(FORMS) || !existsSync(file)) {
      response.writeHead(404).end('not found');
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

// ------------------------------------------------------------- test data

const PROFILE = {
  basics: {
    firstName: 'Priya',
    lastName: 'Raman',
    email: 'priya.raman@example.com',
    phone: '+1 415 555 0142',
    city: 'Austin',
    state: 'TX',
    country: 'United States',
    summary: 'Backend engineer who likes ledgers.',
  },
  links: { linkedin: 'https://linkedin.com/in/priyaraman', github: 'https://github.com/priyar', portfolio: 'https://priyaraman.dev' },
  work: [
    { company: 'Stripe', title: 'Senior Software Engineer', startDate: '2021-01', current: true, highlights: [] },
    { company: 'Square', title: 'Software Engineer', startDate: '2018-03', endDate: '2020-12', highlights: [] },
  ],
  education: [{ school: 'UC Berkeley', degree: 'B.S.', field: 'Computer Science', endDate: '2018-05' }],
  skills: ['Go', 'Kubernetes'],
  application: { coverLetter: 'I would love to work here.', availableStartDate: '2026-10-01' },
  workAuth: { authorized: 'Yes', requiresSponsorship: 'No' },
  eeo: { gender: 'Female' },
};

const RESUME_FILE = {
  name: 'priya-raman.pdf',
  type: 'application/pdf',
  size: 12,
  dataUrl: `data:application/pdf;base64,${Buffer.from('%PDF-1.4 stub').toString('base64')}`,
};

const LEARNED = [
  {
    id: 'la_test_1',
    question: 'which time zone are you in',
    display: 'Which time zone are you in?',
    aliases: [],
    kind: 'text',
    value: 'Asia/Kolkata',
    scope: 'global',
    sites: ['boards.greenhouse.io'],
    createdAt: '2026-01-01T00:00:00.000Z',
    lastUsedAt: '2026-01-01T00:00:00.000Z',
    useCount: 0,
  },
];

/**
 * A minimal but well-formed single-page PDF. Each line is a string, or
 * `[left, right]` to place `right` at the far column like a LaTeX `\hfill`.
 * `links` become Link annotations, the way icon-font resumes carry URLs.
 */
function tinyPdf(lines, links = []) {
  const esc = (text) => text.replace(/[()\\]/g, '\\$&');
  const ops = lines.map((line, i) => {
    const down = i ? '0 -18 Td ' : '';
    if (Array.isArray(line)) {
      // Right column at x=400: absolute positioning via a second text matrix.
      return `${down}(${esc(line[0])}) Tj ET BT /F1 12 Tf 400 ${720 - i * 18} Td (${esc(line[1])}) Tj ET BT /F1 12 Tf 72 ${720 - i * 18} Td`;
    }
    return `${down}(${esc(line)}) Tj`;
  });
  const content = `BT /F1 12 Tf 72 720 Td ${ops.join(' ')} ET`;
  const annots = links.map((_, i) => `${6 + i} 0 R`).join(' ');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> ${links.length ? `/Annots [${annots}]` : ''} >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...links.map((url, i) => `<< /Type /Annot /Subtype /Link /Rect [72 ${700 - i * 18} 200 ${712 - i * 18}] /Border [0 0 0] /A << /S /URI /URI (${esc(url)}) >> >>`),
  ];
  let body = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1').toString('base64');
}

// -------------------------------------------------------------- harness

async function main() {
  const httpPort = await freePort();
  const server = await serveForms(httpPort);
  const base = `http://127.0.0.1:${httpPort}`;

  let browser;
  try {
    browser = await launchWithExtension();
  } catch (error) {
    console.error(error.message);
    server.close();
    process.exit(2);
  }
  const { cdp, extensionId, serviceWorker: sw } = browser;
  console.log(`\nExtension ${extensionId} loaded in ${browser.browserName}`);

  const cleanup = () => {
    browser.close();
    server.close();
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => process.exit(130));

  try {
    const seed = (state) => cdp.evaluate(sw, `chrome.storage.local.clear().then(() => chrome.storage.local.set(${JSON.stringify(state)})).then(() => true)`);

    /** Trigger the same injection the popup uses, via the service worker. */
    const fill = (url, options = {}) => cdp.evaluate(sw, `(async () => {
      const [tab] = await chrome.tabs.query({ url: ${JSON.stringify(url)} });
      const injections = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        args: [chrome.runtime.getURL('src/content/autofill.js'), ${JSON.stringify(options)}],
        func: async (moduleUrl, runOptions) => (await import(moduleUrl)).runAutofill(runOptions),
      });
      return injections.map((injection) => injection.result).filter(Boolean);
    })()`);

    const readForm = (session) => cdp.evaluate(session, `(() => {
      const out = {};
      for (const el of document.querySelectorAll('input, select, textarea')) {
        const key = el.id || el.name;
        if (el.type === 'radio' || el.type === 'checkbox') { if (el.checked) out[el.name] = el.value; else out[el.name] ??= ''; }
        else if (el.type === 'file') out[key] = el.files.length ? el.files[0].name : '';
        else out[key] = el.value;
      }
      return out;
    })()`);

    // ---------------------------------------------------------- scenario A
    console.log('\nA. Generic form: profile + learned answer + resume file');
    await seed({ profile: PROFILE, 'file:resume': RESUME_FILE, learnedAnswers: LEARNED });
    {
      const url = `${base}/generic.html`;
      const page = await cdp.openPage(url);
      const [report] = await fill(url);
      const form = await readForm(page.session);

      equal(form.fn, 'Priya', 'first name via label[for]');
      equal(form.ln, 'Raman', 'last name');
      equal(form.email_addr, 'priya.raman@example.com', 'email via wrapping label');
      equal(form.email_confirm, '', 'confirm email left blank');
      equal(form.p, '+1 415 555 0142', 'phone via aria-label');
      equal(form.loc_city, 'Austin', 'city via ancestor label');
      equal(form.country, 'US', 'country select by fuzzy option text');
      equal(form.li, 'https://linkedin.com/in/priyaraman', 'linkedin');
      equal(form.web, '', 'company website left blank');
      equal(form.c1, 'Stripe', 'work[0].company');
      equal(form.t1, 'Senior Software Engineer', 'work[0].title');
      equal(form.s1, '2021-01', 'work[0].startDate as month input');
      equal(form.c2, 'Square', 'work[1].company');
      equal(form.t2, 'Software Engineer', 'work[1].title');
      equal(form.s2, '2018-03', 'work[1].startDate');
      equal(form.school, 'UC Berkeley', 'education school');
      equal(form.degree, 'B.S.', 'education degree');
      equal(form.auth, 'yes', 'work authorisation radio');
      equal(form.sponsor, 'n', 'sponsorship radio');
      equal(form.avail, '2026-10-01', 'available start date (not confused with work start)');
      equal(form.cover, 'I would love to work here.', 'cover letter textarea');
      equal(form.resume, 'priya-raman.pdf', 'resume file attached');
      equal(form.tz, 'Asia/Kolkata', 'custom question filled from learned answer');
      equal(form.colour, '', 'unknown question left blank');
      equal(form.gender, '', 'EEO untouched while fillEEO is off');

      const learnedResult = report.results.find((result) => result.source === 'learned');
      check(learnedResult?.status === 'filled' && learnedResult.question === 'Which time zone are you in?', 'report attributes the learned answer to its question', learnedResult);
      check(report.results.some((result) => result.key === 'eeo.gender' && result.status === 'skipped'), 'report explains the EEO skip');

      const used = await cdp.evaluate(sw, `chrome.storage.local.get('learnedAnswers').then((s) => s.learnedAnswers[0])`);
      equal(used.useCount, 1, 'learned answer usage recorded');
      check(used.sites.includes('127.0.0.1'), 'learned answer records the new site', used.sites);

      // Capture: type into the leftover field and expect a pending capture shortly after.
      await cdp.evaluate(page.session, `(() => {
        const el = document.getElementById('colour');
        el.value = 'Blue';
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`);
      const pending = await waitUntil(
        () => cdp.evaluate(sw, `chrome.storage.local.get('pendingCaptures').then((s) => (s.pendingCaptures?.length ? s.pendingCaptures : null))`),
        { label: 'pending capture after change', timeout: 5000 },
      ).catch(() => []);
      check(pending.some((capture) => capture.question === 'favourite colour' && capture.value === 'Blue'), 'answer typed into a leftover field is offered for remembering', pending);
      check(!pending.some((capture) => capture.question === 'first name'), 'profile-covered fields are not captured', pending.map((capture) => capture.question));
      await cdp.closePage(page.targetId);
    }

    // ---------------------------------------------------------- scenario B
    console.log('\nB. Preview (dry run) touches nothing');
    {
      const url = `${base}/generic.html`;
      const page = await cdp.openPage(url);
      const [report] = await fill(url, { dryRun: true });
      const form = await readForm(page.session);
      equal(form.fn, '', 'first name still empty after dry run');
      equal(form.resume, '', 'no file attached after dry run');
      check(report.results.filter((result) => result.status === 'would-fill').length >= 20, 'dry-run report lists what would be filled', report.results.length);
      await cdp.closePage(page.targetId);
    }

    // ---------------------------------------------------------- scenario C
    console.log('\nC. Collect mode finds answers the profile could not cover');
    {
      const url = `${base}/generic.html`;
      const page = await cdp.openPage(url);
      await cdp.evaluate(page.session, `(document.getElementById('colour').value = 'Green', document.getElementById('fn').value = 'Someone', true)`);
      const [report] = await fill(url, { collect: true });
      const questions = report.captures.map((capture) => capture.question);
      check(questions.includes('favourite colour'), 'captures the unknown question', questions);
      check(!questions.includes('first name'), 'does not capture profile-covered fields', questions);
      check(!questions.includes('which time zone are you in'), 'does not re-capture an already learned question', questions);
      await cdp.closePage(page.targetId);
    }

    // ---------------------------------------------------------- scenario D
    console.log('\nD. Greenhouse markup uses the site rule');
    {
      const url = `${base}/grnhse/greenhouse.html`;
      const page = await cdp.openPage(url);
      const [report] = await fill(url);
      const form = await readForm(page.session);
      equal(report.siteRule, 'greenhouse', 'site rule detected');
      equal(form.first_name, 'Priya', 'first_name via rule');
      equal(form.last_name, 'Raman', 'last_name via rule');
      equal(form.email, 'priya.raman@example.com', 'email via rule (input is type=text)');
      equal(form.phone, '+1 415 555 0142', 'phone via rule');
      equal(form.job_application_location, 'Austin', 'location via rule');
      equal(form.resume, 'priya-raman.pdf', 'resume via rule');
      equal(form.job_application_answers_attributes_0_text_value, 'https://linkedin.com/in/priyaraman', 'custom LinkedIn question via matcher');
      equal(form.job_application_answers_attributes_1_text_value, 'https://priyaraman.dev', 'custom Website question via matcher');
      equal(form.job_application_answers_attributes_2_boolean_value, '1', 'work auth select picks Yes');
      check(report.results.filter((result) => result.source === 'greenhouse').length >= 6, 'rule-sourced results are attributed');
      await cdp.closePage(page.targetId);
    }

    // ---------------------------------------------------------- scenario E
    console.log('\nE. React-style controlled inputs see the new value');
    {
      const url = `${base}/controlled.html`;
      const page = await cdp.openPage(url);
      await fill(url);
      const state = await cdp.evaluate(page.session, `(() => Object.fromEntries([...document.querySelectorAll('[data-state]')].map((el) => [el.id, el.dataset.state])))()`);
      equal(state.first, 'Priya', 'controlled input state updated');
      equal(state.email, 'priya.raman@example.com', 'controlled email state updated');
      equal(state.about, 'Backend engineer who likes ledgers.', 'controlled textarea state updated');
      await cdp.closePage(page.targetId);
    }

    // ---------------------------------------------------------- scenario F
    console.log('\nF. Settings: EEO on, overwrite off');
    await seed({ profile: PROFILE, settings: { fillEEO: true, overwriteExisting: false } });
    {
      const url = `${base}/generic.html`;
      const page = await cdp.openPage(url);
      await cdp.evaluate(page.session, `(document.getElementById('fn').value = 'Existing', true)`);
      const [report] = await fill(url);
      const form = await readForm(page.session);
      equal(form.gender, 'f', 'gender radio filled when EEO enabled');
      equal(form.fn, 'Existing', 'pre-filled value preserved when overwrite is off');
      check(report.results.some((result) => result.key === 'basics.firstName' && result.reason === 'already filled'), 'report explains the preserved field');
      equal(form.resume, '', 'no resume attached when none is stored');
      await cdp.closePage(page.targetId);
    }

    // ---------------------------------------------------------- scenario G
    console.log('\nG. Extension pages: options import (PDF via pdf.js), resume builder, popup');
    await seed({});
    {
      const options = await cdp.openPage(`chrome-extension://${extensionId}/src/ui/options.html`);
      await waitUntil(() => cdp.evaluate(options.session, `document.getElementById('save-state').textContent.includes('saved')`), { label: 'options page init' });

      const pdf = tinyPdf(
        [
          'Priya Raman',
          'Austin, TX | priya.raman@example.com | (415) 555-0142',
          'EXPERIENCE',
          ['Stripe', 'Jan 2021 - Present'],
          ['Senior Engineer', 'San Francisco, CA'],
          'SKILLS',
          'Go, Kubernetes',
        ],
        ['https://linkedin.com/in/priyaraman', 'https://github.com/priyar'],
      );
      await cdp.evaluate(options.session, `(() => {
        const bytes = Uint8Array.from(atob(${JSON.stringify(pdf)}), (c) => c.charCodeAt(0));
        const file = new File([bytes], 'priya.pdf', { type: 'application/pdf' });
        const transfer = new DataTransfer();
        transfer.items.add(file);
        const input = document.getElementById('resume-file');
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`);
      const status = await waitUntil(
        () => cdp.evaluate(options.session, `(() => { const t = document.getElementById('parse-status').textContent; return /Found:|Could not/.test(t) ? t : null; })()`),
        { label: 'PDF parse status', timeout: 20000 },
      );
      check(/Found:.*name.*email/.test(status), 'PDF parsed through pdf.js worker inside the extension page', status);
      check(/1 role/.test(status), 'PDF experience section parsed', status);

      await cdp.evaluate(options.session, `(document.getElementById('apply-parsed').click(), true)`);
      equal(await cdp.evaluate(options.session, `document.querySelector('[data-path="basics.firstName"]').value`), 'Priya', 'parsed name applied to the editor');
      equal(await cdp.evaluate(options.session, `document.querySelectorAll('[data-list="work"] .entry').length`), 1, 'parsed role rendered as an entry');

      const saved = await waitUntil(
        () => cdp.evaluate(sw, `chrome.storage.local.get('profile').then((s) => (s.profile?.basics?.firstName ? s.profile : null))`),
        { label: 'autosave', timeout: 5000 },
      );
      equal(saved.basics.email, 'priya.raman@example.com', 'autosaved profile has parsed email');
      equal(saved.work[0].company, 'Stripe', 'autosaved profile has parsed employer');
      equal(saved.work[0].title, 'Senior Engineer', 'two-column title read from the left column');
      equal(saved.work[0].location, 'San Francisco, CA', 'two-column location read from the right column');
      equal(saved.links.linkedin, 'https://linkedin.com/in/priyaraman', 'LinkedIn recovered from a PDF link annotation');
      equal(saved.links.github, 'https://github.com/priyar', 'GitHub recovered from a PDF link annotation');
      const storedFile = await waitUntil(() => cdp.evaluate(sw, `chrome.storage.local.get('file:resume').then((s) => s['file:resume'] || null)`), { label: 'resume file retained', timeout: 5000 });
      equal(storedFile.name, 'priya.pdf', 'uploaded PDF retained for attachment');

      // Learned answers manager renders entries from storage.
      await cdp.evaluate(sw, `chrome.storage.local.set({ learnedAnswers: ${JSON.stringify(LEARNED)} })`);
      await cdp.send('Page.reload', {}, options.session);
      await waitUntil(() => cdp.evaluate(options.session, `document.querySelectorAll('.learned-row').length === 1`), { label: 'learned answers list' });
      equal(await cdp.evaluate(options.session, `document.querySelector('.learned-row .question').textContent`), 'Which time zone are you in?', 'learned answer listed in options');
      await cdp.closePage(options.targetId);

      const resume = await cdp.openPage(`chrome-extension://${extensionId}/src/ui/resume.html`);
      await waitUntil(() => cdp.evaluate(resume.session, `document.querySelector('.resume-name')?.textContent`), { label: 'resume render' });
      equal(await cdp.evaluate(resume.session, `document.querySelector('.resume-name').textContent`), 'Priya Raman', 'resume renders the saved name');
      await cdp.evaluate(resume.session, `(document.getElementById('job-text').value = 'We need Kubernetes and Terraform experience', document.getElementById('tailor').click(), true)`);
      const coverage = await cdp.evaluate(resume.session, `document.getElementById('coverage').textContent`);
      check(/\d+% keyword coverage/.test(coverage) && /terraform/.test(coverage), 'tailoring reports coverage and missing terms', coverage);
      await cdp.closePage(resume.targetId);

      const popup = await cdp.openPage(`chrome-extension://${extensionId}/src/ui/popup.html`);
      const popupStatus = await waitUntil(() => cdp.evaluate(popup.session, `(() => { const t = document.getElementById('status').textContent; return t.includes('Loading') ? null : t; })()`), { label: 'popup init' });
      check(/Ready/.test(popupStatus), 'popup reports the profile as ready', popupStatus);
      await cdp.closePage(popup.targetId);
    }

  } catch (error) {
    failures += 1;
    console.error('\nHarness error:', error);
  } finally {
    console.log(`\n${passes} passed, ${failures} failed`);
    cleanup();
    process.exit(failures ? 1 : 0);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
