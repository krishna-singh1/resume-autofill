/**
 * Scores form-field descriptors against the rule table in fieldmap.js.
 *
 * Pure functions only — the DOM never reaches this module, which is what makes
 * the matching logic directly unit testable (see tests/matcher.test.js).
 */

import { FIELD_DEFINITIONS } from './fieldmap.js';
import { containsAny, containsPhrase, normalize, tokenize } from './text.js';

/** Below this a guess is more likely to be wrong than right, so we skip it. */
export const MATCH_THRESHOLD = 40;

const WEIGHT = {
  autocomplete: 100,
  exactLabel: 70,
  labelPhrase: 45,
  attrPhrase: 32,
  attrHint: 34,
  placeholderPhrase: 24,
  inputType: 12,
  kindExact: 8,
  section: 25,
  /** Each extra word in a matched phrase is evidence the match is deliberate. */
  phraseWordBonus: 3,
};

/** Which control kinds a definition of a given kind is allowed to fill. */
const COMPATIBLE_KINDS = {
  file: ['file'],
  boolean: ['boolean', 'choice', 'text'],
  choice: ['choice', 'boolean', 'text'],
  longtext: ['longtext', 'text'],
  text: ['text', 'longtext', 'choice', 'date', 'number'],
  email: ['text', 'choice'],
  tel: ['text', 'number'],
  url: ['text'],
  date: ['date', 'text', 'choice', 'number'],
  number: ['number', 'text', 'choice'],
};

/** Strip the decorations sites hang off labels: `Email *`, `Phone (optional)`. */
export function cleanLabel(label) {
  return String(label || '')
    .replace(/\((?:required|optional|mandatory)\)/gi, '')
    .replace(/\brequired\b/gi, '')
    .replace(/[*✱]/g, '')
    .trim();
}

function longestPhraseMatch(tokens, phrases) {
  if (!tokens.length || !phrases?.length) return 0;
  let best = 0;
  for (const phrase of phrases) {
    if (!containsPhrase(tokens, phrase)) continue;
    best = Math.max(best, tokenize(phrase).length);
  }
  return best;
}

/**
 * Score one definition against one descriptor.
 * Returns `null` when the definition is disqualified rather than merely weak.
 */
export function scoreDefinition(descriptor, definition) {
  const kind = descriptor.kind || 'text';
  const allowed = COMPATIBLE_KINDS[definition.kind] || ['text'];
  if (!allowed.includes(kind)) return null;

  const label = cleanLabel(descriptor.label || descriptor.ariaLabel || '');
  const labelTokens = tokenize([label, descriptor.title, descriptor.ariaLabel].filter(Boolean).join(' '));
  const attrTokens = tokenize([descriptor.name, descriptor.id, descriptor.dataAttr].filter(Boolean).join(' '));
  const placeholderTokens = tokenize(descriptor.placeholder);
  const sectionTokens = tokenize(descriptor.sectionText);
  const allTokens = [...labelTokens, ...attrTokens, ...placeholderTokens];

  if (definition.not && containsAny(allTokens, definition.not)) return null;

  let score = 0;

  if (definition.autocomplete && descriptor.autocomplete) {
    // `autocomplete="shipping given-name"` carries more than one token. Tokens
    // are compared whole: `given-name` must not satisfy a rule asking for `name`.
    const provided = String(descriptor.autocomplete).toLowerCase().split(/\s+/);
    if (definition.autocomplete.some((token) => provided.includes(token.toLowerCase()))) {
      score += WEIGHT.autocomplete;
    }
  }

  const normalizedLabel = normalize(label);
  const exactHit = definition.exact?.some((phrase) => normalize(phrase) === normalizedLabel);
  if (exactHit) {
    score += WEIGHT.exactLabel;
  } else {
    const words = longestPhraseMatch(labelTokens, definition.contains);
    if (words) score += WEIGHT.labelPhrase + (words - 1) * WEIGHT.phraseWordBonus;
  }

  const attrWords = longestPhraseMatch(attrTokens, definition.contains);
  if (attrWords) score += WEIGHT.attrPhrase + (attrWords - 1) * WEIGHT.phraseWordBonus;

  if (longestPhraseMatch(attrTokens, definition.attr)) score += WEIGHT.attrHint;
  if (longestPhraseMatch(placeholderTokens, definition.contains)) score += WEIGHT.placeholderPhrase;

  if (definition.inputType?.includes(descriptor.type)) score += WEIGHT.inputType;
  if (definition.kind === kind) score += WEIGHT.kindExact;

  // A bare "Start date" means different things inside an employment block than
  // it does as a standalone availability question; the section text breaks the tie.
  if (definition.section && containsAny(sectionTokens, definition.section)) score += WEIGHT.section;

  return score;
}

/** Best-scoring definition for a descriptor, or null if nothing clears the threshold. */
export function bestMatch(descriptor, definitions = FIELD_DEFINITIONS) {
  let winner = null;
  for (const definition of definitions) {
    const score = scoreDefinition(descriptor, definition);
    if (score === null || score < MATCH_THRESHOLD) continue;
    if (!winner || score > winner.score) winner = { definition, key: definition.key, score };
  }
  return winner;
}

/**
 * Resolve a whole page of descriptors to profile keys.
 *
 * Two things happen beyond per-field scoring:
 *  - repeatable keys (`work[].company`) are numbered in DOM order, so a form
 *    with three employment blocks pulls three different jobs;
 *  - non-repeatable keys are awarded to their single best descriptor, which
 *    stops a stray "Name" input from being filled alongside the real one.
 *
 * `descriptors` must be in DOM order. Returns matches in that same order.
 */
export function assignFields(descriptors, definitions = FIELD_DEFINITIONS) {
  const scored = descriptors.map((descriptor, position) => {
    const match = bestMatch(descriptor, definitions);
    return match ? { descriptor, position, ...match } : null;
  });

  const byKey = new Map();
  for (const entry of scored) {
    if (!entry) continue;
    if (!byKey.has(entry.key)) byKey.set(entry.key, []);
    byKey.get(entry.key).push(entry);
  }

  const accepted = [];
  for (const [, entries] of byKey) {
    if (entries[0].definition.repeatable) {
      entries.forEach((entry, index) => accepted.push({ ...entry, index }));
    } else {
      const best = entries.reduce((a, b) => (b.score > a.score ? b : a));
      accepted.push({ ...best, index: 0 });
    }
  }

  return accepted.sort((a, b) => a.position - b.position);
}
