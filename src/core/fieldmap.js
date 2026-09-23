/**
 * Rule table mapping form fields to canonical profile keys.
 *
 * Each definition is matched against a field descriptor by matcher.js. The
 * wording here is drawn from the labels real applicant tracking systems use
 * (Greenhouse, Lever, Ashby, Workday, SmartRecruiters, Workable, Taleo).
 *
 * Fields:
 *   key        dotted profile path (schema.js resolves it)
 *   kind       expected value shape, used for control-type compatibility
 *   autocomplete  matching `autocomplete` attribute tokens (highest confidence)
 *   inputType  matching `<input type>` values (a modest bonus)
 *   exact      label must equal this exactly (guards very generic words)
 *   contains   whole-word phrase anywhere in the label/attributes
 *   attr       phrase to look for in `name`/`id` only
 *   not        any of these disqualifies the definition outright
 *   section    phrases in the enclosing fieldset/heading that boost this key
 *   repeatable this key appears once per array entry (work, education)
 */

/** Words implying the field is about somebody or something other than the applicant. */
const NOT_THE_APPLICANT = [
  'company',
  'employer',
  'organization',
  'organisation',
  'school',
  'university',
  'college',
  'reference',
  'referee',
  'supervisor',
  'manager',
  'emergency',
  'spouse',
  'guardian',
  'recruiter',
  'file',
  'user',
  'username',
  'account',
  'bank',
];

export const FIELD_DEFINITIONS = [
  // ---------------------------------------------------------------- identity
  {
    key: 'basics.firstName',
    kind: 'text',
    autocomplete: ['given-name'],
    exact: ['first', 'first name', 'given name', 'forename'],
    contains: ['first name', 'given name', 'legal first name', 'first given name'],
    not: [...NOT_THE_APPLICANT, 'last', 'middle'],
  },
  {
    key: 'basics.lastName',
    kind: 'text',
    autocomplete: ['family-name'],
    exact: ['last', 'last name', 'surname', 'family name'],
    contains: ['last name', 'family name', 'legal last name', 'sur name'],
    not: [...NOT_THE_APPLICANT, 'first', 'middle'],
  },
  {
    key: 'basics.fullName',
    kind: 'text',
    autocomplete: ['name'],
    // `name` is far too common as a substring, so it only counts as an exact label.
    exact: ['name', 'full name', 'your name', 'legal name', 'candidate name', 'applicant name'],
    contains: ['full name', 'full legal name', 'legal name', 'your full name'],
    not: [...NOT_THE_APPLICANT, 'first', 'last', 'middle', 'preferred', 'nick'],
  },
  {
    key: 'basics.preferredName',
    kind: 'text',
    autocomplete: ['nickname'],
    exact: ['preferred name', 'nickname', 'nick name', 'goes by'],
    contains: ['preferred name', 'preferred first name', 'nick name', 'what should we call you'],
    not: NOT_THE_APPLICANT,
  },
  {
    key: 'basics.pronouns',
    kind: 'choice',
    exact: ['pronouns'],
    contains: ['pronouns', 'preferred pronouns'],
  },

  // ------------------------------------------------------------------ contact
  {
    key: 'basics.email',
    kind: 'email',
    autocomplete: ['email'],
    inputType: ['email'],
    exact: ['email', 'e mail', 'email address'],
    contains: ['email', 'e mail', 'email address'],
    not: ['confirm', 'confirmation', 'verify', 'repeat', 're enter', 'reenter', 'secondary', 'alternate', ...NOT_THE_APPLICANT],
  },
  {
    key: 'basics.phone',
    kind: 'tel',
    autocomplete: ['tel', 'tel-national'],
    inputType: ['tel'],
    exact: ['phone', 'telephone', 'mobile', 'cell'],
    contains: ['phone', 'phone number', 'mobile number', 'telephone', 'cell number', 'contact number'],
    not: ['country code', 'extension', 'confirm', ...NOT_THE_APPLICANT],
  },
  {
    key: 'basics.addressLine1',
    kind: 'text',
    autocomplete: ['street-address', 'address-line1'],
    exact: ['address', 'street address', 'address line 1'],
    contains: ['street address', 'address line 1', 'mailing address', 'home address'],
    // "Email address" and "website address" both contain the word `address`.
    not: ['email', 'e mail', 'web', 'url', 'ip', 'city', 'state', 'zip', 'postal', 'country'],
  },
  {
    key: 'basics.city',
    kind: 'text',
    autocomplete: ['address-level2'],
    exact: ['city', 'town', 'city or town', 'location', 'current location'],
    contains: ['city', 'town', 'city or town', 'current city'],
    not: ['state', 'country', ...NOT_THE_APPLICANT],
  },
  {
    key: 'basics.state',
    kind: 'text',
    autocomplete: ['address-level1'],
    exact: ['state', 'province', 'region', 'state province', 'county'],
    contains: ['state', 'province', 'state or province', 'state region'],
    not: ['united states', 'country', 'city'],
  },
  {
    key: 'basics.postalCode',
    kind: 'text',
    autocomplete: ['postal-code'],
    exact: ['zip', 'zip code', 'postal code', 'postcode', 'pin code'],
    contains: ['zip code', 'postal code', 'post code', 'pin code', 'zip'],
  },
  {
    key: 'basics.country',
    kind: 'text',
    autocomplete: ['country', 'country-name'],
    exact: ['country', 'country region'],
    contains: ['country'],
    not: ['country code', 'citizenship'],
  },
  {
    key: 'basics.summary',
    kind: 'longtext',
    contains: [
      'summary',
      'professional summary',
      'about you',
      'about yourself',
      'tell us about yourself',
      'bio',
      'biography',
      'objective',
      'profile summary',
    ],
    not: ['cover letter'],
  },

  // -------------------------------------------------------------------- links
  {
    key: 'links.linkedin',
    kind: 'url',
    autocomplete: ['url'],
    contains: ['linkedin', 'linked in', 'linkedin profile', 'linkedin url'],
    attr: ['linkedin', 'linked in'],
  },
  {
    key: 'links.github',
    kind: 'url',
    contains: ['github', 'git hub', 'github profile', 'github url'],
    // `urls[GitHub]` camel-splits to `git hub`, so both spellings are listed.
    attr: ['github', 'git hub'],
  },
  {
    key: 'links.portfolio',
    kind: 'url',
    contains: ['portfolio', 'personal website', 'personal site', 'website', 'web site', 'blog', 'portfolio url'],
    attr: ['portfolio', 'website'],
    not: ['company', 'employer', 'linkedin', 'github', 'twitter'],
  },
  {
    key: 'links.twitter',
    kind: 'url',
    contains: ['twitter', 'x profile', 'twitter handle'],
    attr: ['twitter'],
  },

  // ----------------------------------------------------------- work (repeats)
  {
    key: 'work[].company',
    kind: 'text',
    autocomplete: ['organization'],
    repeatable: true,
    exact: ['company', 'employer', 'organization', 'organisation'],
    contains: [
      'company name',
      'company',
      'employer',
      'employer name',
      'organization',
      'organisation',
      'current company',
      'current employer',
      'most recent company',
      'most recent employer',
    ],
    section: ['experience', 'employment', 'work history', 'work experience'],
    not: ['school', 'university', 'college', 'size', 'website', 'url', 'address', 'industry'],
  },
  {
    key: 'work[].title',
    kind: 'text',
    autocomplete: ['organization-title'],
    repeatable: true,
    exact: ['title', 'job title', 'position', 'role', 'current title', 'current role'],
    contains: [
      'job title',
      'current title',
      'current position',
      'most recent title',
      'most recent position',
      'position title',
      'your title',
      'role title',
    ],
    section: ['experience', 'employment', 'work history', 'work experience'],
    not: ['salutation', 'prefix', 'title of', 'degree'],
  },
  {
    key: 'work[].location',
    kind: 'text',
    repeatable: true,
    contains: ['company location', 'job location', 'work location', 'employment location'],
    section: ['experience', 'employment', 'work history'],
  },
  {
    key: 'work[].startDate',
    kind: 'date',
    repeatable: true,
    inputType: ['date', 'month'],
    exact: ['from', 'start date', 'start'],
    contains: ['employment start date', 'job start date', 'start date', 'from date'],
    // Boosted only inside an experience section; otherwise `application.availableStartDate` wins.
    section: ['experience', 'employment', 'work history', 'work experience'],
    not: ['available', 'earliest', 'notice', 'education', 'school'],
  },
  {
    key: 'work[].endDate',
    kind: 'date',
    repeatable: true,
    inputType: ['date', 'month'],
    exact: ['to', 'end date', 'end'],
    contains: ['employment end date', 'job end date', 'end date', 'to date'],
    section: ['experience', 'employment', 'work history', 'work experience'],
    not: ['education', 'school', 'graduation'],
  },

  // ------------------------------------------------------ education (repeats)
  {
    key: 'education[].school',
    kind: 'text',
    repeatable: true,
    exact: ['school', 'university', 'college', 'institution'],
    contains: ['school name', 'school', 'university', 'college', 'institution', 'alma mater'],
    section: ['education', 'academic'],
    not: ['high school diploma', 'degree'],
  },
  {
    key: 'education[].degree',
    kind: 'text',
    repeatable: true,
    exact: ['degree', 'qualification'],
    contains: ['degree', 'degree type', 'qualification', 'level of education'],
    section: ['education', 'academic'],
  },
  {
    key: 'education[].field',
    kind: 'text',
    repeatable: true,
    exact: ['major', 'discipline', 'field of study', 'concentration'],
    contains: ['field of study', 'major', 'discipline', 'concentration', 'course of study', 'subject'],
    section: ['education', 'academic'],
  },
  {
    key: 'education[].endDate',
    kind: 'date',
    repeatable: true,
    contains: ['graduation date', 'graduation year', 'year of graduation', 'completion date', 'expected graduation'],
    section: ['education', 'academic'],
  },
  {
    key: 'education[].gpa',
    kind: 'text',
    repeatable: true,
    exact: ['gpa', 'cgpa', 'grade'],
    contains: ['gpa', 'cgpa', 'grade point average', 'percentage of marks'],
    section: ['education', 'academic'],
  },

  // ------------------------------------------------------------------- skills
  {
    key: 'skills.list',
    kind: 'longtext',
    contains: ['skills', 'key skills', 'technical skills', 'core competencies', 'skill set', 'relevant skills'],
  },

  // -------------------------------------------------- application-specific Qs
  {
    key: 'application.coverLetter',
    kind: 'longtext',
    contains: [
      'cover letter',
      'why do you want to work',
      'why are you interested',
      'why this role',
      'why should we hire you',
      'motivation',
    ],
  },
  {
    key: 'application.desiredSalary',
    kind: 'text',
    contains: [
      'desired salary',
      'salary expectation',
      'salary expectations',
      'expected salary',
      'desired compensation',
      'compensation expectation',
      'expected ctc',
    ],
    not: ['current salary', 'current ctc'],
  },
  {
    key: 'application.availableStartDate',
    kind: 'date',
    contains: [
      'available start date',
      'availability date',
      'date available',
      'when can you start',
      'earliest start date',
      'availability',
      'available from',
    ],
    not: ['employment', 'work history'],
  },
  {
    key: 'application.noticePeriod',
    kind: 'text',
    exact: ['notice period', 'notice'],
    contains: ['notice period', 'period of notice'],
  },
  {
    key: 'application.willingToRelocate',
    kind: 'boolean',
    contains: ['willing to relocate', 'relocate', 'relocation', 'open to relocation'],
  },
  {
    key: 'application.willingToTravel',
    kind: 'boolean',
    contains: ['willing to travel', 'travel requirement', 'able to travel'],
  },
  {
    key: 'application.howHeard',
    kind: 'choice',
    contains: [
      'how did you hear about',
      'how did you find',
      'referral source',
      'source',
      'where did you hear',
      'how did you learn about',
    ],
  },
  {
    key: 'application.yearsOfExperience',
    kind: 'number',
    contains: ['years of experience', 'total experience', 'years experience', 'experience in years', 'how many years'],
  },

  // -------------------------------------------------------- work authorisation
  {
    key: 'workAuth.authorized',
    kind: 'boolean',
    contains: [
      'legally authorized',
      'legally authorised',
      'authorized to work',
      'authorised to work',
      'work authorization',
      'work authorisation',
      'eligible to work',
      'right to work',
      'legally eligible',
    ],
  },
  {
    key: 'workAuth.requiresSponsorship',
    kind: 'boolean',
    contains: [
      'sponsorship',
      'require sponsorship',
      'need sponsorship',
      'visa sponsorship',
      'immigration sponsorship',
      'require visa',
    ],
  },
  {
    key: 'workAuth.visaStatus',
    kind: 'choice',
    contains: ['visa status', 'immigration status', 'citizenship status', 'work permit'],
  },

  // ------------------------------------------------------------ EEO / voluntary
  { key: 'eeo.gender', kind: 'choice', exact: ['gender', 'sex'], contains: ['gender', 'gender identity'] },
  {
    key: 'eeo.hispanicLatino',
    kind: 'choice',
    contains: ['hispanic', 'latino', 'hispanic or latino'],
  },
  {
    key: 'eeo.race',
    kind: 'choice',
    exact: ['race', 'ethnicity'],
    contains: ['race', 'ethnicity', 'racial', 'ethnic background'],
    not: ['hispanic'],
  },
  {
    key: 'eeo.veteranStatus',
    kind: 'choice',
    contains: ['veteran', 'veteran status', 'protected veteran', 'military service'],
  },
  {
    key: 'eeo.disabilityStatus',
    kind: 'choice',
    contains: ['disability', 'disability status', 'disabled'],
  },

  // ----------------------------------------------------------------- uploads
  {
    key: 'files.resume',
    kind: 'file',
    contains: ['resume', 'cv', 'curriculum vitae', 'upload resume', 'attach resume', 'upload cv'],
    attr: ['resume', 'cv'],
    not: ['cover letter'],
  },
  {
    key: 'files.coverLetter',
    kind: 'file',
    contains: ['cover letter'],
    attr: ['cover_letter', 'coverletter'],
  },
];

/** Keys whose stored value is Yes/No and which may render as radios or a select. */
export const BOOLEAN_KEYS = new Set(
  FIELD_DEFINITIONS.filter((definition) => definition.kind === 'boolean').map((definition) => definition.key),
);

export function definitionFor(key) {
  return FIELD_DEFINITIONS.find((definition) => definition.key === key) || null;
}
