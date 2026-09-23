/**
 * Everything persisted by the extension goes through here.
 *
 * `chrome.storage.local` only — nothing is synced to a Google account and
 * nothing leaves the browser, because a profile holds a home address, phone
 * number and voluntary self-identification answers.
 */

import { normalizeProfile } from './schema.js';

const KEY_PROFILE = 'profile';
const KEY_SETTINGS = 'settings';
const KEY_LEARNED = 'learnedAnswers';
const KEY_PENDING = 'pendingCaptures';
const KEY_FILES = { resume: 'file:resume', coverLetter: 'file:coverLetter' };

/** Captured-but-unconfirmed answers are capped so a runaway page can't flood storage. */
const MAX_PENDING = 40;

export const DEFAULT_SETTINGS = {
  /** Replace values the user (or the site) already put in a field. */
  overwriteExisting: false,
  /** Answer voluntary EEO / self-identification questions. Off by default. */
  fillEEO: false,
  /** Attach the stored resume file to upload inputs. */
  attachResume: true,
  /** Outline filled fields for a moment after filling. */
  highlightFilled: true,
  /** Use answers remembered from earlier applications. */
  useLearnedAnswers: true,
  /** After a fill, offer to remember answers typed into fields we couldn't fill. */
  offerToRemember: true,
};

export async function getProfile() {
  const stored = await chrome.storage.local.get(KEY_PROFILE);
  return normalizeProfile(stored[KEY_PROFILE]);
}

export async function saveProfile(profile) {
  await chrome.storage.local.set({ [KEY_PROFILE]: normalizeProfile(profile) });
}

export async function getSettings() {
  const stored = await chrome.storage.local.get(KEY_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...(stored[KEY_SETTINGS] || {}) };
}

export async function saveSettings(patch) {
  const current = await getSettings();
  await chrome.storage.local.set({ [KEY_SETTINGS]: { ...current, ...patch } });
}

/** @returns {Promise<{name: string, type: string, size: number, dataUrl: string} | null>} */
export async function getFile(kind) {
  const key = KEY_FILES[kind];
  if (!key) return null;
  const stored = await chrome.storage.local.get(key);
  return stored[key] || null;
}

export async function saveFile(kind, record) {
  const key = KEY_FILES[kind];
  if (!key) throw new Error(`unknown file kind: ${kind}`);
  await chrome.storage.local.set({ [key]: record });
}

export async function clearFile(kind) {
  const key = KEY_FILES[kind];
  if (key) await chrome.storage.local.remove(key);
}

/** @returns {Promise<object[]>} learned answers, see core/learned.js for the shape */
export async function getLearnedAnswers() {
  const stored = await chrome.storage.local.get(KEY_LEARNED);
  return Array.isArray(stored[KEY_LEARNED]) ? stored[KEY_LEARNED] : [];
}

export async function saveLearnedAnswers(answers) {
  await chrome.storage.local.set({ [KEY_LEARNED]: answers });
}

/** Answers noticed on a page but not yet confirmed by the user. */
export async function getPendingCaptures() {
  const stored = await chrome.storage.local.get(KEY_PENDING);
  return Array.isArray(stored[KEY_PENDING]) ? stored[KEY_PENDING] : [];
}

/** Merge new captures in, keyed by question, newest value winning. */
export async function addPendingCaptures(captures) {
  const current = await getPendingCaptures();
  const byQuestion = new Map(current.map((capture) => [capture.question, capture]));
  for (const capture of captures) byQuestion.set(capture.question, capture);
  await chrome.storage.local.set({ [KEY_PENDING]: [...byQuestion.values()].slice(-MAX_PENDING) });
}

export async function clearPendingCaptures() {
  await chrome.storage.local.remove(KEY_PENDING);
}

/** Whole-state snapshot for the Export button. */
export async function exportAll() {
  const [profile, settings, resume, coverLetter, learnedAnswers] = await Promise.all([
    getProfile(),
    getSettings(),
    getFile('resume'),
    getFile('coverLetter'),
    getLearnedAnswers(),
  ]);
  return {
    format: 'resume-autofill/1',
    exportedAt: new Date().toISOString(),
    profile,
    settings,
    learnedAnswers,
    files: { resume, coverLetter },
  };
}

export async function importAll(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') throw new Error('That file is not a Resume Autofill export.');
  const profile = snapshot.profile || snapshot;
  await saveProfile(profile);
  if (snapshot.settings) await saveSettings(snapshot.settings);
  if (Array.isArray(snapshot.learnedAnswers)) await saveLearnedAnswers(snapshot.learnedAnswers);
  if (snapshot.files?.resume) await saveFile('resume', snapshot.files.resume);
  if (snapshot.files?.coverLetter) await saveFile('coverLetter', snapshot.files.coverLetter);
}

export async function clearAll() {
  await chrome.storage.local.clear();
}
