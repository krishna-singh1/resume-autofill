import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { FIELD_DEFINITIONS } from '../src/core/fieldmap.js';
import { assignFields, bestMatch, cleanLabel, MATCH_THRESHOLD, scoreDefinition } from '../src/core/matcher.js';

/** Build a descriptor the way scanner.js would, with sensible defaults. */
function field(overrides = {}) {
  return {
    tag: 'input',
    type: 'text',
    kind: 'text',
    name: '',
    id: '',
    dataAttr: '',
    autocomplete: '',
    placeholder: '',
    ariaLabel: '',
    title: '',
    label: '',
    sectionText: '',
    options: [],
    ...overrides,
  };
}

const keyOf = (descriptor) => bestMatch(descriptor)?.key ?? null;

describe('cleanLabel', () => {
  it('strips required markers', () => {
    assert.equal(cleanLabel('Email *'), 'Email');
    assert.equal(cleanLabel('Phone (optional)'), 'Phone');
    assert.equal(cleanLabel('Required Full Name'), 'Full Name');
  });
});

describe('identity fields', () => {
  it('matches first and last name by label', () => {
    assert.equal(keyOf(field({ label: 'First Name' })), 'basics.firstName');
    assert.equal(keyOf(field({ label: 'Last name *' })), 'basics.lastName');
    assert.equal(keyOf(field({ label: 'Given name' })), 'basics.firstName');
    assert.equal(keyOf(field({ label: 'Surname' })), 'basics.lastName');
  });

  it('matches by camelCase attribute names when there is no label', () => {
    assert.equal(keyOf(field({ name: 'firstName' })), 'basics.firstName');
    assert.equal(keyOf(field({ id: 'last_name' })), 'basics.lastName');
  });

  it('matches by autocomplete over conflicting label text', () => {
    assert.equal(keyOf(field({ label: 'Name', autocomplete: 'given-name' })), 'basics.firstName');
  });

  it('only treats a bare "Name" label as the full name', () => {
    assert.equal(keyOf(field({ label: 'Name' })), 'basics.fullName');
    assert.equal(keyOf(field({ label: 'Full name' })), 'basics.fullName');
  });

  it('does not put the applicant name into company / school / reference fields', () => {
    assert.equal(keyOf(field({ label: 'Company name' })), 'work[].company');
    assert.equal(keyOf(field({ label: 'Reference name' })), null);
    assert.equal(keyOf(field({ label: 'Emergency contact name' })), null);
    assert.equal(keyOf(field({ label: 'Username' })), null);
  });

  it('reads Workday data-automation-id hints', () => {
    assert.equal(keyOf(field({ dataAttr: 'legalNameSection_firstName' })), 'basics.firstName');
  });
});

describe('contact fields', () => {
  it('matches email by label, type and autocomplete', () => {
    assert.equal(keyOf(field({ label: 'Email' })), 'basics.email');
    assert.equal(keyOf(field({ label: 'E-mail address' })), 'basics.email');
    assert.equal(keyOf(field({ type: 'email', name: 'user' })), null, 'type alone is not enough');
    assert.equal(keyOf(field({ type: 'email', name: 'email' })), 'basics.email');
  });

  it('never fills confirm / verify email fields', () => {
    assert.equal(keyOf(field({ label: 'Confirm email' })), null);
    assert.equal(keyOf(field({ label: 'Re-enter email address' })), null);
    assert.equal(keyOf(field({ name: 'email_confirmation' })), null);
  });

  it('matches phone variants', () => {
    assert.equal(keyOf(field({ label: 'Phone' })), 'basics.phone');
    assert.equal(keyOf(field({ label: 'Mobile number' })), 'basics.phone');
    assert.equal(keyOf(field({ type: 'tel', name: 'phoneNumber' })), 'basics.phone');
  });

  it('does not confuse email address with street address', () => {
    assert.equal(keyOf(field({ label: 'Email Address' })), 'basics.email');
    assert.equal(keyOf(field({ label: 'Street Address' })), 'basics.addressLine1');
    assert.equal(keyOf(field({ label: 'Address' })), 'basics.addressLine1');
  });

  it('matches address parts', () => {
    assert.equal(keyOf(field({ label: 'City' })), 'basics.city');
    assert.equal(keyOf(field({ label: 'State / Province' })), 'basics.state');
    assert.equal(keyOf(field({ label: 'Zip Code' })), 'basics.postalCode');
    assert.equal(keyOf(field({ label: 'Postal code' })), 'basics.postalCode');
    assert.equal(keyOf(field({ label: 'Country', kind: 'choice', tag: 'select' })), 'basics.country');
  });

  it('does not treat "Citizenship" as a country or city', () => {
    assert.notEqual(keyOf(field({ label: 'Citizenship' })), 'basics.country');
    assert.notEqual(keyOf(field({ label: 'Citizenship' })), 'basics.city');
  });
});

describe('links', () => {
  it('matches social and portfolio links', () => {
    assert.equal(keyOf(field({ label: 'LinkedIn Profile' })), 'links.linkedin');
    assert.equal(keyOf(field({ name: 'urls[GitHub]' })), 'links.github');
    assert.equal(keyOf(field({ label: 'Portfolio URL' })), 'links.portfolio');
    assert.equal(keyOf(field({ label: 'Website' })), 'links.portfolio');
  });

  it('does not fill a company website with the personal portfolio', () => {
    assert.equal(keyOf(field({ label: 'Company website' })), null);
  });
});

describe('experience and education', () => {
  it('matches title and company', () => {
    assert.equal(keyOf(field({ label: 'Job Title' })), 'work[].title');
    assert.equal(keyOf(field({ label: 'Current company' })), 'work[].company');
    assert.equal(keyOf(field({ label: 'Employer' })), 'work[].company');
  });

  it('disambiguates "Start date" by section', () => {
    assert.equal(
      keyOf(field({ label: 'Start date', sectionText: 'Work Experience' })),
      'work[].startDate',
    );
    assert.equal(
      keyOf(field({ label: 'Available start date' })),
      'application.availableStartDate',
    );
  });

  it('matches education fields', () => {
    assert.equal(keyOf(field({ label: 'School' })), 'education[].school');
    assert.equal(keyOf(field({ label: 'University', sectionText: 'Education' })), 'education[].school');
    assert.equal(keyOf(field({ label: 'Degree' })), 'education[].degree');
    assert.equal(keyOf(field({ label: 'Field of study' })), 'education[].field');
    assert.equal(keyOf(field({ label: 'GPA' })), 'education[].gpa');
  });
});

describe('application questions', () => {
  it('matches common yes/no questions to boolean keys', () => {
    assert.equal(
      keyOf(field({ label: 'Are you legally authorized to work in the United States?', kind: 'choice' })),
      'workAuth.authorized',
    );
    assert.equal(
      keyOf(field({ label: 'Will you now or in the future require sponsorship?', kind: 'choice' })),
      'workAuth.requiresSponsorship',
    );
    assert.equal(keyOf(field({ label: 'Are you willing to relocate?', kind: 'choice' })), 'application.willingToRelocate');
  });

  it('matches salary, notice, how-heard, cover letter', () => {
    assert.equal(keyOf(field({ label: 'Desired salary' })), 'application.desiredSalary');
    assert.equal(keyOf(field({ label: 'Notice period' })), 'application.noticePeriod');
    assert.equal(keyOf(field({ label: 'How did you hear about us?', kind: 'choice' })), 'application.howHeard');
    assert.equal(keyOf(field({ label: 'Cover letter', kind: 'longtext', tag: 'textarea' })), 'application.coverLetter');
  });

  it('matches EEO questions', () => {
    assert.equal(keyOf(field({ label: 'Gender', kind: 'choice' })), 'eeo.gender');
    assert.equal(keyOf(field({ label: 'Veteran status', kind: 'choice' })), 'eeo.veteranStatus');
    assert.equal(keyOf(field({ label: 'Race / Ethnicity', kind: 'choice' })), 'eeo.race');
    assert.equal(keyOf(field({ label: 'Are you Hispanic or Latino?', kind: 'choice' })), 'eeo.hispanicLatino');
  });
});

describe('kind compatibility', () => {
  it('only lets file definitions fill file inputs', () => {
    assert.equal(keyOf(field({ label: 'Resume/CV', kind: 'file', type: 'file' })), 'files.resume');
    assert.equal(keyOf(field({ label: 'Cover letter', kind: 'file', type: 'file' })), 'files.coverLetter');
    assert.equal(keyOf(field({ label: 'Email', kind: 'file', type: 'file' })), null);
  });

  it('does not fill a checkbox with a text value', () => {
    assert.equal(keyOf(field({ label: 'Email', kind: 'boolean', type: 'checkbox' })), null);
  });
});

describe('scoring', () => {
  it('returns null for disqualified definitions and numbers otherwise', () => {
    const email = FIELD_DEFINITIONS.find((definition) => definition.key === 'basics.email');
    assert.equal(scoreDefinition(field({ label: 'Confirm email' }), email), null);
    assert.ok(scoreDefinition(field({ label: 'Email' }), email) >= MATCH_THRESHOLD);
  });

  it('leaves unrecognised fields unmatched', () => {
    assert.equal(keyOf(field({ label: 'Favourite colour' })), null);
    assert.equal(keyOf(field({ label: 'Which time zone are you in?' })), null);
  });
});

describe('assignFields', () => {
  it('numbers repeatable keys in DOM order', () => {
    const descriptors = [
      field({ label: 'Company', sectionText: 'Experience' }),
      field({ label: 'Title', sectionText: 'Experience' }),
      field({ label: 'Company', sectionText: 'Experience' }),
      field({ label: 'Title', sectionText: 'Experience' }),
    ];
    const assigned = assignFields(descriptors);
    const companies = assigned.filter((entry) => entry.key === 'work[].company').map((entry) => entry.index);
    const titles = assigned.filter((entry) => entry.key === 'work[].title').map((entry) => entry.index);
    assert.deepEqual(companies, [0, 1]);
    assert.deepEqual(titles, [0, 1]);
  });

  it('gives a non-repeatable key to its single best field', () => {
    const weak = field({ placeholder: 'email' });
    const strong = field({ label: 'Email', type: 'email', autocomplete: 'email' });
    const assigned = assignFields([weak, strong]);
    const emails = assigned.filter((entry) => entry.key === 'basics.email');
    assert.equal(emails.length, 1);
    assert.equal(emails[0].descriptor, strong);
  });

  it('preserves DOM order in its output', () => {
    const assigned = assignFields([field({ label: 'Last name' }), field({ label: 'First name' })]);
    assert.deepEqual(
      assigned.map((entry) => entry.key),
      ['basics.lastName', 'basics.firstName'],
    );
  });
});

describe('field map integrity', () => {
  it('has unique keys', () => {
    const keys = FIELD_DEFINITIONS.map((definition) => definition.key);
    assert.equal(new Set(keys).size, keys.length);
  });

  it('every definition has at least one way to match', () => {
    for (const definition of FIELD_DEFINITIONS) {
      const ways = (definition.exact?.length || 0) + (definition.contains?.length || 0) + (definition.autocomplete?.length || 0) + (definition.attr?.length || 0);
      assert.ok(ways > 0, `${definition.key} has no matching phrases`);
    }
  });
});
