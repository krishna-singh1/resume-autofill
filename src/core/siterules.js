/**
 * Hand-written selector maps for applicant tracking systems whose markup is
 * stable and widely used.
 *
 * These run before the generic matcher and win outright: a known selector is
 * always a better signal than a label heuristic. Anything a rule does not
 * cover still falls through to matcher.js.
 */

/** `work[0].company` -> `{ key: 'work[].company', index: 0 }` */
export function splitIndexedKey(key) {
  const match = /^([a-zA-Z]+)\[(\d+)\]\.(.+)$/.exec(key);
  if (!match) return { key, index: 0 };
  return { key: `${match[1]}[].${match[3]}`, index: Number(match[2]) };
}

export const SITE_RULES = [
  {
    id: 'greenhouse',
    test: (url) => /greenhouse\.io/.test(url.hostname) || /grnhse/.test(url.href),
    selectors: {
      '#first_name, input[name="job_application[first_name]"]': 'basics.firstName',
      '#last_name, input[name="job_application[last_name]"]': 'basics.lastName',
      '#email, input[name="job_application[email]"]': 'basics.email',
      '#phone, input[name="job_application[phone]"]': 'basics.phone',
      'input[name="job_application[location]"], #job_application_location': 'basics.city',
      '#resume, input[name="job_application[resume]"], input[type="file"][id*="resume" i]': 'files.resume',
      '#cover_letter, input[name="job_application[cover_letter]"]': 'files.coverLetter',
    },
  },
  {
    id: 'lever',
    test: (url) => /lever\.co/.test(url.hostname),
    selectors: {
      'input[name="name"]': 'basics.fullName',
      'input[name="email"]': 'basics.email',
      'input[name="phone"]': 'basics.phone',
      'input[name="org"]': 'work[0].company',
      'input[name="urls[LinkedIn]"]': 'links.linkedin',
      'input[name="urls[GitHub]"], input[name="urls[Github]"]': 'links.github',
      'input[name="urls[Portfolio]"]': 'links.portfolio',
      'input[name="urls[Twitter]"]': 'links.twitter',
      'input[name="resume"]': 'files.resume',
      'textarea[name="comments"]': 'application.coverLetter',
    },
  },
  {
    id: 'ashby',
    test: (url) => /ashbyhq\.com/.test(url.hostname),
    selectors: {
      'input[name="_systemfield_name"]': 'basics.fullName',
      'input[name="_systemfield_email"]': 'basics.email',
      'input[name="_systemfield_phone"]': 'basics.phone',
      'input[name="_systemfield_location"]': 'basics.city',
      'input[name="_systemfield_resume"], input[type="file"][name*="resume" i]': 'files.resume',
    },
  },
  {
    id: 'workday',
    test: (url) => /myworkdayjobs\.com|workday\.com/.test(url.hostname),
    selectors: {
      '[data-automation-id="legalNameSection_firstName"]': 'basics.firstName',
      '[data-automation-id="legalNameSection_lastName"]': 'basics.lastName',
      '[data-automation-id="email"]': 'basics.email',
      '[data-automation-id="phone-number"]': 'basics.phone',
      '[data-automation-id="addressSection_addressLine1"]': 'basics.addressLine1',
      '[data-automation-id="addressSection_city"]': 'basics.city',
      '[data-automation-id="addressSection_postalCode"]': 'basics.postalCode',
      '[data-automation-id="formField-sourceProspect"] input': 'application.howHeard',
    },
  },
  {
    id: 'smartrecruiters',
    test: (url) => /smartrecruiters\.com/.test(url.hostname),
    selectors: {
      'input[name="firstName"]': 'basics.firstName',
      'input[name="lastName"]': 'basics.lastName',
      'input[name="email"]': 'basics.email',
      'input[name="phoneNumber"], input[name="phone"]': 'basics.phone',
      'input[name="location.city"]': 'basics.city',
      'input[name="linkedinProfileUrl"]': 'links.linkedin',
      'input[name="webpage"]': 'links.portfolio',
    },
  },
  {
    id: 'workable',
    test: (url) => /workable\.com/.test(url.hostname),
    selectors: {
      'input[name="firstname"], input[name="firstName"]': 'basics.firstName',
      'input[name="lastname"], input[name="lastName"]': 'basics.lastName',
      'input[name="email"]': 'basics.email',
      'input[name="phone"]': 'basics.phone',
      'input[name="address"]': 'basics.addressLine1',
      'input[name="linkedin_url"]': 'links.linkedin',
      'input[name="github_url"]': 'links.github',
    },
  },
  {
    // Easy Apply ids are long generated URNs; the trailing segment is the
    // stable part. Labels are good here, so this rule is a light assist.
    id: 'linkedin',
    test: (url) => /linkedin\.com/.test(url.hostname),
    selectors: {
      'input[id*="phoneNumber-nationalNumber"]': 'basics.phone',
      'input[id*="-city-"], input[id*="-location-"]': 'basics.city',
      'input[id*="-linkedin-"], input[id*="-websiteUrl-"]': 'links.portfolio',
    },
  },
  {
    id: 'jobvite',
    test: (url) => /jobvite\.com/.test(url.hostname),
    selectors: {
      'input[name="firstName"]': 'basics.firstName',
      'input[name="lastName"]': 'basics.lastName',
      'input[name="email"]': 'basics.email',
      'input[name="phone"]': 'basics.phone',
    },
  },
];

/** The rule matching `href`, or null when the site is unknown. */
export function ruleForUrl(href) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  return SITE_RULES.find((rule) => rule.test(url)) || null;
}
