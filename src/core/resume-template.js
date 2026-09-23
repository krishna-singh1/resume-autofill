/**
 * Renders a profile as a printable, ATS-friendly resume.
 *
 * Nodes are built with the DOM API rather than an HTML string so that text
 * from the profile can never be interpreted as markup.
 */

import { MONTHS } from './dates.js';
import { formattedAddress, fullName } from './schema.js';
import { squish } from './text.js';

/** `2021-03` -> `Mar 2021`. Unparseable values are shown as written. */
export function formatMonthYear(value) {
  const text = squish(value);
  if (!text) return '';
  const iso = text.match(/^(\d{4})-(\d{1,2})/);
  if (!iso) return text;
  const month = MONTHS[Number(iso[2]) - 1];
  return month ? `${month.slice(0, 3).replace(/^./, (c) => c.toUpperCase())} ${iso[1]}` : iso[1];
}

export function formatRange(startDate, endDate, current) {
  const start = formatMonthYear(startDate);
  const end = current ? 'Present' : formatMonthYear(endDate);
  if (start && end) return `${start} – ${end}`;
  return start || end || '';
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function section(title) {
  const wrapper = el('section', 'resume-section');
  wrapper.append(el('h2', 'section-title', title));
  return wrapper;
}

function bulletList(items) {
  const list = el('ul', 'bullets');
  for (const item of items.filter(Boolean)) list.append(el('li', null, item));
  return list;
}

/** Company/school on the left, dates on the right. */
function entryHeader(primary, secondary, dates, location) {
  const header = el('div', 'entry-header');

  const left = el('div', 'entry-left');
  if (primary) left.append(el('div', 'entry-primary', primary));
  if (secondary) left.append(el('div', 'entry-secondary', secondary));
  header.append(left);

  const right = el('div', 'entry-right');
  if (dates) right.append(el('div', 'entry-dates', dates));
  if (location) right.append(el('div', 'entry-location', location));
  header.append(right);

  return header;
}

function contactLine(profile) {
  const parts = [
    profile.basics.email,
    profile.basics.phone,
    formattedAddress(profile) || [profile.basics.city, profile.basics.state].filter(Boolean).join(', '),
    profile.links.linkedin,
    profile.links.github,
    profile.links.portfolio,
  ]
    .map(squish)
    .filter(Boolean);
  return parts.join('  ·  ');
}

/** @returns {DocumentFragment} */
export function renderResume(profile) {
  const fragment = document.createDocumentFragment();

  const header = el('header', 'resume-header');
  header.append(el('h1', 'resume-name', fullName(profile) || 'Your Name'));
  const contact = contactLine(profile);
  if (contact) header.append(el('div', 'resume-contact', contact));
  fragment.append(header);

  if (squish(profile.basics.summary)) {
    const summary = section('Summary');
    summary.append(el('p', 'summary-text', squish(profile.basics.summary)));
    fragment.append(summary);
  }

  if (profile.work?.length) {
    const work = section('Experience');
    for (const entry of profile.work) {
      const block = el('article', 'entry');
      block.append(
        entryHeader(entry.company, entry.title, formatRange(entry.startDate, entry.endDate, entry.current), entry.location),
      );
      if (entry.highlights?.length) block.append(bulletList(entry.highlights));
      work.append(block);
    }
    fragment.append(work);
  }

  if (profile.projects?.length) {
    const projects = section('Projects');
    for (const project of profile.projects) {
      const block = el('article', 'entry');
      block.append(entryHeader(project.name, project.description, '', project.url));
      if (project.highlights?.length) block.append(bulletList(project.highlights));
      projects.append(block);
    }
    fragment.append(projects);
  }

  if (profile.education?.length) {
    const education = section('Education');
    for (const entry of profile.education) {
      const degree = [entry.degree, entry.field].filter(Boolean).join(', ');
      const block = el('article', 'entry');
      block.append(
        entryHeader(
          entry.school,
          [degree, entry.gpa ? `GPA ${entry.gpa}` : ''].filter(Boolean).join('  ·  '),
          formatRange(entry.startDate, entry.endDate, false),
          entry.location,
        ),
      );
      education.append(block);
    }
    fragment.append(education);
  }

  if (profile.skills?.length) {
    const skills = section('Skills');
    skills.append(el('p', 'skills-text', profile.skills.join('  ·  ')));
    fragment.append(skills);
  }

  return fragment;
}

/** Plain-text version, handy for pasting into a textarea on an application. */
export function resumeToText(profile) {
  const lines = [];
  const push = (text = '') => lines.push(text);

  push(fullName(profile));
  push(contactLine(profile));

  if (squish(profile.basics.summary)) {
    push();
    push('SUMMARY');
    push(squish(profile.basics.summary));
  }

  if (profile.work?.length) {
    push();
    push('EXPERIENCE');
    for (const entry of profile.work) {
      push();
      push([entry.title, entry.company].filter(Boolean).join(' — '));
      push([formatRange(entry.startDate, entry.endDate, entry.current), entry.location].filter(Boolean).join('  |  '));
      for (const highlight of entry.highlights || []) push(`  - ${highlight}`);
    }
  }

  if (profile.education?.length) {
    push();
    push('EDUCATION');
    for (const entry of profile.education) {
      push();
      push(entry.school);
      push(
        [[entry.degree, entry.field].filter(Boolean).join(', '), formatRange(entry.startDate, entry.endDate, false)]
          .filter(Boolean)
          .join('  |  '),
      );
    }
  }

  if (profile.skills?.length) {
    push();
    push('SKILLS');
    push(profile.skills.join(', '));
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
