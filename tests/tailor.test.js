import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { extractKeywords, scoreText, tailorProfile } from '../src/core/tailor.js';

const JOB = `
  We are looking for a Senior Backend Engineer with strong Go and Kubernetes experience.
  You will work with Kafka and PostgreSQL. Terraform experience is a plus. Go Go Go.
`;

const PROFILE = {
  basics: { summary: 'Backend engineer' },
  skills: ['Python', 'Go', 'React', 'Kubernetes'],
  work: [
    {
      company: 'Stripe',
      title: 'Engineer',
      highlights: ['Built React dashboards', 'Ran Kubernetes clusters in Go', 'Wrote docs'],
    },
  ],
  projects: [{ name: 'ui-kit', description: 'React components' }, { name: 'kafka-tool', description: 'Kafka CLI' }],
};

describe('extractKeywords', () => {
  it('drops stopwords and orders by frequency', () => {
    const keywords = extractKeywords(JOB);
    assert.equal(keywords[0], 'go');
    assert.ok(keywords.includes('kubernetes'));
    assert.ok(!keywords.includes('experience'));
    assert.ok(!keywords.includes('the'));
  });
});

describe('scoreText', () => {
  it('counts distinct keyword hits', () => {
    assert.equal(scoreText('Go and Kubernetes and Go again', ['go', 'kubernetes', 'kafka']), 2);
  });
});

describe('tailorProfile', () => {
  const result = tailorProfile(PROFILE, JOB);

  it('moves matching skills to the front, keeping relative order otherwise', () => {
    assert.deepEqual(result.profile.skills, ['Go', 'Kubernetes', 'Python', 'React']);
  });

  it('reorders bullets without changing their text', () => {
    const highlights = result.profile.work[0].highlights;
    assert.equal(highlights[0], 'Ran Kubernetes clusters in Go');
    assert.deepEqual([...highlights].sort(), [...PROFILE.work[0].highlights].sort());
  });

  it('reorders projects', () => {
    assert.equal(result.profile.projects[0].name, 'kafka-tool');
  });

  it('reports coverage and missing terms', () => {
    assert.ok(result.matched.includes('go'));
    assert.ok(result.missing.includes('terraform'));
    assert.ok(result.coverage > 0 && result.coverage < 100);
  });

  it('caps bullets when asked', () => {
    const capped = tailorProfile(PROFILE, JOB, { maxBullets: 1 });
    assert.equal(capped.profile.work[0].highlights.length, 1);
  });

  it('is a no-op for an empty job description', () => {
    const untouched = tailorProfile(PROFILE, '');
    assert.equal(untouched.profile, PROFILE);
    assert.equal(untouched.coverage, 0);
  });
});

describe('mixed-case technology names', () => {
  it('keeps PostgreSQL, gRPC and JavaScript as single keywords', () => {
    const keywords = extractKeywords('PostgreSQL and gRPC services in JavaScript. PostgreSQL again.');
    assert.ok(keywords.includes('postgresql'), keywords.join(','));
    assert.ok(keywords.includes('grpc'));
    assert.ok(keywords.includes('javascript'));
    assert.ok(!keywords.includes('sql') && !keywords.includes('rpc') && !keywords.includes('script'));
  });

  it('matches them in the profile', () => {
    const result = tailorProfile({ skills: ['PostgreSQL'], work: [], projects: [] }, 'PostgreSQL experience');
    assert.deepEqual(result.missing, []);
  });
});
