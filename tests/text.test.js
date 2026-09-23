import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { containsPhrase, normalize, similarity, tokenize } from '../src/core/text.js';

describe('normalize', () => {
  it('splits camelCase and snake_case into words', () => {
    assert.equal(normalize('firstName'), 'first name');
    assert.equal(normalize('first_name'), 'first name');
    assert.equal(normalize('FIRST-NAME'), 'first name');
  });

  it('flattens bracketed ATS field names', () => {
    assert.equal(normalize('job_application[answers_attributes][0][text_value]'), 'job application answers attributes 0 text value');
  });

  it('strips accents and punctuation', () => {
    assert.equal(normalize('Téléphone *'), 'telephone');
    assert.equal(normalize('E-Mail Address:'), 'e mail address');
  });

  it('handles empty input', () => {
    assert.equal(normalize(''), '');
    assert.equal(normalize(null), '');
    assert.deepEqual(tokenize(undefined), []);
  });
});

describe('containsPhrase', () => {
  it('matches whole words only', () => {
    assert.equal(containsPhrase(tokenize('user name'), 'name'), true);
    assert.equal(containsPhrase(tokenize('username'), 'name'), false);
    assert.equal(containsPhrase(tokenize('filename'), 'name'), false);
  });

  it('matches multi-word phrases contiguously', () => {
    assert.equal(containsPhrase(tokenize('Your first name please'), 'first name'), true);
    assert.equal(containsPhrase(tokenize('first and last name'), 'first name'), false);
  });

  it('rejects phrases longer than the haystack', () => {
    assert.equal(containsPhrase(tokenize('name'), 'first name'), false);
  });
});

describe('similarity', () => {
  it('is 1 for identical strings after normalisation', () => {
    assert.equal(similarity('Yes', 'yes'), 1);
    assert.equal(similarity('United States', 'united-states'), 1);
  });

  it('is high for option text that contains the wanted value', () => {
    assert.ok(similarity('Yes, I am authorized', 'Yes') > 0.3);
  });

  it('is 0 for disjoint strings', () => {
    assert.equal(similarity('apple', 'orange'), 0);
  });
});
