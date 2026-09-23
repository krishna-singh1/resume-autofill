import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { emptyProfile, formattedAddress, fullName, normalizeProfile, repeatLength, resolveValue } from '../src/core/schema.js';
import { splitIndexedKey } from '../src/core/siterules.js';

const PROFILE = normalizeProfile({
  basics: { firstName: 'Priya', lastName: 'Raman', city: 'Austin', state: 'TX', country: 'USA' },
  skills: ['Go', 'SQL'],
  work: [
    { company: 'Stripe', title: 'Senior Engineer', startDate: '2021-01', current: true },
    { company: 'Square', title: 'Engineer', startDate: '2018-03', endDate: '2020-12' },
  ],
});

describe('normalizeProfile', () => {
  it('fills a missing or malformed profile out to the full shape', () => {
    assert.deepEqual(normalizeProfile(null), emptyProfile());
    const partial = normalizeProfile({ basics: { email: 'a@b.c' }, work: [{ company: 'X' }], skills: 'nope' });
    assert.equal(partial.basics.email, 'a@b.c');
    assert.equal(partial.basics.firstName, '');
    assert.deepEqual(partial.work[0].highlights, []);
    assert.deepEqual(partial.skills, []);
    assert.equal(partial.eeo.gender, '');
  });
});

describe('resolveValue', () => {
  it('reads dotted paths', () => {
    assert.equal(resolveValue(PROFILE, 'basics.firstName'), 'Priya');
    assert.equal(resolveValue(PROFILE, 'basics.email'), '');
    assert.equal(resolveValue(PROFILE, 'nonsense.path'), '');
  });

  it('reads repeatable paths by index', () => {
    assert.equal(resolveValue(PROFILE, 'work[].company', 0), 'Stripe');
    assert.equal(resolveValue(PROFILE, 'work[].company', 1), 'Square');
    assert.equal(resolveValue(PROFILE, 'work[].company', 2), '');
    assert.equal(resolveValue(PROFILE, 'work[].current', 0), 'Yes');
  });

  it('computes derived values', () => {
    assert.equal(resolveValue(PROFILE, 'basics.fullName'), 'Priya Raman');
    assert.equal(resolveValue(PROFILE, 'basics.address'), 'Austin, TX, USA');
    assert.equal(resolveValue(PROFILE, 'skills.list'), 'Go, SQL');
    const years = Number(resolveValue(PROFILE, 'application.yearsOfExperience'));
    assert.ok(years >= new Date().getFullYear() - 2018);
  });

  it('prefers an explicit years-of-experience over the estimate', () => {
    const explicit = normalizeProfile({ ...PROFILE, application: { yearsOfExperience: '10' } });
    assert.equal(resolveValue(explicit, 'application.yearsOfExperience'), '10');
  });
});

describe('helpers', () => {
  it('formats names and addresses without stray separators', () => {
    assert.equal(fullName({ basics: { firstName: 'Priya', lastName: '' } }), 'Priya');
    assert.equal(formattedAddress({ basics: { city: 'Austin' } }), 'Austin');
  });

  it('reports repeat lengths', () => {
    assert.equal(repeatLength(PROFILE, 'work[].company'), 2);
    assert.equal(repeatLength(PROFILE, 'basics.email'), 1);
  });

  it('splits indexed site-rule keys', () => {
    assert.deepEqual(splitIndexedKey('work[0].company'), { key: 'work[].company', index: 0 });
    assert.deepEqual(splitIndexedKey('education[2].school'), { key: 'education[].school', index: 2 });
    assert.deepEqual(splitIndexedKey('basics.email'), { key: 'basics.email', index: 0 });
  });
});
