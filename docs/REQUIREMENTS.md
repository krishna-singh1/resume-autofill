# Resume Autofill — Requirements Specification

Companion to [PRD.md](./PRD.md). The PRD says *why* and *what*; this document
enumerates testable requirements, their priority, and their implementation
status against the current codebase.

**Priority:** P0 = must ship in v0.1 · P1 = should ship · P2 = later
**Status:** ✅ Done · 🟡 Partial · ⬜ Not started

---

## 1. Profile data

| ID | Requirement | Priority | Status | Where |
| --- | --- | --- | --- | --- |
| PRO-1 | The profile is a single versioned object with sections: basics, links, work[], education[], projects[], skills[], application, workAuth, eeo. | P0 | ✅ | `src/core/schema.js` |
| PRO-2 | Loading a stored profile from any earlier version yields the full current shape (missing keys defaulted, arrays normalised). | P0 | ✅ | `normalizeProfile()` |
| PRO-3 | Every field is addressable by a dotted key path (`basics.email`); array fields by `work[].company` with an index. | P0 | ✅ | `resolveValue()` |
| PRO-4 | Derived values exist for full name, one-line address, joined skills, estimated years of experience. | P1 | ✅ | `DERIVED` in schema.js |
| PRO-5 | Work and education arrays are most-recent-first; index 0 is treated as "current". | P0 | ✅ | Documented in schema + options copy |
| PRO-6 | All profile data persists in `chrome.storage.local` only; never `storage.sync`, never a remote endpoint. | P0 | ✅ | `src/core/storage.js` |
| PRO-7 | Resume and cover-letter files are stored as `{name, type, size, dataUrl}` under separate keys so profile saves do not rewrite the file. | P0 | ✅ | `saveFile()` |
| PRO-8 | Whole-state export to a JSON file and import from the same format. | P1 | ✅ | `exportAll()/importAll()` + options toolbar |

## 2. Resume import

| ID | Requirement | Priority | Status | Where |
| --- | --- | --- | --- | --- |
| IMP-1 | Accept PDF, DOCX, TXT, MD. | P0 | ✅ | `options.js` `textFromFile()`; `.doc` rejected with guidance |
| IMP-2 | PDF text is regrouped into lines by baseline so multi-column headers are readable. | P0 | ✅ | `runsToLines()` in `pdf.js` |
| IMP-3 | DOCX is read without a third-party zip library (DecompressionStream). | P1 | ✅ | `src/core/docx.js` |
| IMP-4 | Parser extracts: name, email, phone, LinkedIn, GitHub, portfolio URL, city/state. | P0 | ✅ | `extractContact/Name/Location` |
| IMP-5 | Parser recognises section headings (Summary, Experience, Education, Skills, Projects, Certifications, Awards) in common wordings. | P0 | ✅ | `SECTIONS` in `parser.js` |
| IMP-6 | Experience entries are split on date ranges; title vs company is inferred from a title-word list; bullets become highlights. | P0 | ✅ | `parseExperience()` |
| IMP-7 | Education entries recognise school keywords, degree abbreviations, field ("in X"), GPA, years. | P0 | ✅ | `parseEducation()` |
| IMP-8 | Parsed output is presented for review and merged into the editor; nothing is saved without explicit user action. | P0 | ✅ | `options.js` review → **Use these details** |
| IMP-9 | Parser emits human-readable warnings for anything it could not find. | P1 | ✅ | `warnings[]` from `parseResumeText()` |
| IMP-10 | The uploaded file is retained as the attachable resume (PRO-7) in the same step. | P0 | ✅ | `applyParsed()` stores the upload as the resume file |

## 3. Field detection (scanner)

| ID | Requirement | Priority | Status | Where |
| --- | --- | --- | --- | --- |
| SCN-1 | Collect every visible, enabled, non-readonly `input`, `select`, `textarea`; skip hidden/submit/button/password/search types. | P0 | ✅ | `scanFields()` |
| SCN-2 | Traverse open shadow roots. | P1 | ✅ | `walk()` |
| SCN-3 | Run in every frame of the tab, including cross-origin iframes. | P0 | ✅ | `allFrames: true` in service worker |
| SCN-4 | Resolve labels in priority order: `label[for]` → `aria-labelledby` → `aria-label` → wrapping `<label>` → nearest single-control ancestor's label → preceding sibling text. | P0 | ✅ | `resolveLabel()` |
| SCN-5 | Never borrow a neighbouring field's label (ancestor search stops at the first container holding >1 control). | P0 | ✅ | `labelFromAncestor()` |
| SCN-6 | Capture the enclosing section heading / fieldset legend for context. | P0 | ✅ | `resolveSectionText()` |
| SCN-7 | Capture ATS hook attributes: `data-automation-id`, `data-testid`, `data-qa`, `data-field`, `data-name`. | P1 | ✅ | `HINT_ATTRIBUTES` |
| SCN-8 | Radio groups and same-named checkbox sets collapse into one descriptor with option labels. | P0 | ✅ | `scanFields()` grouping |
| SCN-9 | Descriptors are plain serialisable data plus an element reference, so matching is testable without a DOM. | P0 | ✅ | — |

## 4. Field matching

| ID | Requirement | Priority | Status | Where |
| --- | --- | --- | --- | --- |
| MAT-1 | Matching is deterministic and offline; no LLM, no network. | P0 | ✅ | `matcher.js` |
| MAT-2 | Phrase matching is whole-word (`name` must not match `username`, `filename`). | P0 | ✅ | `containsPhrase()` in `text.js` |
| MAT-3 | camelCase, snake_case, kebab-case and bracketed names tokenise into words (`firstName`, `first_name`, `job_application[first_name]` all → `first name`). | P0 | ✅ | `normalize()` |
| MAT-4 | Score sources, strongest first: `autocomplete` attribute, exact label, label phrase, name/id phrase, placeholder, input type, control kind, section boost. | P0 | ✅ | `WEIGHT` table |
| MAT-5 | Negative phrases disqualify outright (confirm/verify for email; company/school/employer for person-name; email for address). | P0 | ✅ | `not:` lists in `fieldmap.js` |
| MAT-6 | A definition can only fill compatible control kinds (a file def never fills a text input; a text def never fills a checkbox). | P0 | ✅ | `COMPATIBLE_KINDS` |
| MAT-7 | Ambiguous labels ("Start date") are disambiguated by section text (Experience block → `work[].startDate`; standalone → `application.availableStartDate`). | P0 | ✅ | `section:` boosts |
| MAT-8 | Repeatable keys are numbered in DOM order so N employment blocks receive N different entries. | P0 | ✅ | `assignFields()` |
| MAT-9 | Non-repeatable keys go to their single best-scoring field only. | P0 | ✅ | `assignFields()` |
| MAT-10 | Matches below a confidence threshold are left unfilled rather than guessed. | P0 | ✅ | `MATCH_THRESHOLD = 40` |
| MAT-11 | Coverage: ≥ 50 canonical keys including identity, contact, address, links, work, education, skills, cover letter, salary, start date, notice, relocate, travel, how-heard, years of experience, work authorisation, sponsorship, visa status, EEO, resume/cover-letter file. | P0 | ✅ | `FIELD_DEFINITIONS` |
| MAT-12 | Site rules exist for Greenhouse, Lever, Ashby, Workday, SmartRecruiters, Workable, Jobvite and take precedence over the generic matcher. | P0 | ✅ | `siterules.js` |
| MAT-13 | Site rules for LinkedIn Easy Apply, Taleo, iCIMS. | P1 | 🟡 | LinkedIn rule added; Taleo/iCIMS rely on the generic matcher |
| MAT-14 | Unit tests cover every definition with at least one positive and one negative label example. | P0 | ✅ | `tests/matcher.test.js` (46 cases) |

## 5. Filling

| ID | Requirement | Priority | Status | Where |
| --- | --- | --- | --- | --- |
| FIL-1 | Values are set through the native property setter and followed by bubbling `input` and `change` events so React/Angular/Vue controlled inputs accept them. | P0 | ✅ | `setNativeValue()`, `notify()` |
| FIL-2 | Existing values are not overwritten unless the user enables it. | P0 | ✅ | `overwrite` option |
| FIL-3 | `<select>` picks the closest option by exact text/value, then token similarity ≥ 0.34; otherwise skips with a reason. | P0 | ✅ | `pickOption()` |
| FIL-4 | Radio groups pick by option label similarity and `click()` the option. | P0 | ✅ | `fillRadioGroup()` |
| FIL-5 | Single checkboxes are set from Yes/No/true/false. | P0 | ✅ | `fillCheckbox()` |
| FIL-6 | `type=date` / `type=month` receive correctly formatted values from loose stored dates (`Mar 2021`, `03/2021`, `2021`). | P0 | ✅ | `formatForDateInput()` |
| FIL-7 | `type=number` receives digits only; `maxlength` is respected. | P1 | ✅ | `fillText()` |
| FIL-8 | File inputs receive the stored resume via `DataTransfer`; `change` and `drop` are dispatched for drop-zone widgets. | P0 | ✅ | `fillFileInput()` |
| FIL-9 | A file input that already has a file is left alone. | P0 | ✅ | `fillFileInput()` |
| FIL-10 | Filled fields are briefly outlined; a toast reports the count (top frame only). | P1 | ✅ | `flash()`, `showToast()` |
| FIL-11 | Custom dropdown widgets (react-select, Workday prompts) are driven by click → type → select. | P2 | ⬜ | — |
| FIL-12 | Every field produces a result record: `filled` / `skipped` (reason) / `failed` (reason) / `would-fill`. | P0 | ✅ | `runAutofill()` report |

## 6. Learned answers (never type it twice)

| ID | Requirement | Priority | Status | Where |
| --- | --- | --- | --- | --- |
| LRN-1 | After a fill, fields that were not filled are tracked; when the user completes them and leaves/submits, the extension offers to remember them. | P0 | ✅ | `watchForAnswers()` in `autofill.js` (debounced, not on unload) |
| LRN-2 | The popup lists unfilled fields with an inline "remember" control. | P1 | ✅ | popup **Remember answers here** (collect mode) |
| LRN-3 | Learned answers store: normalised question, aliases, kind, value, sites seen, timestamps, use count. | P0 | ✅ | `learned.js` `makeAnswer()`; `storage.js` `learnedAnswers` |
| LRN-4 | Matching to a learned answer uses the same whole-word scorer with a **higher** threshold than profile fields. | P0 | ✅ | `LEARNED_THRESHOLD = 0.75` vs profile `40/…` |
| LRN-5 | Learned answers are global across sites by default; a per-answer "this site only" scope exists. | P0 | ✅ | `scope: global | site`, editable in options |
| LRN-6 | When a question label contains the employer's name (e.g. "worked at Acme"), the answer is auto-scoped to that site. | P1 | ✅ | `shouldScopeToSite()` |
| LRN-7 | When a new label matches an existing answer, it is added to that answer's aliases, improving future recall. | P1 | ✅ | `upsertAnswer()` adds aliases |
| LRN-8 | Management UI: list, edit value, edit scope, delete, see sites used. | P0 | ✅ | options **Remembered answers** section |
| LRN-9 | Learned answers are included in export/import. | P0 | ✅ | `exportAll()/importAll()` |
| LRN-10 | Learned answers never override a profile-key match; profile is the higher-authority source. | P0 | ✅ | `plan()` order in `autofill.js` |
| LRN-11 | Popup report shows `source: learned` and the original question the answer was captured from, so wrong reuse is visible before submit. | P0 | ✅ | popup shows `remembered from "…"`; purple flash on page |

## 7. Resume builder

| ID | Requirement | Priority | Status | Where |
| --- | --- | --- | --- | --- |
| BLD-1 | Render the profile as a single-column, table-free, icon-free document sized for US Letter with 0.5 in margins. | P0 | ✅ | `resume-template.js`, `resume.css` |
| BLD-2 | Text is inserted via DOM APIs, never `innerHTML`, so profile content can't become markup. | P0 | ✅ | `renderResume()` |
| BLD-3 | Print → Save as PDF hides the builder panel and prints only the document. | P0 | ✅ | `@media print` |
| BLD-4 | Copy as plain text and download `.txt`. | P1 | ✅ | `resumeToText()` |
| BLD-5 | Job-description tailoring: extract top keywords (stopwords removed), report coverage %, matched and missing terms. | P1 | ✅ | `tailor.js` |
| BLD-6 | Tailoring only reorders (stable sort) skills, bullets, projects; optional cap on bullets per role. Never edits text. | P0 | ✅ | `tailorProfile()` |
| BLD-7 | Dates render as `Mar 2021 – Present`. | P1 | ✅ | `formatRange()` |
| BLD-8 | Second visual template. | P2 | ⬜ | — |

## 8. User interface

| ID | Requirement | Priority | Status | Where |
| --- | --- | --- | --- | --- |
| UI-1 | Popup: profile readiness status, **Fill this page**, **Preview matches**, per-field result list, links to profile and builder. | P0 | ✅ | `popup.html/js` |
| UI-2 | Keyboard shortcut `Alt+Shift+F` fills the current page. | P1 | ✅ | `manifest.json` commands |
| UI-3 | Options page: editor for every profile section, add/remove/reorder for array sections, skills as comma list. | P0 | ✅ | `options.js` `bindScalars()/renderList()` |
| UI-4 | Options page: resume import dropzone with review/apply/discard. | P0 | ✅ | `bindImport()` |
| UI-5 | Options page: resume / cover-letter file slots (choose, remove, show name + size). | P0 | ✅ | `bindFileSlots()` |
| UI-6 | Options page: settings toggles (overwrite, attach resume, EEO, highlight, offer-to-remember). | P0 | ✅ | `bindSettings()` |
| UI-7 | Options page: export / import / clear-all with confirmation. | P1 | ✅ | `bindToolbar()` with confirm on clear |
| UI-8 | Options page: learned-answers manager (LRN-8). | P0 | ✅ | `renderLearned()` |
| UI-9 | Options page opens automatically on first install. | P1 | ✅ | `onInstalled` |
| UI-10 | Extension icons at 16/32/48/128. | P0 | ✅ | `scripts/make-icons.mjs` |
| UI-11 | Autosave with visible "Saved" state, or an explicit Save button — never lose edits on tab close. | P0 | ✅ | debounced autosave + Save button + flush on `beforeunload` |

## 9. Non-functional

| ID | Requirement | Priority | Status |
| --- | --- | --- | --- |
| NFR-1 | Manifest V3; minimum Chrome 116. | P0 | ✅ |
| NFR-2 | No build step. Plain ES modules; load unpacked from the repo root. | P0 | ✅ |
| NFR-3 | No runtime network requests. Verified by inspecting the Network panel during import, fill, and build. | P0 | ✅ |
| NFR-4 | No declared content scripts; injection happens only on user action. | P0 | ✅ |
| NFR-5 | Host permissions are limited to `http/https`; the reason (cross-origin ATS iframes) is documented. | P0 | ✅ |
| NFR-6 | Fill of a 60-field page completes in < 500 ms excluding file attach. | P1 | ⬜ (measure) |
| NFR-7 | Third-party code is limited to vendored pdf.js (Apache-2.0) with license preserved. | P0 | ✅ |
| NFR-8 | Pure modules (`text`, `dates`, `matcher`, `fieldmap`, `parser`, `tailor`, `schema`) have Node unit tests runnable with `node --test`. | P0 | ✅ |
| NFR-9 | A mock application form fixture exists per supported ATS for manual and automated fill tests. | P1 | ✅ |
| NFR-10 | Accessibility: options and popup usable with keyboard only; form controls have labels. | P1 | 🟡 |
| NFR-11 | Export file is clearly labelled as containing personal data. | P1 | 🟡 |

---

## 10. Acceptance test matrix (v0.1)

Each row is executed manually before a release; results recorded in `docs/TEST-LOG.md`.

| # | Scenario | Pass criteria |
| --- | --- | --- |
| A1 | Import a two-column PDF resume | Name, email, phone, LinkedIn correct; ≥ 80 % of work entries have correct company **and** title |
| A2 | Import a DOCX resume | Same as A1 |
| A3 | Greenhouse application (boards.greenhouse.io) | Name, email, phone, LinkedIn, GitHub, location, resume file, work-auth radios filled; "confirm email" untouched |
| A4 | Greenhouse embedded in a company careers page (iframe) | Same as A3 |
| A5 | Lever application | Full name, email, phone, current company, LinkedIn, GitHub, portfolio, resume filled |
| A6 | Ashby application | Name, email, phone, location, resume filled |
| A7 | Workday — My Information | Legal name, address, phone, email, how-heard, previously-worked radio filled |
| A8 | Workday — My Experience | 3 work blocks and 2 education blocks filled with distinct entries, most-recent-first |
| A9 | Custom question answered on A3 | On A7/A8's Application Questions page the same question is filled from the learned answer; popup shows `source: learned` |
| A10 | Preview mode | Zero DOM mutations; report lists what would be filled |
| A11 | Overwrite off | A pre-filled email is not replaced; report shows "already filled" |
| A12 | EEO off | No EEO field filled; report shows reason |
| A13 | Build resume → Print | PDF is single column, no builder chrome, entries don't split across pages |
| A14 | Tailor with a job description | Coverage % shown; matching skills move to the front; bullet text unchanged |
| A15 | Export → Clear all → Import | Profile, files, settings, learned answers restored byte-for-byte |
