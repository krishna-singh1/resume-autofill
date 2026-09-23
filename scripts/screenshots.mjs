/**
 * Generates Chrome Web Store images into store/images/:
 *   screenshot-{1..4}-*.png   1280×800
 *   promo-small-440x280.png, promo-marquee-1400x560.png
 *
 * Every screenshot shows the real extension UI. A headless browser loads the
 * unpacked extension, fills store/scenes/demo-form.html with a fictional demo
 * profile, and the captured popup/options/builder pages are then laid out on a
 * branded background. Run: npm run screenshots
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import { freePort, launchWithExtension, ROOT, sleep, waitUntil } from '../tests/e2e/browser.mjs';

const OUT = path.join(ROOT, 'store/images');
const SCENES = path.join(ROOT, 'store/scenes');
const ICON = readFileSync(path.join(ROOT, 'store/icon512.png')).toString('base64');

/** Fictional person — the store listing must never show a real user's data. */
const DEMO = {
  profile: {
    basics: {
      firstName: 'Priya', lastName: 'Raman', email: 'priya.raman@example.com', phone: '+1 415 555 0142',
      city: 'Austin', state: 'TX', country: 'United States',
      summary: 'Backend engineer with 7 years building payment and ledger systems at scale.',
    },
    links: { linkedin: 'https://linkedin.com/in/priyaraman', github: 'https://github.com/priyar', portfolio: 'https://priyaraman.dev' },
    work: [
      {
        company: 'Stripe', title: 'Senior Software Engineer', location: 'San Francisco, CA', startDate: '2021-01', current: true,
        highlights: [
          'Designed an idempotent ledger service in Go processing $2B/day at 99.99% availability',
          'Cut p99 latency 45% by moving hot paths from PostgreSQL to Redis streams',
          'Led the migration of payouts to Kubernetes, retiring 40 hand-managed VMs',
        ],
      },
      {
        company: 'Square', title: 'Software Engineer', location: 'San Francisco, CA', startDate: '2018-03', endDate: '2020-12',
        highlights: ['Built a Kafka-based reconciliation pipeline replacing nightly batch jobs', 'Shipped the merchant payout API used by 120k sellers'],
      },
    ],
    education: [{ school: 'University of California, Berkeley', degree: 'B.S.', field: 'Computer Science', endDate: '2018-05' }],
    skills: ['Python', 'TypeScript', 'Go', 'PostgreSQL', 'Kafka', 'Redis', 'Kubernetes', 'AWS'],
    workAuth: { authorized: 'Yes', requiresSponsorship: 'No' },
  },
  file: { name: 'Priya-Raman-Resume.pdf', type: 'application/pdf', size: 14, dataUrl: `data:application/pdf;base64,${Buffer.from('%PDF-1.4 demo').toString('base64')}` },
  learned: [{
    id: 'la_demo_tz', question: 'which time zone are you in', display: 'Which time zone are you in?', aliases: [], kind: 'text',
    value: 'US Central (CST)', scope: 'global', sites: ['boards.greenhouse.io', 'jobs.lever.co'],
    createdAt: '2026-08-01T00:00:00.000Z', lastUsedAt: '2026-09-20T00:00:00.000Z', useCount: 6,
  }],
};

const JOB = `Senior Backend Engineer, Payments. You will design distributed systems in Go and Python,
run services on Kubernetes and AWS, and build event pipelines with Kafka. Experience with Terraform,
gRPC and observability tooling is a plus. PostgreSQL and Redis at scale required.`;

// ----------------------------------------------------------------- capture

/** `y` is a document offset: clips ignore scroll position when capturing beyond the viewport. */
async function capture(cdp, session, width, height, y = 0) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, session);
  await sleep(150);
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true, clip: { x: 0, y, width, height, scale: 1 },
  }, session);
  return data;
}

/** Capture a page at a fixed width and its own content height. */
async function captureToContent(cdp, session, width, maxHeight = 800) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 200, deviceScaleFactor: 1, mobile: false }, session);
  await sleep(100);
  const height = Math.min(maxHeight, await cdp.evaluate(session, 'document.documentElement.scrollHeight'));
  return { data: await capture(cdp, session, width, height), width, height };
}

/** Render arbitrary HTML in a fresh tab and screenshot it at an exact size. */
async function renderHtml(cdp, html, width, height) {
  const { targetId, session } = await cdp.openPage('about:blank');
  const { frameTree } = await cdp.send('Page.getFrameTree', {}, session);
  await cdp.send('Page.setDocumentContent', { frameId: frameTree.frame.id, html }, session);
  await waitUntil(() => cdp.evaluate(session, `[...document.images].every((img) => img.complete) && document.fonts.status === 'loaded'`), { label: 'stage render' });
  const data = await capture(cdp, session, width, height);
  await cdp.closePage(targetId);
  return data;
}

// ------------------------------------------------------------------ layout

const BRAND_CSS = `
  * { box-sizing: border-box; margin: 0; }
  body { width: 1280px; height: 800px; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         background: linear-gradient(135deg, #1d4ed8 0%, #2563eb 45%, #4f46e5 100%); color: #fff; position: relative; }
  .caption { position: absolute; left: 64px; top: 52px; width: 1152px; }
  .caption h1 { font-size: 40px; font-weight: 800; letter-spacing: -0.01em; }
  .caption p { font-size: 20px; opacity: .9; margin-top: 8px; }
  .shot { position: absolute; border-radius: 12px; box-shadow: 0 24px 60px rgba(15, 23, 42, .45); background: #fff; overflow: hidden; }
  .shot img { display: block; }
  .badge { position: absolute; display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,.14); padding: 8px 14px; border-radius: 999px; font-size: 15px; font-weight: 600; }
`;

const img = (data, style = '') => `<img src="data:image/png;base64,${data}" style="${style}" />`;

function stage({ title, subtitle, content }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BRAND_CSS}</style></head><body>
    <div class="caption"><h1>${title}</h1><p>${subtitle}</p></div>${content}</body></html>`;
}

/** Big page capture on the left, popup overlapping it on the right. */
function pageWithPopup(page, popup, { scale = 0.78 } = {}) {
  const pageW = Math.round(page.width * scale);
  const pageH = Math.min(560, Math.round(page.height * scale));
  const popH = Math.min(560, popup.height);
  return `
    <div class="shot" style="left:64px; top:190px; width:${pageW}px; height:${pageH}px">${img(page.data, `width:${pageW}px`)}</div>
    <div class="shot" style="left:${64 + pageW - 40}px; top:170px; width:${popup.width}px; height:${popH}px; border:1px solid #cbd5e1">${img(popup.data)}</div>`;
}

// ------------------------------------------------------------------ scenes

async function main() {
  mkdirSync(OUT, { recursive: true });

  const port = await freePort();
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(readFileSync(path.join(SCENES, 'demo-form.html')));
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const formUrl = `http://127.0.0.1:${port}/apply`;

  const browser = await launchWithExtension();
  const { cdp, extensionId, serviceWorker: sw } = browser;
  const ext = (page) => `chrome-extension://${extensionId}/src/ui/${page}`;
  const save = (name, data) => {
    writeFileSync(path.join(OUT, name), Buffer.from(data, 'base64'));
    console.log(`wrote store/images/${name}`);
  };

  const seed = (state) => cdp.evaluate(sw, `chrome.storage.local.clear().then(() => chrome.storage.local.set(${JSON.stringify(state)})).then(() => true)`);
  const runInForm = (options) => cdp.evaluate(sw, `(async () => {
    const [tab] = await chrome.tabs.query({ url: ${JSON.stringify(formUrl)} });
    const injections = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      args: [chrome.runtime.getURL('src/content/autofill.js'), ${JSON.stringify(options)}],
      func: async (url, opts) => (await import(url)).runAutofill(opts),
    });
    return { ok: true, reports: injections.map((i) => i.result).filter(Boolean) };
  })()`);

  /**
   * Open the real popup, then answer its message to the service worker with a
   * response produced by a real run against the demo form, and press a button.
   */
  const popupAfter = async (response, buttonId) => {
    const popup = await cdp.openPage(ext('popup.html'));
    await waitUntil(() => cdp.evaluate(popup.session, `!document.getElementById('status').textContent.includes('Loading')`), { label: 'popup ready' });
    await cdp.evaluate(popup.session, `(chrome.runtime.sendMessage = async () => (${JSON.stringify(response)}), document.getElementById(${JSON.stringify(buttonId)}).click(), true)`);
    await sleep(300);
    const shot = await captureToContent(cdp, popup.session, 340, 560);
    await cdp.closePage(popup.targetId);
    return shot;
  };

  try {
    await seed({ profile: DEMO.profile, 'file:resume': DEMO.file, learnedAnswers: DEMO.learned });

    // 1 — one-click fill
    const form = await cdp.openPage(formUrl);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 760, deviceScaleFactor: 1, mobile: false }, form.session);
    const fillResponse = await runInForm({});
    const filledForm = { data: await capture(cdp, form.session, 900, 760), width: 900, height: 760 };
    const fillPopup = await popupAfter(fillResponse, 'fill');
    save('screenshot-1-fill.png', await renderHtml(cdp, stage({
      title: 'Fill a job application in one click',
      subtitle: 'Works on Workday, Greenhouse, Lever, Ashby, LinkedIn and most career sites.',
      content: pageWithPopup(filledForm, fillPopup),
    }), 1280, 800));

    // 2 — never type it twice: answer the leftover question, then collect it
    await sleep(1800); // let the green fill highlights fade
    await cdp.evaluate(form.session, `(() => { const el = document.getElementById('tr'); el.value = 'Yes, up to 25%'; el.dispatchEvent(new Event('change', { bubbles: true })); el.style.boxShadow = '0 0 0 2px #7c3aed'; return true; })()`);
    const collectResponse = await runInForm({ collect: true });
    // Frame the questions section, so the remembered and the newly typed answers are both in view.
    // Frame from the experience block down, so the page is full rather than half-empty.
    const questionsTop = await cdp.evaluate(form.session, `Math.max(0, document.querySelectorAll('h2')[0].getBoundingClientRect().top + scrollY - 250)`);
    const answeredForm = { data: await capture(cdp, form.session, 900, 720, questionsTop), width: 900, height: 720 };
    const rememberPopup = await popupAfter(collectResponse, 'collect');
    save('screenshot-2-remember.png', await renderHtml(cdp, stage({
      title: 'Answer a question once. Never again.',
      subtitle: 'Questions your resume can’t answer are remembered and reused on every future form.',
      content: pageWithPopup(answeredForm, rememberPopup),
    }), 1280, 800));
    await cdp.closePage(form.targetId);

    // 3 — tailored resume builder
    const builder = await cdp.openPage(ext('resume.html'));
    await waitUntil(() => cdp.evaluate(builder.session, `document.querySelector('.resume-name')?.textContent === 'Priya Raman'`), { label: 'builder' });
    await cdp.evaluate(builder.session, `(document.getElementById('job-text').value = ${JSON.stringify(JOB)}, document.getElementById('tailor').click(), true)`);
    // Scroll the panel to the coverage result: it is the point of this screenshot.
    await cdp.evaluate(builder.session, `(document.querySelector('.builder-panel').scrollTop = document.getElementById('coverage').offsetTop - 300, true)`);
    const builderShot = { data: await capture(cdp, builder.session, 1152, 580) };
    await cdp.closePage(builder.targetId);
    save('screenshot-3-builder.png', await renderHtml(cdp, stage({
      title: 'Tailor your resume to each job',
      subtitle: 'See which keywords you cover, surface the relevant bullets first, save as PDF.',
      content: `<div class="shot" style="left:64px; top:180px; width:1152px; height:580px">${img(builderShot.data, 'width:1152px')}</div>`,
    }), 1280, 800));

    // 4 — import a resume (fresh storage, real parser on the sample resume)
    await seed({});
    const options = await cdp.openPage(ext('options.html'));
    await waitUntil(() => cdp.evaluate(options.session, `document.getElementById('save-state').textContent.includes('saved')`), { label: 'options' });
    const sample = readFileSync(path.join(ROOT, 'tests/fixtures/sample-resume.txt'), 'utf8');
    await cdp.evaluate(options.session, `(() => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([${JSON.stringify(sample)}], 'Priya-Raman-Resume.txt', { type: 'text/plain' }));
      const input = document.getElementById('resume-file');
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await waitUntil(() => cdp.evaluate(options.session, `document.getElementById('parse-status').textContent.includes('Found')`), { label: 'parse' });
    // Apply the parse, then save, so the shot shows populated fields and a saved state.
    const found = await cdp.evaluate(options.session, `document.getElementById('parse-status').textContent`);
    await cdp.evaluate(options.session, `(document.getElementById('apply-parsed').click(), document.getElementById('save').click(), true)`);
    await waitUntil(() => cdp.evaluate(options.session, `document.getElementById('save-state').textContent.startsWith('Saved')`), { label: 'save' });
    await cdp.evaluate(options.session, `(document.getElementById('parse-status').textContent = ${JSON.stringify(`${found} Review the fields below.`)}, window.scrollTo(0, 0), true)`);
    const optionsShot = { data: await capture(cdp, options.session, 1152, 700) };
    await cdp.closePage(options.targetId);
    save('screenshot-4-import.png', await renderHtml(cdp, stage({
      title: 'Start from the resume you already have',
      subtitle: 'Import a PDF or Word file. Everything stays on your device — nothing is uploaded.',
      content: `<div class="shot" style="left:64px; top:180px; width:1152px; height:580px">${img(optionsShot.data)}</div>`,
    }), 1280, 800));

    // Promo tiles
    const tile = (width, height, big) => `<!doctype html><html><head><meta charset="utf-8"><style>${BRAND_CSS}
      body { width:${width}px; height:${height}px; display:flex; align-items:center; gap:${big ? 48 : 20}px; padding:0 ${big ? 90 : 34}px; }
      .icon { width:${big ? 190 : 96}px; height:${big ? 190 : 96}px; flex:none; filter: drop-shadow(0 12px 28px rgba(0,0,0,.35)); }
      h1 { font-size:${big ? 64 : 30}px; font-weight:800; line-height:1.05; }
      p { font-size:${big ? 28 : 15}px; opacity:.92; margin-top:${big ? 16 : 8}px; line-height:1.3; }
      </style></head><body>
      <img class="icon" src="data:image/png;base64,${ICON}" />
      <div><h1>Resume Autofill</h1><p>Fill job applications from your resume.${big ? '<br>' : ' '}Answer each question once.</p></div>
      </body></html>`;
    save('promo-small-440x280.png', await renderHtml(cdp, tile(440, 280, false), 440, 280));
    save('promo-marquee-1400x560.png', await renderHtml(cdp, tile(1400, 560, true), 1400, 560));
  } finally {
    browser.close();
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
