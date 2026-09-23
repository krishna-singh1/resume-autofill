import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  extractContact,
  extractName,
  parseEducation,
  parseExperience,
  parseResumeText,
  parseSkills,
  splitSections,
} from '../src/core/parser.js';

const SAMPLE = readFileSync(new URL('./fixtures/sample-resume.txt', import.meta.url), 'utf8');

describe('splitSections', () => {
  it('recognises common headings regardless of case and colons', () => {
    const { preamble, sections } = splitSections(['Jane Doe', 'Experience:', 'x', 'EDUCATION', 'y', 'Technical Skills', 'z']);
    assert.deepEqual(preamble, ['Jane Doe']);
    assert.deepEqual(Object.keys(sections), ['experience', 'education', 'skills']);
  });

  it('does not treat long sentences containing a heading word as headings', () => {
    const { sections } = splitSections(['I have experience in many things and education too']);
    assert.deepEqual(sections, {});
  });
});

describe('extractContact', () => {
  it('finds email, phone and links', () => {
    const contact = extractContact(SAMPLE);
    assert.equal(contact.email, 'priya.raman@example.com');
    assert.equal(contact.phone, '(415) 555-0142');
    assert.equal(contact.linkedin, 'linkedin.com/in/priyaraman');
    assert.equal(contact.github, 'github.com/priyar');
    assert.equal(contact.portfolio, 'priyaraman.dev');
  });

  it('does not mistake a date range for a phone number', () => {
    assert.equal(extractContact('Jan 2018 - Dec 2020').phone, '');
  });
});

describe('extractName', () => {
  it('takes the first name-shaped line', () => {
    assert.deepEqual(extractName(['Priya Raman', 'San Francisco, CA']), {
      firstName: 'Priya',
      lastName: 'Raman',
      fullName: 'Priya Raman',
    });
  });

  it('skips lines with digits, emails, or too many words', () => {
    const name = extractName(['priya@example.com', '415 555 0142', 'Senior Backend Software Engineer Resume', 'Priya Raman']);
    assert.equal(name.fullName, 'Priya Raman');
  });
});

describe('parseExperience', () => {
  const entries = parseExperience(SAMPLE.split('EXPERIENCE')[1].split('EDUCATION')[0].split('\n'));

  it('finds one entry per date range', () => {
    assert.equal(entries.length, 3);
  });

  it('reads "Title | Company | dates" on one line', () => {
    assert.equal(entries[0].title, 'Senior Software Engineer');
    assert.equal(entries[0].company, 'Stripe');
    assert.equal(entries[0].startDate, '2021-01');
    assert.equal(entries[0].current, true);
    assert.equal(entries[0].highlights.length, 3);
    assert.match(entries[0].highlights[0], /^Designed idempotent/);
  });

  it('reads a header line followed by a dates line', () => {
    assert.equal(entries[1].title, 'Software Engineer');
    assert.equal(entries[1].company, 'Square');
    assert.equal(entries[1].startDate, '2018-03');
    assert.equal(entries[1].endDate, '2020-12');
    assert.equal(entries[1].highlights.length, 2);
  });

  it('reads an em-dash separated header with parenthesised dates', () => {
    assert.equal(entries[2].title, 'Software Engineer Intern');
    assert.equal(entries[2].company, 'Shopify');
    assert.equal(entries[2].startDate, '2017-05');
    assert.equal(entries[2].endDate, '2017-08');
  });
});

describe('parseEducation', () => {
  it('reads school, degree, field, dates and GPA', () => {
    const [entry] = parseEducation([
      'University of California, Berkeley',
      'B.S. in Computer Science, 2014 – 2018',
      'GPA: 3.8/4.0',
    ]);
    assert.equal(entry.school, 'University of California, Berkeley');
    assert.equal(entry.degree, 'B.S.');
    assert.equal(entry.field, 'Computer Science');
    assert.equal(entry.startDate, '2014-01');
    assert.equal(entry.endDate, '2018-01');
    assert.equal(entry.gpa, '3.8/4.0');
  });

  it('starts a new entry for each school', () => {
    const entries = parseEducation([
      'Massachusetts Institute of Technology',
      'M.S. Computer Science, 2020',
      'Stanford University',
      'B.S. Physics, 2018',
    ]);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].degree, 'M.S.');
    assert.equal(entries[1].school, 'Stanford University');
  });
});

describe('parseSkills', () => {
  it('strips category labels and splits on delimiters', () => {
    const skills = parseSkills(['Languages: Go, Python, TypeScript, SQL', 'Infrastructure: Kubernetes | Kafka']);
    assert.deepEqual(skills, ['Go', 'Python', 'TypeScript', 'SQL', 'Kubernetes', 'Kafka']);
  });
});

/**
 * LaTeX "Jake's template" style: two columns joined by wide gaps, icon-font
 * glyphs instead of link text, bullets that wrap onto unmarked lines, and an
 * "Awards & Recognition" section between experience and education.
 */
describe('LaTeX two-column layout', () => {
  const LATEX = readFileSync(new URL('./fixtures/latex-two-column.txt', import.meta.url), 'utf8');
  const { profile, warnings } = parseResumeText(LATEX);

  it('reads contact details and links from the appended Links line', () => {
    assert.equal(profile.basics.firstName, 'Arjun');
    assert.equal(profile.basics.lastName, 'Mehta');
    assert.equal(profile.basics.email, 'arjun.mehta@example.com');
    assert.equal(profile.basics.phone, '+91-9876543210');
    assert.equal(profile.links.linkedin, 'https://linkedin.com/in/arjun-mehta');
    assert.equal(profile.links.github, 'https://github.com/arjunm');
    assert.equal(profile.links.portfolio, 'https://leetcode.com/arjunm');
  });

  it('splits "Company   Dates" and "Title   City, Country" columns correctly', () => {
    assert.equal(profile.work.length, 3);
    const [caizin, paytm, tavisca] = profile.work;
    assert.deepEqual(
      [caizin.company, caizin.title, caizin.location, caizin.startDate, caizin.current],
      ['Caizin', 'Senior Software Engineer 2', 'Pune, India', '2024-08', true],
    );
    assert.deepEqual([paytm.company, paytm.title, paytm.location, paytm.endDate], ['Paytm', 'Senior Software Engineer', 'Noida, India', '2024-08']);
    assert.deepEqual([tavisca.company, tavisca.title, tavisca.location], ['Tavisca Solutions (A Division of JPMorgan Chase)', 'Software Developer', 'Pune, India']);
  });

  it('joins wrapped bullet lines back onto their bullet', () => {
    const [caizin, paytm] = profile.work;
    assert.equal(caizin.highlights.length, 3);
    assert.match(caizin.highlights[0], /records\/day, powering automated reporting and insights for 10\+ enterprise customers$/);
    assert.match(caizin.highlights[1], /by 40% and improving system throughput/);
    assert.equal(paytm.highlights.length, 2);
    assert.match(paytm.highlights[1], /onboarding 500K\+ devices within 6 months$/);
  });

  it('keeps awards out of the last job', () => {
    const tavisca = profile.work[2];
    assert.equal(tavisca.highlights.length, 1);
    assert.ok(!tavisca.highlights.some((line) => /Award/.test(line)));
  });

  it('reads degree, field, school, location and graduation month', () => {
    const [education] = profile.education;
    assert.equal(education.school, 'Lovely Professional University');
    assert.equal(education.location, 'Phagwara, Punjab');
    assert.equal(education.degree, 'Bachelor of Technology (Hons.)');
    assert.equal(education.field, 'Computer Science and Engineering');
    assert.equal(education.endDate, '2019-05');
  });

  it('keeps parenthesised skill groups together', () => {
    assert.ok(profile.skills.includes('AWS (IoT Core, Lambda, S3, EC2, Rule Engine)'));
    assert.ok(profile.skills.includes('Domain-Driven Design (DDD)'));
    assert.ok(!profile.skills.includes('Lambda'));
  });

  it('produces no warnings', () => {
    assert.deepEqual(warnings, []);
  });
});

describe('parseResumeText end to end', () => {
  const { profile, warnings } = parseResumeText(SAMPLE);

  it('assembles a profile', () => {
    assert.equal(profile.basics.firstName, 'Priya');
    assert.equal(profile.basics.lastName, 'Raman');
    assert.equal(profile.basics.email, 'priya.raman@example.com');
    assert.equal(profile.basics.city, 'San Francisco');
    assert.equal(profile.basics.state, 'CA');
    assert.match(profile.basics.summary, /^Backend engineer/);
    assert.equal(profile.work.length, 3);
    assert.equal(profile.education.length, 1);
    assert.ok(profile.skills.includes('Kubernetes'));
    assert.equal(profile.projects[0].name, 'ledgerlite');
    assert.equal(profile.projects[0].url, 'github.com/priyar/ledgerlite');
  });

  it('emits no warnings for a well-formed resume', () => {
    assert.deepEqual(warnings, []);
  });

  it('warns rather than throws on unstructured text', () => {
    const result = parseResumeText('just some words');
    assert.ok(result.warnings.length >= 3);
    assert.equal(result.profile.work.length, 0);
  });
});
