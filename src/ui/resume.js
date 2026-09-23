import { renderResume, resumeToText } from '../core/resume-template.js';
import { fullName } from '../core/schema.js';
import { getProfile } from '../core/storage.js';
import { tailorProfile } from '../core/tailor.js';

const paper = document.getElementById('paper');
const jobText = document.getElementById('job-text');
const maxBullets = document.getElementById('max-bullets');
const coverageEl = document.getElementById('coverage');

let baseProfile = null;
let shownProfile = null;

function draw(profile) {
  shownProfile = profile;
  paper.replaceChildren(renderResume(profile));
}

function chipList(title, words, className) {
  const wrapper = document.createElement('div');
  wrapper.append(Object.assign(document.createElement('div'), { textContent: title, className: 'muted' }));
  const chips = document.createElement('div');
  chips.className = 'chips';
  for (const word of words.slice(0, 24)) {
    const chip = document.createElement('span');
    chip.className = `chip ${className}`;
    chip.textContent = word;
    chips.append(chip);
  }
  wrapper.append(chips);
  return wrapper;
}

function showCoverage(result) {
  coverageEl.replaceChildren();
  if (!result.keywords.length) {
    coverageEl.textContent = 'Paste a job description to see keyword coverage.';
    return;
  }

  const heading = document.createElement('strong');
  heading.textContent = `${result.coverage}% keyword coverage (${result.matched.length}/${result.keywords.length})`;
  coverageEl.append(heading);

  const bar = document.createElement('div');
  bar.className = 'bar';
  const fill = document.createElement('span');
  fill.style.width = `${result.coverage}%`;
  bar.append(fill);
  coverageEl.append(bar);

  if (result.matched.length) coverageEl.append(chipList('Found in your profile', result.matched, ''));
  if (result.missing.length) coverageEl.append(chipList('Not mentioned anywhere', result.missing, 'missing'));
}

function download(filename, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function fileStem() {
  const name = fullName(baseProfile) || 'resume';
  return `${name.replace(/\s+/g, '-')}-resume`;
}

document.getElementById('print').addEventListener('click', () => window.print());

document.getElementById('copy-text').addEventListener('click', async (event) => {
  await navigator.clipboard.writeText(resumeToText(shownProfile));
  const button = event.currentTarget;
  const original = button.textContent;
  button.textContent = 'Copied';
  setTimeout(() => {
    button.textContent = original;
  }, 1400);
});

document.getElementById('download-text').addEventListener('click', () => {
  download(`${fileStem()}.txt`, resumeToText(shownProfile));
});

document.getElementById('tailor').addEventListener('click', () => {
  const result = tailorProfile(baseProfile, jobText.value, { maxBullets: Number(maxBullets.value) || 0 });
  draw(result.profile);
  showCoverage(result);
});

document.getElementById('reset').addEventListener('click', () => {
  jobText.value = '';
  coverageEl.replaceChildren();
  draw(baseProfile);
});

document.getElementById('to-options').addEventListener('click', (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
});

async function init() {
  baseProfile = await getProfile();
  draw(baseProfile);
  const isEmpty = !fullName(baseProfile) && !baseProfile.work.length;
  document.getElementById('empty-warning').hidden = !isEmpty;
}

init();
