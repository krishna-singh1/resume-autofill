import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  employerTokensFromUrl,
  isStorable,
  makeAnswer,
  markUsed,
  matchLearned,
  questionKey,
  shouldScopeToSite,
  upsertAnswer,
} from '../src/core/learned.js';

const WORKDAY = 'https://acme.wd5.myworkdayjobs.com/en-US/careers/job/apply';
const GREENHOUSE = 'https://boards.greenhouse.io/globex/jobs/123';

describe('questionKey', () => {
  it('normalises wording and strips required markers', () => {
    assert.equal(questionKey('Which time zone are you in? *'), 'which time zone are you in');
    assert.equal(questionKey('  Time-Zone (required)'), 'time zone');
  });
});

describe('isStorable', () => {
  it('refuses sensitive questions and empty values', () => {
    assert.equal(isStorable('Social Security Number', '123-45-6789'), false);
    assert.equal(isStorable('Date of birth', '1990-01-01'), false);
    assert.equal(isStorable('Time zone', ''), false);
    assert.equal(isStorable('Time zone', 'Asia/Kolkata'), true);
  });
});

describe('employer scoping', () => {
  it('pulls the employer name from ATS URLs', () => {
    assert.deepEqual(employerTokensFromUrl(WORKDAY), ['acme']);
    assert.deepEqual(employerTokensFromUrl(GREENHOUSE), ['globex']);
    assert.deepEqual(employerTokensFromUrl('https://jobs.lever.co/initech-labs/abc'), ['initech', 'labs']);
  });

  it('scopes a question to the site when it names the employer', () => {
    assert.equal(shouldScopeToSite('Have you previously worked at Acme?', WORKDAY), true);
    assert.equal(shouldScopeToSite('Which time zone are you in?', WORKDAY), false);
  });

  it('records scope and site on the answer', () => {
    const scoped = makeAnswer({ label: 'Worked at Acme before?', value: 'No', kind: 'choice', href: WORKDAY });
    assert.equal(scoped.scope, 'site');
    assert.deepEqual(scoped.sites, ['acme.wd5.myworkdayjobs.com']);

    const global = makeAnswer({ label: 'Time zone', value: 'IST', href: WORKDAY });
    assert.equal(global.scope, 'global');
  });
});

describe('matchLearned', () => {
  const answers = [
    makeAnswer({ label: 'Which time zone are you in?', value: 'Asia/Kolkata', href: GREENHOUSE }),
    makeAnswer({ label: 'Have you worked at Acme before?', value: 'No', kind: 'choice', href: WORKDAY }),
  ];

  it('matches identical wording on a different site', () => {
    const hit = matchLearned({ label: 'Which time zone are you in?', kind: 'text' }, answers, WORKDAY);
    assert.equal(hit.answer.value, 'Asia/Kolkata');
    assert.equal(hit.score, 1);
  });

  it('matches close paraphrases but not distant ones', () => {
    assert.ok(matchLearned({ label: 'Which time zone are you based in?', kind: 'text' }, answers, WORKDAY));
    assert.equal(matchLearned({ label: 'Favourite colour?', kind: 'text' }, answers, WORKDAY), null);
  });

  it('keeps site-scoped answers on their site', () => {
    const question = { label: 'Have you worked at Acme before?', kind: 'choice' };
    assert.ok(matchLearned(question, answers, WORKDAY));
    assert.equal(matchLearned(question, answers, GREENHOUSE), null);
  });

  it('does not offer a text answer to a choice control', () => {
    assert.equal(matchLearned({ label: 'Which time zone are you in?', kind: 'choice' }, answers, WORKDAY), null);
  });
});

describe('upsertAnswer', () => {
  it('updates an existing answer and learns the new wording as an alias', () => {
    const initial = [makeAnswer({ label: 'Which time zone are you in?', value: 'IST', href: GREENHOUSE })];
    const captured = makeAnswer({ label: 'Which time zone are you based in?', value: 'Asia/Kolkata', href: WORKDAY });
    const merged = upsertAnswer(initial, captured);

    assert.equal(merged.length, 1);
    assert.equal(merged[0].value, 'Asia/Kolkata');
    assert.deepEqual(merged[0].aliases, ['which time zone are you based in']);
    assert.deepEqual(merged[0].sites, ['boards.greenhouse.io', 'acme.wd5.myworkdayjobs.com']);
  });

  it('appends genuinely new questions', () => {
    const merged = upsertAnswer([], makeAnswer({ label: 'Time zone', value: 'IST' }));
    assert.equal(merged.length, 1);
  });
});

describe('markUsed', () => {
  it('increments usage and records the site', () => {
    const [answer] = [makeAnswer({ label: 'Time zone', value: 'IST', href: GREENHOUSE })];
    const [used] = markUsed([answer], answer.id, WORKDAY);
    assert.equal(used.useCount, 1);
    assert.ok(used.sites.includes('acme.wd5.myworkdayjobs.com'));
  });
});
