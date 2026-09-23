/**
 * Best-effort extraction of a profile from resume plain text.
 *
 * Resumes have no schema, so this is unavoidably heuristic: it recognises the
 * layouts that are common, and the options page always shows the result for
 * review before anything is saved. Pure functions — the caller supplies text.
 */

import { MONTH_PATTERN, toIsoMonth } from './dates.js';
import { emptyEducationEntry, emptyProjectEntry, emptyWorkEntry } from './schema.js';
import { normalize, squish } from './text.js';

/** Heading words, compared after normalize() (lowercase, punctuation removed). */
const SECTIONS = [
  { id: 'summary', words: ['summary', 'professional summary', 'profile', 'objective', 'about', 'about me', 'overview'] },
  {
    id: 'experience',
    words: [
      'experience', 'work experience', 'professional experience', 'employment',
      'employment history', 'work history', 'career history', 'relevant experience',
    ],
  },
  { id: 'education', words: ['education', 'academic background', 'academics', 'education and training'] },
  {
    id: 'skills',
    words: ['skills', 'technical skills', 'core competencies', 'technologies', 'key skills', 'skills and tools', 'tech stack', 'skills tools'],
  },
  { id: 'projects', words: ['projects', 'personal projects', 'selected projects', 'side projects', 'notable projects'] },
  { id: 'certifications', words: ['certifications', 'certificates', 'licenses', 'licences', 'certifications and licenses'] },
  {
    id: 'awards',
    words: ['awards', 'honors', 'honours', 'achievements', 'awards recognition', 'awards and recognition', 'honors and awards', 'awards and honors'],
  },
];

const TITLE_WORDS = [
  'engineer', 'developer', 'manager', 'analyst', 'designer', 'intern', 'lead', 'director',
  'consultant', 'scientist', 'architect', 'administrator', 'specialist', 'coordinator',
  'associate', 'president', 'officer', 'head', 'founder', 'cto', 'ceo', 'cfo', 'vp',
  'principal', 'staff', 'senior', 'junior', 'programmer', 'researcher', 'technician',
  'executive', 'supervisor', 'strategist', 'accountant', 'teacher', 'professor', 'writer',
  'editor', 'recruiter', 'marketer', 'nurse', 'advisor', 'apprentice', 'trainee',
];

const SCHOOL_WORDS = ['university', 'college', 'institute', 'school', 'academy', 'polytechnic', 'universidad', 'iit', 'nit'];

const DEGREE_PATTERN =
  /\b(bachelor(?:'?s)?|master(?:'?s)?|associate(?:'?s)?|doctor(?:ate)?|ph\.?\s?d\.?|b\.?\s?tech|m\.?\s?tech|b\.?\s?sc\.?|m\.?\s?sc\.?|b\.?\s?s\.?|m\.?\s?s\.?|b\.?\s?a\.?|m\.?\s?a\.?|b\.?\s?e\.?|m\.?\s?e\.?|mba|bba|bca|mca|diploma|high school)(?![a-z])/i;

const BULLET_PATTERN = /^\s*[•·‣▪◦*\-–—]\s+/;
const DATE_TOKEN = `(?:${MONTH_PATTERN}\\s*,?\\s*\\d{4}|\\d{1,2}[/-]\\d{4}|\\d{4})`;
const DATE_RANGE = new RegExp(
  `(${DATE_TOKEN})\\s*(?:-|–|—|to|until|through)\\s*(${DATE_TOKEN}|present|current|now|ongoing|to date)`,
  'i',
);

const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+\w/;
const LINKEDIN_PATTERN = /(?:https?:\/\/)?(?:[\w-]+\.)?linkedin\.com\/[^\s,;)|]+/i;
const GITHUB_PATTERN = /(?:https?:\/\/)?(?:www\.)?github\.com\/[^\s,;)|]+/i;
const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s,;)|]+|\b[\w-]+\.(?:com|dev|io|me|net|org|app|xyz|co)\b(?:\/[^\s,;)|]*)?/gi;

function isBullet(line) {
  return BULLET_PATTERN.test(line);
}

function stripBullet(line) {
  return squish(line.replace(BULLET_PATTERN, ''));
}

function headingId(line) {
  // normalize() drops punctuation, so "Awards & Recognition" and "SKILLS:" both compare cleanly.
  const cleaned = normalize(line);
  if (!cleaned || cleaned.length > 45) return null;
  const section = SECTIONS.find((candidate) => candidate.words.includes(cleaned));
  return section ? section.id : null;
}

/** Split the document into a preamble (contact block) plus named sections. */
export function splitSections(lines) {
  const preamble = [];
  const sections = {};
  let current = null;

  for (const line of lines) {
    const id = headingId(line);
    if (id) {
      current = id;
      if (!sections[current]) sections[current] = [];
      continue;
    }
    if (current) sections[current].push(line);
    else preamble.push(line);
  }
  return { preamble, sections };
}

export function extractContact(text) {
  const contact = { email: '', phone: '', linkedin: '', github: '', portfolio: '' };

  contact.email = text.match(EMAIL_PATTERN)?.[0] || '';
  contact.linkedin = LINKEDIN_PATTERN.exec(text)?.[0] || '';
  contact.github = GITHUB_PATTERN.exec(text)?.[0] || '';

  // Require enough digits that we don't mistake a date range for a phone number.
  for (const candidate of text.match(/[+(]?\d[\d\s().-]{7,}\d/g) || []) {
    const digits = candidate.replace(/\D/g, '');
    if (digits.length >= 9 && digits.length <= 15) {
      contact.phone = squish(candidate);
      break;
    }
  }

  for (const url of text.match(URL_PATTERN) || []) {
    if (/linkedin\.com|github\.com/i.test(url)) continue;
    if (contact.email && contact.email.includes(url.replace(/^https?:\/\//, ''))) continue;
    contact.portfolio = url;
    break;
  }

  return contact;
}

/** The applicant's name is nearly always the first human-name-shaped line. */
export function extractName(preamble) {
  for (const raw of preamble.slice(0, 6)) {
    const line = squish(raw).replace(/[|,].*$/, '').trim();
    if (!line || line.length > 40) continue;
    if (/\d|@|https?:|resume|curriculum vitae/i.test(line)) continue;
    const words = line.split(' ').filter(Boolean);
    if (words.length < 2 || words.length > 4) continue;
    if (!words.every((word) => /^[A-Z][a-zA-Z'’.-]*$/.test(word) || /^[A-Z.'’-]+$/.test(word))) continue;

    const parts = line.split(' ');
    return { firstName: parts[0], lastName: parts[parts.length - 1], fullName: line };
  }
  return { firstName: '', lastName: '', fullName: '' };
}

export function extractLocation(preamble) {
  for (const raw of preamble.slice(0, 8)) {
    // Contact lines often hold "City, ST | email | phone" together, so strip
    // the addresses rather than skipping the line.
    const line = squish(raw.replace(EMAIL_PATTERN, ' ').replace(URL_PATTERN, ' '));
    const match = line.match(/([A-Z][a-zA-Z.\-' ]{1,30}),\s*([A-Z]{2}\b|[A-Z][a-zA-Z]{2,20})/);
    if (match) return { city: squish(match[1]), state: squish(match[2]) };
  }
  return { city: '', state: '' };
}

function looksLikeTitle(text) {
  const words = new Set(normalize(text).split(' '));
  return TITLE_WORDS.some((word) => words.has(word) || words.has(`${word}s`));
}

/** "Pune, India", "Austin, TX", "Remote" — but not "Software Engineer, Square". */
const LOCATION_PATTERN = /^(?:remote|hybrid|on-?site)$|^[A-Z][A-Za-z.'\- ]{1,30},\s*[A-Z][A-Za-z.'\- ]{1,30}(?:,\s*[A-Z][A-Za-z.'\- ]{1,30})?$/;

function looksLikeLocation(text) {
  return LOCATION_PATTERN.test(squish(text)) && !looksLikeTitle(text);
}

/**
 * Collapse whitespace, but turn a tab or a run of 3+ spaces into ` | ` first.
 * The PDF extractor emits those for column gaps ("Title       City, Country"),
 * and losing them would glue the two columns into one phrase.
 */
function prepLine(raw) {
  return squish(String(raw).replace(/\t| {3,}/g, ' | '));
}

/** Strong separators: pipes, bullets, spaced dashes, column gaps. */
function splitSegments(text) {
  return text
    .replace(/\(\s*\)/g, '')
    .split(/\s*[|•·]\s*|\s+[–—]\s+/)
    .map(squish)
    .filter((part) => part.length > 1);
}

/**
 * Split `Senior Engineer | Acme Corp` into its parts.
 * Commas separate parts in job headers but are part of school names
 * ("University of California, Berkeley"), so callers choose.
 */
function splitHeaderParts(text, { commas = true } = {}) {
  const segments = splitSegments(text);
  if (!commas) return segments;
  return segments
    .flatMap((segment) => segment.split(/\s+\bat\b\s+|\s*,\s*/i))
    .map(squish)
    .filter((part) => part.length > 1);
}

/** Fill whichever of title / company / location the header text supplies. */
function assignRoleAndCompany(entry, text) {
  for (const segment of splitSegments(text)) {
    if (looksLikeLocation(segment)) {
      if (!entry.location) entry.location = segment;
      continue;
    }

    const parts = segment.split(/\s+\bat\b\s+|\s*,\s*/i).map(squish).filter((part) => part.length > 1);
    if (!parts.length) continue;

    if (parts.length === 1) {
      if (looksLikeTitle(parts[0]) && !entry.title) entry.title = parts[0];
      else if (!entry.company) entry.company = parts[0];
      else if (!entry.title) entry.title = parts[0];
      continue;
    }

    const titlePart = parts.find(looksLikeTitle);
    const rest = parts.filter((part) => part !== titlePart);
    if (titlePart && !entry.title) entry.title = titlePart;
    if (!entry.company && rest.length) entry.company = rest[0];
    if (!entry.location && rest.length > 1) entry.location = rest.slice(1).join(', ');
  }
}

/** A line that reads as a header (short, capitalised, no sentence punctuation). */
function looksLikeHeader(line) {
  return line.length <= 90 && /^[A-Z0-9(]/.test(line) && !/[.!?]$/.test(line);
}

/**
 * Stronger test for "this starts a new job", used right after bullet text
 * where a wrapped sentence fragment is the other likely explanation.
 */
function looksLikeNewHeader(line) {
  return looksLikeHeader(line) && (looksLikeTitle(line) || /[|,–—]/.test(line) || line.split(' ').length <= 5);
}

function datesFrom(line) {
  const match = DATE_RANGE.exec(line);
  if (!match) return null;
  const end = match[2];
  const isPresent = /present|current|now|ongoing|to date/i.test(end);
  return {
    matched: match[0],
    startDate: toIsoMonth(match[1]),
    endDate: isPresent ? '' : toIsoMonth(end),
    current: isPresent,
  };
}

export function parseExperience(lines) {
  const entries = [];
  let pending = [];
  let current = null;
  let lastWasBullet = false;

  const appendToLastHighlight = (line) => {
    const index = current.highlights.length - 1;
    current.highlights[index] = `${current.highlights[index]} ${line}`;
  };

  for (const raw of lines) {
    const line = prepLine(raw);
    if (!line) continue;

    if (isBullet(line)) {
      if (current) current.highlights.push(stripBullet(line));
      lastWasBullet = true;
      continue;
    }

    const dates = datesFrom(line);
    if (dates) {
      current = { ...emptyWorkEntry(), startDate: dates.startDate, endDate: dates.endDate, current: dates.current };
      entries.push(current);

      const remainder = squish(line.replace(dates.matched, '').replace(/[|•·,–—-]+\s*$/, '').replace(/^\s*[|•·,–—-]+/, ''));
      for (const text of [remainder, ...pending].filter(Boolean)) assignRoleAndCompany(current, text);
      pending = [];
      lastWasBullet = false;
      continue;
    }

    // A wrapped bullet continues on the next line without its own marker. It
    // usually starts lowercase; and once an entry has its header, any non-bullet
    // text right after a bullet is far more likely a continuation than a header.
    const headerComplete = Boolean(current?.company && current?.title);
    if (current?.highlights.length && (/^[a-z]/.test(line) || (lastWasBullet && headerComplete && !looksLikeNewHeader(line)))) {
      appendToLastHighlight(line);
      continue;
    }

    // Header lines belong to the current entry only until its bullets begin.
    if (current && !lastWasBullet && (!headerComplete || !current.location) && looksLikeHeader(line)) {
      assignRoleAndCompany(current, line);
      continue;
    }
    if (current && line.length > 80) {
      current.highlights.push(line); // paragraph-style description without bullets
      lastWasBullet = true;
      continue;
    }

    // Header lines can precede the date line; keep the most recent couple.
    pending.push(line);
    if (pending.length > 2) pending.shift();
    lastWasBullet = false;
  }

  return entries.filter((entry) => entry.company || entry.title);
}

export function parseEducation(lines) {
  const entries = [];
  let current = null;

  const ensureEntry = () => {
    if (!current) {
      current = emptyEducationEntry();
      entries.push(current);
    }
    return current;
  };

  for (const raw of lines) {
    const line = prepLine(raw);
    if (!line) continue;

    const lower = line.toLowerCase();
    const dates = datesFrom(line);
    const yearMatch = line.match(/\b(19|20)\d{2}\b/g);
    const isSchool = SCHOOL_WORDS.some((word) => lower.includes(word));
    // Strip dates and any trailing single date ("May 2019") before reading the words.
    const withoutDates = squish(
      line.replace(dates?.matched || '', '').replace(new RegExp(`\\|?\\s*${DATE_TOKEN}\\s*$`, 'i'), ''),
    );
    const degreeMatch = DEGREE_PATTERN.exec(withoutDates);

    if (isSchool) {
      if (current?.school) current = null; // a second school starts a new entry
      const entry = ensureEntry();
      const segments = splitHeaderParts(withoutDates, { commas: false });
      entry.school = segments[0] || withoutDates;
      const location = segments.slice(1).find(looksLikeLocation);
      if (location) entry.location = location;
    }

    if (degreeMatch) {
      const entry = ensureEntry();
      const [degreeSegment] = splitSegments(withoutDates.slice(degreeMatch.index));
      // "Bachelor of Technology (Hons.) in Computer Science" -> degree | field
      const split = degreeSegment.match(/^(.+?)\s+\bin\b\s+(.+)$/i);
      if (split) {
        entry.degree = squish(split[1]);
        entry.field = squish(split[2]).replace(/,.*$/, '');
      } else {
        entry.degree = squish(degreeMatch[0]);
        const field = degreeSegment.match(/\b(?:in|of)\s+([A-Za-z&\s]{3,50})/i);
        if (field) entry.field = squish(field[1]);
      }
    }

    const gpa = line.match(/\b(?:c?gpa|grade point average)\b[:\s]*([\d.]+(?:\s*\/\s*[\d.]+)?)/i);
    if (gpa) ensureEntry().gpa = squish(gpa[1]);

    if (current && yearMatch?.length) {
      if (dates) {
        current.startDate = current.startDate || dates.startDate;
        current.endDate = current.endDate || dates.endDate;
      } else if (!current.endDate) {
        // A lone "May 2019" or "2019" is the graduation date.
        const single = line.match(new RegExp(`${DATE_TOKEN}\\s*$`, 'i'));
        current.endDate = (single && toIsoMonth(single[0])) || yearMatch[yearMatch.length - 1];
      }
    }
  }

  return entries.filter((entry) => entry.school || entry.degree);
}

/** Split on skill delimiters, but keep "AWS (Lambda, S3, EC2)" together. */
function splitSkillList(line) {
  const pieces = [];
  let depth = 0;
  let buffer = '';
  for (const char of line) {
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && /[,;|•·]/.test(char)) {
      pieces.push(buffer);
      buffer = '';
    } else {
      buffer += char;
    }
  }
  pieces.push(buffer);
  return pieces;
}

export function parseSkills(lines) {
  const found = [];
  for (const raw of lines) {
    // Drop a leading category label: "Languages: Python, Go" -> "Python, Go".
    const line = prepLine(stripBullet(raw)).replace(/^[A-Za-z+#/&\s]{2,28}\s*:\s*/, '');
    for (const piece of splitSkillList(line)) {
      const skill = squish(piece).replace(/\.$/, '');
      if (skill.length >= 2 && skill.length <= 60 && !/^\d+$/.test(skill)) found.push(skill);
    }
  }
  return [...new Set(found)].slice(0, 60);
}

export function parseProjects(lines) {
  const entries = [];
  let current = null;

  for (const raw of lines) {
    const line = prepLine(raw);
    if (!line) continue;

    if (isBullet(line)) {
      if (current) current.highlights.push(stripBullet(line));
      continue;
    }

    current = { ...emptyProjectEntry(), name: splitHeaderParts(line)[0] || line };
    const url = line.match(URL_PATTERN);
    if (url) {
      current.url = url[0];
      current.name = squish(current.name.replace(url[0], '')) || current.name;
    }
    entries.push(current);
  }

  return entries.filter((entry) => entry.name);
}

/**
 * Parse resume text into profile fragments.
 * @returns {{profile: object, warnings: string[]}}
 */
export function parseResumeText(rawText) {
  const text = String(rawText || '').replace(/\r/g, '');
  const lines = text.split('\n').map((line) => line.trimEnd());
  const { preamble, sections } = splitSections(lines);

  const name = extractName(preamble.length ? preamble : lines);
  const contact = extractContact(text);
  const location = extractLocation(preamble.length ? preamble : lines.slice(0, 10));

  const profile = {
    basics: {
      firstName: name.firstName,
      lastName: name.lastName,
      email: contact.email,
      phone: contact.phone,
      city: location.city,
      state: location.state,
      summary: squish((sections.summary || []).join(' ')).slice(0, 1200),
    },
    links: { linkedin: contact.linkedin, github: contact.github, portfolio: contact.portfolio, twitter: '' },
    work: parseExperience(sections.experience || []),
    education: parseEducation(sections.education || []),
    skills: parseSkills(sections.skills || []),
    projects: parseProjects(sections.projects || []),
  };

  const warnings = [];
  if (!name.fullName) warnings.push('Could not identify your name.');
  if (!contact.email) warnings.push('Could not find an email address.');
  if (!Object.keys(sections).length) warnings.push('No section headings were recognised, so only contact details were read.');
  if (!profile.work.length) warnings.push('No work experience was recognised.');
  if (!profile.education.length) warnings.push('No education was recognised.');

  return { profile, warnings };
}
