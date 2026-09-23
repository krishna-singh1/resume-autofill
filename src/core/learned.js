/**
 * "Never type it twice": answers to questions the profile has no key for.
 *
 * A learned answer is keyed by the normalised question text. New fields are
 * matched to stored answers by whole-phrase equality first, then by token
 * similarity — with a deliberately higher bar than profile matching, because
 * pasting the wrong custom answer is worse than leaving a field blank.
 *
 * Pure functions only; persistence lives in storage.js.
 */

import { cleanLabel } from './matcher.js';
import { normalize, similarity } from './text.js';

/** Similarity below which a stored answer is not offered. */
export const LEARNED_THRESHOLD = 0.75;

/** Questions whose answers we refuse to store, whatever the user types. */
const NEVER_STORE = /\b(ssn|social security|passport|national id|aadhaar|date of birth|birth date|dob|password|pin)\b/i;

/** Sub-domains and path segments that identify an ATS, not an employer. */
const GENERIC_HOST_TOKENS = new Set([
  'www', 'jobs', 'job', 'careers', 'career', 'boards', 'board', 'apply', 'app', 'my', 'wd1', 'wd3', 'wd5',
  'myworkdayjobs', 'workday', 'greenhouse', 'lever', 'ashbyhq', 'smartrecruiters', 'workable', 'jobvite',
  'taleo', 'icims', 'linkedin', 'indeed', 'glassdoor', 'com', 'io', 'co', 'net', 'org', 'in', 'uk', 'eu',
]);

/** Kinds that can share an answer: a text answer may fill a textarea and vice versa. */
const KIND_FAMILY = {
  text: 'text',
  longtext: 'text',
  number: 'text',
  date: 'text',
  choice: 'choice',
  boolean: 'choice',
};

export function questionKey(label) {
  return normalize(cleanLabel(label));
}

export function isStorable(label, value) {
  const question = questionKey(label);
  if (!question || question.length < 3) return false;
  if (NEVER_STORE.test(question)) return false;
  const text = String(value ?? '').trim();
  return text.length > 0 && text.length <= 2000;
}

/** Hostname for scoping: `acme.wd5.myworkdayjobs.com` -> `acme.wd5.myworkdayjobs.com`. */
export function siteOf(href) {
  try {
    return new URL(href).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Words in the URL that probably name the employer: the non-generic
 * sub-domain labels plus the first path segment on ATS hosts.
 */
export function employerTokensFromUrl(href) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return [];
  }
  const tokens = new Set();
  for (const label of url.hostname.toLowerCase().split('.')) {
    if (label.length >= 3 && !GENERIC_HOST_TOKENS.has(label)) tokens.add(label);
  }
  const [firstSegment] = url.pathname.split('/').filter(Boolean);
  if (firstSegment && /^[a-z0-9-]{3,}$/i.test(firstSegment) && !GENERIC_HOST_TOKENS.has(firstSegment.toLowerCase())) {
    for (const piece of firstSegment.toLowerCase().split('-')) if (piece.length >= 3) tokens.add(piece);
  }
  return [...tokens];
}

/** "Have you worked at Acme before?" on acme.myworkdayjobs.com is about Acme only. */
export function shouldScopeToSite(label, href) {
  const words = new Set(questionKey(label).split(' '));
  return employerTokensFromUrl(href).some((token) => words.has(token));
}

let counter = 0;
function newId() {
  counter += 1;
  return `la_${Date.now().toString(36)}_${counter.toString(36)}`;
}

/** Build a fresh learned-answer record. */
export function makeAnswer({ label, value, kind = 'text', href = '' }) {
  const site = siteOf(href);
  const now = new Date().toISOString();
  return {
    id: newId(),
    question: questionKey(label),
    display: cleanLabel(label).slice(0, 200),
    aliases: [],
    kind: KIND_FAMILY[kind] || 'text',
    value: String(value),
    scope: shouldScopeToSite(label, href) ? 'site' : 'global',
    sites: site ? [site] : [],
    createdAt: now,
    lastUsedAt: now,
    useCount: 0,
  };
}

function scoreAnswer(question, answer) {
  const candidates = [answer.question, ...(answer.aliases || [])];
  let best = 0;
  for (const candidate of candidates) {
    if (candidate === question) return 1;
    best = Math.max(best, similarity(candidate, question));
  }
  return best;
}

/**
 * Best stored answer for a descriptor, or null.
 * @param {{label?: string, ariaLabel?: string, placeholder?: string, kind?: string}} descriptor
 * @param {object[]} answers
 * @param {string} href page URL, used for site-scoped answers
 */
export function matchLearned(descriptor, answers, href = '') {
  const question = questionKey(descriptor.label || descriptor.ariaLabel || descriptor.placeholder);
  if (!question || !answers?.length) return null;

  const site = siteOf(href);
  const family = KIND_FAMILY[descriptor.kind || 'text'] || 'text';
  let winner = null;

  for (const answer of answers) {
    if ((KIND_FAMILY[answer.kind] || 'text') !== family) continue;
    if (answer.scope === 'site' && !(answer.sites || []).includes(site)) continue;

    const score = scoreAnswer(question, answer);
    if (score < LEARNED_THRESHOLD) continue;
    if (!winner || score > winner.score || (score === winner.score && answer.useCount > winner.answer.useCount)) {
      winner = { answer, score };
    }
  }
  return winner;
}

/**
 * Merge a captured answer into the list: update an existing record whose
 * question matches (adding the new wording as an alias), or append.
 */
export function upsertAnswer(answers, captured) {
  const list = [...(answers || [])];
  const existing = matchLearned({ label: captured.display || captured.question, kind: captured.kind }, list);

  if (existing) {
    const index = list.indexOf(existing.answer);
    const record = { ...existing.answer, value: captured.value, lastUsedAt: new Date().toISOString() };
    if (captured.question !== record.question && !record.aliases.includes(captured.question)) {
      record.aliases = [...record.aliases, captured.question];
    }
    for (const site of captured.sites || []) if (!record.sites.includes(site)) record.sites = [...record.sites, site];
    list[index] = record;
    return list;
  }

  return [...list, captured];
}

/** Bump usage stats and record the site after a successful fill. */
export function markUsed(answers, id, href) {
  const site = siteOf(href);
  return (answers || []).map((answer) =>
    answer.id !== id
      ? answer
      : {
          ...answer,
          useCount: (answer.useCount || 0) + 1,
          lastUsedAt: new Date().toISOString(),
          sites: site && !answer.sites.includes(site) ? [...answer.sites, site] : answer.sites,
        },
  );
}
