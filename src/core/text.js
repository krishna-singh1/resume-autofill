/**
 * Text normalisation shared by the field matcher and the resume parser.
 * Pure functions only — no DOM, no chrome APIs. Unit tested in tests/.
 */

/** Split camelCase/PascalCase into separate words so `firstName` -> `first Name`. */
function splitCamelCase(input) {
  return input.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
}

/**
 * Lowercase, strip accents, and reduce every non-alphanumeric run to a single
 * space. `job_application[answers][First Name]` -> `job application answers first name`.
 */
export function normalize(input) {
  if (!input) return '';
  return splitCamelCase(String(input))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Normalised word list. `"E-Mail Address"` -> `['e','mail','address']`. */
export function tokenize(input) {
  const normalized = normalize(input);
  return normalized ? normalized.split(' ') : [];
}

/**
 * True when `phrase` occurs as a run of whole words inside `tokens`.
 *
 * Whole-word matching is what keeps `name` from matching `username` or
 * `filename`, which a naive `String.includes` would happily do.
 */
export function containsPhrase(tokens, phrase) {
  const needle = tokenize(phrase);
  if (!needle.length || needle.length > tokens.length) return false;
  for (let i = 0; i <= tokens.length - needle.length; i += 1) {
    let hit = true;
    for (let j = 0; j < needle.length; j += 1) {
      if (tokens[i + j] !== needle[j]) {
        hit = false;
        break;
      }
    }
    if (hit) return true;
  }
  return false;
}

/** True when any of `phrases` occurs as a run of whole words inside `tokens`. */
export function containsAny(tokens, phrases) {
  return phrases.some((phrase) => containsPhrase(tokens, phrase));
}

/** Collapse whitespace without touching case or punctuation. */
export function squish(input) {
  return String(input || '').replace(/\s+/g, ' ').trim();
}

/**
 * Similarity in [0,1] between two short strings, using token overlap
 * (Dice coefficient). Used to pick the closest <option> for a stored value.
 */
export function similarity(a, b) {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const leftTokens = new Set(left.split(' '));
  const rightTokens = new Set(right.split(' '));
  let shared = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) shared += 1;
  return (2 * shared) / (leftTokens.size + rightTokens.size);
}
