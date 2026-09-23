import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatForDateInput, parseDateish, toIsoMonth } from '../src/core/dates.js';

describe('parseDateish', () => {
  it('reads ISO, slashed, month-name and year-only forms', () => {
    assert.deepEqual(parseDateish('2021-03-14'), { year: 2021, month: 3, day: 14 });
    assert.deepEqual(parseDateish('2021-03'), { year: 2021, month: 3, day: 1 });
    assert.deepEqual(parseDateish('03/2021'), { year: 2021, month: 3, day: 1 });
    assert.deepEqual(parseDateish('3/14/2021'), { year: 2021, month: 3, day: 14 });
    assert.deepEqual(parseDateish('Mar 2021'), { year: 2021, month: 3, day: 1 });
    assert.deepEqual(parseDateish('September, 2019'), { year: 2019, month: 9, day: 1 });
    assert.deepEqual(parseDateish('2021'), { year: 2021, month: 1, day: 1 });
  });

  it('recognises "present" style values', () => {
    assert.deepEqual(parseDateish('Present'), { present: true });
    assert.deepEqual(parseDateish('current'), { present: true });
  });

  it('returns null for junk', () => {
    assert.equal(parseDateish('soon'), null);
    assert.equal(parseDateish(''), null);
  });
});

describe('toIsoMonth', () => {
  it('normalises to YYYY-MM', () => {
    assert.equal(toIsoMonth('Jan 2020'), '2020-01');
    assert.equal(toIsoMonth('12/2019'), '2019-12');
    assert.equal(toIsoMonth('Present'), '');
  });
});

describe('formatForDateInput', () => {
  it('formats for date and month inputs', () => {
    assert.equal(formatForDateInput('Mar 2021', 'date'), '2021-03-01');
    assert.equal(formatForDateInput('Mar 2021', 'month'), '2021-03');
    assert.equal(formatForDateInput('3/14/2021', 'date'), '2021-03-14');
  });

  it('refuses to format unparseable or present values', () => {
    assert.equal(formatForDateInput('Present', 'date'), null);
    assert.equal(formatForDateInput('asap', 'date'), null);
    assert.equal(formatForDateInput('2021-03', 'week'), null);
  });
});
