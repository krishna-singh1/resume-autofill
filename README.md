# Resume Autofill

A Chrome extension that fills job application forms from your resume — and
remembers the answers you type once so you never type them twice.

- **Upload your resume** (PDF, DOCX or text). It's parsed into an editable profile.
- **One click fills the form** on Greenhouse, Lever, Ashby, Workday, SmartRecruiters,
  Workable, LinkedIn Easy Apply, and any other site with sensibly labelled fields.
- **Leftover questions are remembered.** Answer "Which time zone are you in?" once on a
  Workday form; it's filled for you on the next Greenhouse form that asks.
- **Builds an ATS-safe resume PDF** from the same profile, with keyword ordering
  matched to a pasted job description.
- **Local only.** No account, no server, no analytics. Everything is in
  `chrome.storage.local` on your machine.
- **No build step.** Plain ES modules. Clone and load.

Product docs: [docs/PRD.md](docs/PRD.md) · [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)

---

## Install (unpacked)

1. `git clone` this repo (or download it).
2. Open `chrome://extensions`, turn on **Developer mode**.
3. **Load unpacked** → select the `resume-autofill` folder.
4. The profile page opens. Drop your resume on it, review, and press **Save**.

Works in Chrome 116+, Edge, Brave and other Chromium browsers.

## Use

| Action | How |
| --- | --- |
| Fill the current page | Click the extension icon → **Fill this page**, or press `Alt+Shift+F` |
| See what *would* be filled | **Preview matches** — touches nothing, shows every field and its source |
| Remember leftover answers | After a fill, type into the fields that stayed empty. The popup offers to remember them. Or click **Remember answers here** any time |
| Build a resume | Popup → **Build resume** → paste a job description → **Tailor** → **Print / Save as PDF** |
| Edit anything | Popup → **Edit profile** |
| Move to another browser | Profile page → **Export** (JSON, includes files and remembered answers) → **Import** |

Filled fields flash green; fields filled from a remembered answer flash purple.

## What gets filled

Identity, contact and address · LinkedIn / GitHub / portfolio · work history (each
"Company / Title / Dates" block gets a different job, most recent first) · education ·
skills · cover letter · desired salary, start date, notice period, relocation, travel ·
"How did you hear about us" · work authorisation and sponsorship · resume and cover
letter **file uploads** · voluntary EEO questions (off by default) · anything you've
answered before.

Fields it isn't confident about are left blank rather than guessed. `Confirm email`
is never touched. Existing values are never overwritten unless you turn that on.

## Privacy and permissions

| Permission | Why |
| --- | --- |
| `storage`, `unlimitedStorage` | Your profile and resume file live in local extension storage |
| `scripting`, `activeTab` | Inject the filler into the page **only when you ask** — there is no always-on content script |
| `host_permissions: http/https` | Application forms are routinely embedded in cross-origin iframes (e.g. a Greenhouse form inside a company careers page); `activeTab` alone cannot reach those frames |

The extension makes **no network requests**. The only third-party code is a vendored
copy of Mozilla's [pdf.js](https://mozilla.github.io/pdf.js/) (Apache-2.0) for reading
PDFs locally.

## How matching works

1. **Site rules** (`src/core/siterules.js`) — hand-written selectors for ATSs with stable
   markup. Always win.
2. **Generic matcher** (`src/core/matcher.js` + `fieldmap.js`) — whole-word phrase
   matching on the label, `name`/`id`, `autocomplete`, placeholder and enclosing section
   heading, with disqualifying negatives. Deterministic; no LLM.
3. **Remembered answers** (`src/core/learned.js`) — for fields nothing above claimed,
   matched by question similarity with a higher bar than profile fields.

Values are written through the native property setter and followed by `input`/`change`
events so React, Angular and Vue controlled inputs accept them (`src/core/filler.js`).

## Development

```
npm test                        # 103 unit tests for the pure modules (node --test, no deps)
npm run check                   # parse every script + validate manifest references
npm run test:e2e                # 70 checks in a real headless browser against mock ATS forms
npm run parse -- ~/resume.pdf   # run a real resume through the extension's parser and print the result
npm run icons                   # regenerate icons/ from scripts/make-icons.mjs
npm run package -- --verify     # build + load-test the store zip (see Publishing)
npm run screenshots             # regenerate store images
```

`npm run parse` is the tool to reach for when the importer gets a resume wrong: add
`--text` to also print the text pdf.js extracted, which shows whether the problem is
in extraction (columns glued together, missing links) or in parsing.

The end-to-end suite launches a Chromium-based browser with the extension loaded and
drives it over the DevTools protocol — seeding a profile through the service worker,
filling `tests/fixtures/forms/*.html`, and exercising the options/resume/popup pages
(including PDF parsing through pdf.js). **Branded Google Chrome 137+ ignores
`--load-extension`**, so the runner looks for Chromium, Chrome for Testing or Microsoft
Edge. Point it elsewhere with `CHROME_PATH=…`.

```
src/
  background/service-worker.js   on-demand injection, keyboard command, popup broker
  content/autofill.js            scan → site rule → matcher → learned → fill → report
  core/                          pure logic (unit-tested) + thin DOM adapters
    schema.js  storage.js  fieldmap.js  matcher.js  scanner.js  filler.js
    siterules.js  learned.js  parser.js  pdf.js  docx.js  dates.js  text.js
    resume-template.js  tailor.js
  ui/                            popup, options (profile editor), resume builder
  vendor/                        pdf.js (unmodified)
tests/                           unit tests, fixtures, e2e runner
docs/                            PRD, requirements
```

### Adding a site rule

Add an entry to `SITE_RULES` in `src/core/siterules.js` with a hostname test and a
`selector → profile key` map. Keys are dotted paths (`basics.email`); repeating sections
take an index (`work[0].company`). Everything the rule doesn't cover still goes through
the generic matcher.

### Adding a field

Add a definition to `FIELD_DEFINITIONS` in `src/core/fieldmap.js` and a positive plus a
negative label example to `tests/matcher.test.js`.

## Publishing

```
# 1. bump "version" in manifest.json and package.json (the store rejects re-used versions)
npm run package -- --verify     # checks + tests, builds dist/resume-autofill-<version>.zip, loads it in a browser
npm run screenshots             # regenerates store/images/ from the real UI with a fictional demo profile
```

Then upload the zip at the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
Every field the dashboard asks for (description, permission justifications, data-usage
answers, reviewer notes) is ready to paste in [store/listing.md](store/listing.md). The privacy
policy is [docs/privacy.md](docs/privacy.md), published by GitHub Pages at
https://krishna-singh1.github.io/resume-autofill/privacy. The same zip works for the Microsoft Edge Add-ons store.

## Known limitations

- Custom dropdown widgets (react-select, Workday prompts) that aren't a real `<select>`
  are reported as skipped; native selects and radio groups work.
- Resume parsing is heuristic. It handles the common layouts well and always shows you
  the result before saving; unusual layouts need a manual tidy.
- Legacy `.doc` files aren't supported — save as `.docx` or PDF.
- No auto-submit, by design. You review, you submit.
