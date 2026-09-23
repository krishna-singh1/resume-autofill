import { upsertAnswer } from '../core/learned.js';
import { fullName } from '../core/schema.js';
import { ruleForUrl } from '../core/siterules.js';
import {
  clearPendingCaptures,
  getLearnedAnswers,
  getPendingCaptures,
  getProfile,
  saveLearnedAnswers,
} from '../core/storage.js';

const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const fillButton = document.getElementById('fill');
const previewButton = document.getElementById('preview');
const collectButton = document.getElementById('collect');
const siteEl = document.getElementById('site');
const rememberEl = document.getElementById('remember');
const rememberList = document.getElementById('remember-list');

let pending = [];

function setStatus(message, tone = '') {
  statusEl.textContent = message;
  statusEl.className = tone;
}

function setBusy(busy) {
  for (const button of [fillButton, previewButton, collectButton]) button.disabled = busy;
}

/** Rough completeness signal so an empty profile fails loudly, not silently. */
function profileGaps(profile) {
  const gaps = [];
  if (!fullName(profile)) gaps.push('name');
  if (!profile.basics.email) gaps.push('email');
  if (!profile.basics.phone) gaps.push('phone');
  return gaps;
}

function sourceTag(result) {
  if (result.source === 'learned') return `remembered from "${result.question}"`;
  if (result.source && result.source !== 'matcher') return `via ${result.source} rule`;
  return result.key;
}

function render(reports) {
  resultsEl.replaceChildren();
  const results = reports.flatMap((report) => report.results || []);

  if (!results.length) {
    const total = reports.reduce((sum, report) => sum + (report.fieldsSeen || 0), 0);
    setStatus(
      total ? `Found ${total} field${total === 1 ? '' : 's'} but matched none of them.` : 'No form fields found here.',
      'warn',
    );
    return;
  }

  for (const result of results) {
    const item = document.createElement('li');

    const dot = document.createElement('span');
    dot.className = `dot ${result.status === 'would-fill' ? 'filled' : result.status}${result.source === 'learned' ? ' learned' : ''}`;
    item.append(dot);

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = result.label || result.key;
    label.title = sourceTag(result);
    item.append(label);

    const value = document.createElement('span');
    value.className = 'value';
    value.textContent = result.value || result.reason || '';
    value.title = value.textContent;
    item.append(value);

    resultsEl.append(item);
  }

  const filled = results.filter((result) => result.status === 'filled').length;
  const wouldFill = results.filter((result) => result.status === 'would-fill').length;
  const failed = results.filter((result) => result.status === 'failed').length;
  const learned = results.filter((result) => result.source === 'learned' && result.status !== 'skipped').length;
  const learnedNote = learned ? ` ${learned} from remembered answers.` : '';

  if (wouldFill) setStatus(`${wouldFill} field${wouldFill === 1 ? '' : 's'} ready to fill.${learnedNote}`);
  else if (filled) setStatus(`Filled ${filled} field${filled === 1 ? '' : 's'}.${learnedNote}${failed ? ` ${failed} failed.` : ''}`);
  else setStatus('Nothing was filled — check the reasons below.', 'warn');
}

function showRemember(captures) {
  pending = captures;
  rememberList.replaceChildren();
  rememberEl.hidden = !captures.length;
  if (!captures.length) return;

  captures.forEach((capture, index) => {
    const item = document.createElement('li');
    const label = document.createElement('label');
    label.className = 'check';

    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = true;
    box.dataset.index = String(index);
    label.append(box);

    const text = document.createElement('span');
    const question = document.createElement('strong');
    question.textContent = capture.display;
    const value = document.createElement('span');
    value.className = 'muted';
    value.textContent = ` → ${capture.value.length > 60 ? `${capture.value.slice(0, 60)}…` : capture.value}`;
    text.append(question, value);
    if (capture.scope === 'site') {
      const scope = document.createElement('span');
      scope.className = 'muted';
      scope.textContent = ` (this site only)`;
      text.append(scope);
    }
    label.append(text);
    item.append(label);
    rememberList.append(item);
  });
}

async function saveRemembered() {
  const chosen = [...rememberList.querySelectorAll('input:checked')].map((box) => pending[Number(box.dataset.index)]);
  let answers = await getLearnedAnswers();
  for (const capture of chosen) {
    const { pageTitle, ...record } = capture;
    answers = upsertAnswer(answers, record);
  }
  await saveLearnedAnswers(answers);
  await clearPendingCaptures();
  showRemember([]);
  setStatus(chosen.length ? `Remembered ${chosen.length} answer${chosen.length === 1 ? '' : 's'}.` : 'Nothing remembered.');
}

async function run({ dryRun = false, collect = false } = {}) {
  setBusy(true);
  setStatus(collect ? 'Looking for answers…' : dryRun ? 'Scanning…' : 'Filling…');

  const response = await chrome.runtime.sendMessage({ type: 'run-autofill', dryRun, collect });
  setBusy(false);

  if (!response?.ok) {
    setStatus(response?.error || 'Something went wrong.', 'bad');
    return;
  }

  if (collect) {
    const captures = response.reports.flatMap((report) => report.captures || []);
    showRemember(captures);
    setStatus(
      captures.length
        ? `Found ${captures.length} answer${captures.length === 1 ? '' : 's'} we could not fill from your profile.`
        : 'No extra answers found — every filled field came from your profile.',
    );
    resultsEl.replaceChildren();
    return;
  }
  render(response.reports);
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const rule = tab?.url ? ruleForUrl(tab.url) : null;
  if (rule) siteEl.textContent = rule.id;

  const [profile, captures] = await Promise.all([getProfile(), getPendingCaptures()]);
  const gaps = profileGaps(profile);

  if (gaps.length === 3) {
    setStatus('Your profile is empty. Add your details first.', 'warn');
    fillButton.disabled = true;
  } else if (gaps.length) {
    setStatus(`Ready. Missing: ${gaps.join(', ')}.`, 'warn');
  } else {
    setStatus(`Ready to fill as ${fullName(profile)}.`);
  }

  if (captures.length) showRemember(captures);
}

fillButton.addEventListener('click', () => run());
previewButton.addEventListener('click', () => run({ dryRun: true }));
collectButton.addEventListener('click', () => run({ collect: true }));
document.getElementById('remember-save').addEventListener('click', saveRemembered);
document.getElementById('remember-dismiss').addEventListener('click', async () => {
  await clearPendingCaptures();
  showRemember([]);
});

document.getElementById('open-options').addEventListener('click', (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
});

document.getElementById('open-resume').addEventListener('click', (event) => {
  event.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL('src/ui/resume.html') });
});

init();
