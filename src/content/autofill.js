/**
 * Runs inside the page (one instance per frame). Injected on demand rather
 * than declared in the manifest, so no code touches a page until the user
 * asks for a fill.
 *
 * Order of authority: site rule > generic profile matcher > learned answer.
 * Each stage only sees the descriptors the previous stage left alone.
 */

import { fillDescriptor, flash } from '../core/filler.js';
import { isStorable, makeAnswer, markUsed, matchLearned } from '../core/learned.js';
import { assignFields } from '../core/matcher.js';
import { scanFields } from '../core/scanner.js';
import { resolveValue } from '../core/schema.js';
import { ruleForUrl, splitIndexedKey } from '../core/siterules.js';
import {
  addPendingCaptures,
  getFile,
  getLearnedAnswers,
  getProfile,
  getSettings,
  saveLearnedAnswers,
} from '../core/storage.js';
import { squish } from '../core/text.js';

const EEO_PREFIX = 'eeo.';
const FILE_PREFIX = 'files.';

/** Match descriptors to the selectors a site rule declares. */
function applySiteRule(descriptors, href) {
  const rule = ruleForUrl(href);
  if (!rule) return { ruleId: null, entries: [], claimed: new Set() };

  const entries = [];
  const claimed = new Set();

  for (const [selector, rawKey] of Object.entries(rule.selectors)) {
    let elements;
    try {
      elements = Array.from(document.querySelectorAll(selector));
    } catch {
      continue; // a malformed selector must not abort the whole run
    }
    for (const element of elements) {
      const descriptor = descriptors.find((candidate) => candidate.element === element);
      if (!descriptor || claimed.has(descriptor)) continue;
      const { key, index } = splitIndexedKey(rawKey);
      entries.push({ descriptor, key, index, score: 1000, source: rule.id });
      claimed.add(descriptor);
    }
  }

  return { ruleId: rule.id, entries, claimed };
}

async function valueForKey(key, index, profile) {
  if (key === `${FILE_PREFIX}resume`) return getFile('resume');
  if (key === `${FILE_PREFIX}coverLetter`) return (await getFile('coverLetter')) || (await getFile('resume'));
  return resolveValue(profile, key, index);
}

function describe(descriptor) {
  return descriptor.label || descriptor.placeholder || descriptor.name || descriptor.id || descriptor.tag;
}

/** Current user-visible value of a descriptor, for capture. */
function currentValue(descriptor) {
  const el = descriptor.element;
  if (descriptor.kind === 'file') return '';
  if (descriptor.elements?.length > 1) {
    const index = descriptor.elements.findIndex((member) => member.checked);
    return index >= 0 ? descriptor.options?.[index]?.text || descriptor.elements[index].value : '';
  }
  if (descriptor.tag === 'select') return squish(el.selectedOptions?.[0]?.textContent || el.value);
  if (descriptor.kind === 'boolean') return el.checked ? 'Yes' : '';
  return squish(el.value);
}

function toCapture(descriptor) {
  const label = describe(descriptor);
  const value = currentValue(descriptor);
  if (!isStorable(label, value)) return null;
  return {
    ...makeAnswer({ label, value, kind: descriptor.kind, href: location.href }),
    pageTitle: document.title.slice(0, 120),
  };
}

/**
 * Plan every field on the page without touching it.
 * Returns matched entries and the descriptors nothing could account for.
 */
async function plan(profile, settings, learned) {
  const descriptors = scanFields(document);
  const { ruleId, entries: siteEntries, claimed } = applySiteRule(descriptors, location.href);

  const unclaimed = descriptors.filter((descriptor) => !claimed.has(descriptor));
  const generic = assignFields(unclaimed).map((entry) => ({ ...entry, source: 'matcher' }));
  const accounted = new Set([...claimed, ...generic.map((entry) => entry.descriptor)]);

  const learnedEntries = [];
  const unmatched = [];
  for (const descriptor of descriptors) {
    if (accounted.has(descriptor)) continue;
    const hit = settings.useLearnedAnswers ? matchLearned(descriptor, learned, location.href) : null;
    if (hit) learnedEntries.push({ descriptor, key: `learned:${hit.answer.id}`, answer: hit.answer, source: 'learned', score: hit.score });
    else unmatched.push(descriptor);
  }

  return { descriptors, ruleId, entries: [...siteEntries, ...generic, ...learnedEntries], unmatched };
}

/**
 * @param {{dryRun?: boolean, collect?: boolean}} options
 *   dryRun  — report what would happen without touching the page.
 *   collect — return the answers currently typed into fields we could not fill.
 */
export async function runAutofill({ dryRun = false, collect = false } = {}) {
  const [profile, settings, learned] = await Promise.all([getProfile(), getSettings(), getLearnedAnswers()]);
  const { descriptors, ruleId, entries, unmatched } = await plan(profile, settings, learned);

  const report = {
    url: location.href,
    isTopFrame: window.top === window,
    fieldsSeen: descriptors.length,
    siteRule: ruleId,
    results: [],
    captures: [],
  };

  if (collect) {
    report.captures = unmatched.map(toCapture).filter(Boolean);
    return report;
  }
  if (!descriptors.length) return report;

  let learnedState = learned;
  const unfilled = [...unmatched];

  for (const entry of entries) {
    const { descriptor, key, index } = entry;
    const label = describe(descriptor);

    if (key.startsWith(EEO_PREFIX) && !settings.fillEEO) {
      report.results.push({ key, label, status: 'skipped', reason: 'self-identification filling is off' });
      unfilled.push(descriptor);
      continue;
    }
    if (key.startsWith(FILE_PREFIX) && !settings.attachResume) {
      report.results.push({ key, label, status: 'skipped', reason: 'resume attaching is off' });
      continue;
    }

    const value = entry.answer ? entry.answer.value : await valueForKey(key, index, profile);
    const preview = value && typeof value === 'object' ? value.name : value;
    const question = entry.answer ? entry.answer.display : undefined;

    if (!preview) {
      report.results.push({ key, label, status: 'skipped', reason: 'nothing saved for this field' });
      unfilled.push(descriptor);
      continue;
    }
    if (dryRun) {
      report.results.push({ key, label, status: 'would-fill', value: String(preview), source: entry.source, question });
      continue;
    }

    let outcome;
    try {
      outcome = fillDescriptor(descriptor, value, { overwrite: settings.overwriteExisting });
    } catch (error) {
      outcome = { status: 'failed', reason: error?.message || 'unexpected error' };
    }

    if (outcome.status === 'filled') {
      if (settings.highlightFilled) flash(descriptor.element, entry.source === 'learned' ? '#7c3aed' : '#16a34a');
      if (entry.answer) learnedState = markUsed(learnedState, entry.answer.id, location.href);
    }
    report.results.push({ key, label, source: entry.source, question, ...outcome });
  }

  if (!dryRun) {
    if (learnedState !== learned) await saveLearnedAnswers(learnedState);
    if (settings.offerToRemember) watchForAnswers(unfilled);
    if (report.isTopFrame) {
      const filled = report.results.filter((result) => result.status === 'filled').length;
      showToast(filled ? `Filled ${filled} field${filled === 1 ? '' : 's'}` : 'Nothing to fill on this page');
    }
  }

  return report;
}

/**
 * After a fill, keep an eye on the fields we could not answer. Whatever the
 * user types there is persisted as a pending capture, which the popup offers
 * to remember.
 *
 * Writes happen shortly after each change rather than on `pagehide`: storage
 * calls issued during unload race the frame's teardown and are often dropped.
 */
function watchForAnswers(descriptors) {
  if (!descriptors.length) return;
  const touched = new Set();
  let timer = null;

  const flush = () => {
    timer = null;
    if (!touched.size) return;
    const captures = [...touched].map(toCapture).filter(Boolean);
    touched.clear();
    if (captures.length) addPendingCaptures(captures).catch(() => {});
  };

  const schedule = (descriptor) => {
    touched.add(descriptor);
    clearTimeout(timer);
    timer = setTimeout(flush, 400);
  };

  for (const descriptor of descriptors) {
    for (const el of descriptor.elements || [descriptor.element]) {
      el.addEventListener('change', () => schedule(descriptor), { passive: true });
    }
  }

  // Best effort for the case where the user submits within the debounce window.
  document.addEventListener('submit', flush, { capture: true });
  window.addEventListener('pagehide', flush);
}

/** Small transient confirmation, kept out of the page's own stacking context. */
function showToast(message) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;all:initial;';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      .toast {
        font: 500 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #111827; color: #f9fafb; padding: 10px 14px; border-radius: 8px;
        box-shadow: 0 6px 24px rgba(0,0,0,.28);
      }
    </style>
    <div class="toast"></div>`;
  shadow.querySelector('.toast').textContent = message;
  document.documentElement.append(host);
  setTimeout(() => host.remove(), 2600);
}
