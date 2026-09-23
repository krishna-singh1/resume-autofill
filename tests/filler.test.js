import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// filler.js touches the DOM only inside functions; pickOption is pure.
import { pickOption } from '../src/core/filler.js';

const COUNTRIES = [
  { value: '', text: 'Select…' },
  { value: 'US', text: 'United States' },
  { value: 'GB', text: 'United Kingdom' },
  { value: 'IN', text: 'India' },
];

const YES_NO = [
  { value: '1', text: 'Yes, I am authorized to work' },
  { value: '0', text: 'No, I am not' },
];

describe('pickOption', () => {
  it('prefers an exact text or value match', () => {
    assert.equal(pickOption(COUNTRIES, 'India').value, 'IN');
    assert.equal(pickOption(COUNTRIES, 'us').value, 'US');
  });

  it('falls back to the most similar option', () => {
    assert.equal(pickOption(COUNTRIES, 'United States of America').value, 'US');
    assert.equal(pickOption(YES_NO, 'Yes').value, '1');
    assert.equal(pickOption(YES_NO, 'No').value, '0');
  });

  it('returns null when nothing is close', () => {
    assert.equal(pickOption(COUNTRIES, 'Mars'), null);
    assert.equal(pickOption(COUNTRIES, ''), null);
    assert.equal(pickOption([], 'India'), null);
  });
});
