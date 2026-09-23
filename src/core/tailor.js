/**
 * Keyword-driven tailoring of a profile against a job description.
 *
 * This reorders and prioritises what you already wrote — it never invents or
 * rewrites text. Honest keyword matching, no language model involved.
 */

import { normalize } from './text.js';

/**
 * normalize() splits camelCase, which is right for field names like
 * `firstName` but wrong for prose: it turns PostgreSQL into "postgre sql" and
 * gRPC into "g rpc". Lowercasing first keeps those as single words.
 */
const words = (text) => normalize(String(text || '').toLowerCase()).split(' ').filter(Boolean);

const STOPWORDS = new Set([
  'the', 'and', 'for', 'you', 'our', 'with', 'this', 'that', 'are', 'will', 'have', 'has', 'from', 'your',
  'who', 'not', 'but', 'all', 'can', 'was', 'were', 'been', 'their', 'they', 'them', 'its', 'his', 'her',
  'about', 'into', 'over', 'more', 'most', 'other', 'such', 'than', 'then', 'these', 'those', 'each',
  'work', 'working', 'team', 'teams', 'role', 'job', 'company', 'candidate', 'candidates', 'ability',
  'experience', 'experienced', 'years', 'year', 'strong', 'excellent', 'good', 'great', 'well', 'help',
  'including', 'across', 'within', 'while', 'must', 'should', 'would', 'could', 'may', 'also', 'new',
  'plus', 'nice', 'like', 'looking', 'join', 'us', 'we', 'be', 'to', 'of', 'in', 'on', 'as', 'at', 'by',
  'is', 'it', 'or', 'an', 'a', 'do', 'does', 'per', 'via', 'etc', 'you.ll', 'youll', 'what', 'how', 'why',
  'position', 'opportunity', 'benefits', 'salary', 'apply', 'application', 'requirements', 'responsibilities',
  'if', 'so', 'no', 'up', 'my', 'me', 'am', 'vs', 're', 'eg', 'ie', 'll', 've', 'and/or',
]);

/**
 * Distinct meaningful terms from a job description, most frequent first.
 * Two-letter tokens are kept because Go, ML, UX and QA are real skills.
 */
export function extractKeywords(jobText, limit = 40) {
  const counts = new Map();
  for (const token of words(jobText)) {
    if (token.length < 2 || STOPWORDS.has(token) || /^\d+$/.test(token)) continue;
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([token]) => token);
}

/** How many distinct keywords appear in `text`. */
export function scoreText(text, keywords) {
  const tokens = new Set(words(text));
  return keywords.reduce((score, keyword) => score + (tokens.has(keyword) ? 1 : 0), 0);
}

/** Stable sort: equal scores keep their original relative order. */
function sortByScoreStable(items, scoreOf) {
  return items
    .map((item, index) => ({ item, index, score: scoreOf(item) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item);
}

/**
 * Reorder skills and bullet points to surface the job's keywords first.
 *
 * @param {object} profile
 * @param {string} jobText
 * @param {{maxBullets?: number}} options
 * @returns {{profile: object, keywords: string[], matched: string[], missing: string[], coverage: number}}
 */
export function tailorProfile(profile, jobText, { maxBullets = 0 } = {}) {
  const keywords = extractKeywords(jobText);
  if (!keywords.length) return { profile, keywords: [], matched: [], missing: [], coverage: 0 };

  const tailored = {
    ...profile,
    skills: sortByScoreStable(profile.skills || [], (skill) => scoreText(skill, keywords)),
    work: (profile.work || []).map((entry) => {
      const highlights = sortByScoreStable(entry.highlights || [], (line) => scoreText(line, keywords));
      return { ...entry, highlights: maxBullets > 0 ? highlights.slice(0, maxBullets) : highlights };
    }),
    projects: sortByScoreStable(profile.projects || [], (project) =>
      scoreText(`${project.name} ${project.description} ${(project.highlights || []).join(' ')}`, keywords),
    ),
  };

  const haystack = [
    profile.basics?.summary,
    (profile.skills || []).join(' '),
    (profile.work || []).map((entry) => `${entry.title} ${entry.company} ${(entry.highlights || []).join(' ')}`).join(' '),
    (profile.projects || []).map((project) => `${project.name} ${project.description}`).join(' '),
  ].join(' ');

  const present = new Set(words(haystack));
  const matched = keywords.filter((keyword) => present.has(keyword));
  const missing = keywords.filter((keyword) => !present.has(keyword));

  return {
    profile: tailored,
    keywords,
    matched,
    missing,
    coverage: Math.round((matched.length / keywords.length) * 100),
  };
}
