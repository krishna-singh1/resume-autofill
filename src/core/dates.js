/**
 * Loose date parsing shared by the form filler and the resume parser.
 * Resumes and forms both hand us dates in whatever shape a human felt like.
 */

import { squish } from './text.js';

export const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/** Regex source for a month name, for callers building larger patterns. */
export const MONTH_PATTERN = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';

const PRESENT = /^(present|current|now|ongoing|to date|till date)$/i;

/** Month index (1-12) for a name or abbreviation, or 0 when unrecognised. */
export function monthNumber(name) {
  const key = squish(name).toLowerCase().replace(/\./g, '').slice(0, 3);
  const index = MONTHS.findIndex((month) => month.startsWith(key));
  return index + 1;
}

/**
 * Parse the date shapes people actually write: `2021`, `Mar 2021`, `03/2021`,
 * `2021-03-14`, `3/14/2021`. Returns null when nothing sensible is found.
 */
export function parseDateish(input) {
  const text = squish(input).toLowerCase();
  if (!text) return null;
  if (PRESENT.test(text)) return { present: true };

  const iso = text.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
  if (iso) return { year: +iso[1], month: +iso[2], day: iso[3] ? +iso[3] : 1 };

  const slashed = text.match(/^(\d{1,2})[/](\d{1,2})[/](\d{4})$/);
  if (slashed) return { year: +slashed[3], month: +slashed[1], day: +slashed[2] };

  const monthYear = text.match(/^(\d{1,2})[/-](\d{4})$/);
  if (monthYear) return { year: +monthYear[2], month: +monthYear[1], day: 1 };

  const named = text.match(/^([a-z]+)\.?[\s,]+(\d{4})$/);
  if (named) {
    const month = monthNumber(named[1]);
    if (month) return { year: +named[2], month, day: 1 };
  }

  const yearOnly = text.match(/^(\d{4})$/);
  if (yearOnly) return { year: +yearOnly[1], month: 1, day: 1 };

  return null;
}

/** `Mar 2021` -> `2021-03`; returns '' for "Present" and unparseable input. */
export function toIsoMonth(input) {
  const parsed = parseDateish(input);
  if (!parsed || parsed.present || !parsed.year) return '';
  return `${String(parsed.year).padStart(4, '0')}-${String(parsed.month).padStart(2, '0')}`;
}

/** Coerce a stored date into the literal format an input element requires. */
export function formatForDateInput(value, type) {
  const parsed = parseDateish(value);
  if (!parsed || parsed.present || !parsed.year) return null;
  const year = String(parsed.year).padStart(4, '0');
  const month = String(parsed.month).padStart(2, '0');
  const day = String(parsed.day || 1).padStart(2, '0');
  if (type === 'month') return `${year}-${month}`;
  if (type === 'week') return null;
  return `${year}-${month}-${day}`;
}
