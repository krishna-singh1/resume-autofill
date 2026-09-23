/**
 * The canonical profile shape. Every other module addresses profile data
 * through the dotted key paths defined here (e.g. `basics.email`,
 * `work[].company`), never by poking at object literals directly.
 *
 * Pure functions only — no DOM, no chrome APIs.
 */

import { squish } from './text.js';

export const PROFILE_VERSION = 1;

/** Repeating sections are stored most-recent-first; index 0 means "current". */
export function emptyProfile() {
  return {
    version: PROFILE_VERSION,
    basics: {
      firstName: '',
      lastName: '',
      preferredName: '',
      pronouns: '',
      email: '',
      phone: '',
      addressLine1: '',
      city: '',
      state: '',
      postalCode: '',
      country: '',
      summary: '',
    },
    links: { linkedin: '', github: '', portfolio: '', twitter: '' },
    work: [],
    education: [],
    skills: [],
    projects: [],
    application: {
      coverLetter: '',
      desiredSalary: '',
      availableStartDate: '',
      noticePeriod: '',
      willingToRelocate: '',
      willingToTravel: '',
      howHeard: '',
      yearsOfExperience: '',
    },
    workAuth: {
      authorized: '',
      requiresSponsorship: '',
      visaStatus: '',
    },
    eeo: {
      gender: '',
      hispanicLatino: '',
      race: '',
      veteranStatus: '',
      disabilityStatus: '',
    },
  };
}

export function emptyWorkEntry() {
  return { company: '', title: '', location: '', startDate: '', endDate: '', current: false, highlights: [] };
}

export function emptyEducationEntry() {
  return { school: '', degree: '', field: '', location: '', startDate: '', endDate: '', gpa: '' };
}

export function emptyProjectEntry() {
  return { name: '', url: '', description: '', highlights: [] };
}

/**
 * Fill in anything a stored profile is missing so callers can always assume the
 * full shape exists. Also runs whatever migrations older versions need.
 */
export function normalizeProfile(stored) {
  const base = emptyProfile();
  if (!stored || typeof stored !== 'object') return base;

  const merged = {
    ...base,
    ...stored,
    basics: { ...base.basics, ...(stored.basics || {}) },
    links: { ...base.links, ...(stored.links || {}) },
    application: { ...base.application, ...(stored.application || {}) },
    workAuth: { ...base.workAuth, ...(stored.workAuth || {}) },
    eeo: { ...base.eeo, ...(stored.eeo || {}) },
  };

  merged.version = PROFILE_VERSION;
  merged.skills = Array.isArray(stored.skills) ? stored.skills.filter(Boolean) : [];
  merged.work = (Array.isArray(stored.work) ? stored.work : []).map((entry) => ({
    ...emptyWorkEntry(),
    ...entry,
    highlights: Array.isArray(entry?.highlights) ? entry.highlights.filter(Boolean) : [],
  }));
  merged.education = (Array.isArray(stored.education) ? stored.education : []).map((entry) => ({
    ...emptyEducationEntry(),
    ...entry,
  }));
  merged.projects = (Array.isArray(stored.projects) ? stored.projects : []).map((entry) => ({
    ...emptyProjectEntry(),
    ...entry,
    highlights: Array.isArray(entry?.highlights) ? entry.highlights.filter(Boolean) : [],
  }));

  return merged;
}

export function fullName(profile) {
  return squish(`${profile?.basics?.firstName || ''} ${profile?.basics?.lastName || ''}`);
}

/** Single-line postal address, skipping empty parts. */
export function formattedAddress(profile) {
  const b = profile?.basics || {};
  const line = [b.addressLine1, b.city, b.state, b.postalCode, b.country].map(squish).filter(Boolean);
  return line.join(', ');
}

/**
 * Values that are computed rather than stored, keyed by the same dotted paths
 * the field map uses. Kept separate so the editor never has to keep them in sync.
 */
const DERIVED = {
  'basics.fullName': (profile) => fullName(profile),
  'basics.address': (profile) => formattedAddress(profile),
  'skills.list': (profile) => (profile.skills || []).join(', '),
  'application.yearsOfExperience': (profile) =>
    profile.application?.yearsOfExperience || String(estimateYearsOfExperience(profile) || ''),
};

/** Rough years of experience from the earliest work start date to today. */
export function estimateYearsOfExperience(profile) {
  const years = (profile.work || [])
    .map((entry) => Number.parseInt(String(entry.startDate).slice(0, 4), 10))
    .filter((year) => Number.isFinite(year) && year > 1950);
  if (!years.length) return 0;
  return Math.max(0, new Date().getFullYear() - Math.min(...years));
}

/**
 * Read a dotted key path out of a profile.
 *
 * `work[].company` needs an `index` — that is how a form with three
 * "Company" inputs gets three different employers rather than the same one
 * three times.
 */
export function resolveValue(profile, key, index = 0) {
  if (!profile || !key) return '';
  if (DERIVED[key]) return DERIVED[key](profile);

  const [head, ...rest] = key.split('.');
  if (head.endsWith('[]')) {
    const list = profile[head.slice(0, -2)];
    if (!Array.isArray(list) || !list[index]) return '';
    return readPath(list[index], rest);
  }
  return readPath(profile, key.split('.'));
}

function readPath(root, path) {
  let node = root;
  for (const segment of path) {
    if (node == null || typeof node !== 'object') return '';
    node = node[segment];
  }
  if (node == null) return '';
  if (Array.isArray(node)) return node.join(', ');
  if (typeof node === 'boolean') return node ? 'Yes' : 'No';
  return String(node);
}

/** Number of entries available for a repeating key like `work[].company`. */
export function repeatLength(profile, key) {
  const head = key.split('.')[0];
  if (!head.endsWith('[]')) return 1;
  const list = profile[head.slice(0, -2)];
  return Array.isArray(list) ? list.length : 0;
}
