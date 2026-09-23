# Resume Autofill — Product Requirements Document

| Field | Value |
| --- | --- |
| Product | Resume Autofill (Chrome extension, Manifest V3) |
| Version | 0.1 (draft) |
| Owner | Krishna Singh |
| Status | v0.1 feature-complete; pre-release QA |
| Last updated | 2026-09-23 |

---

## 1. What this product is

Resume Autofill is a Chrome extension that lets a job seeker **upload their resume once and have job application forms filled for them** on any applicant tracking system (ATS) — Workday, LinkedIn Easy Apply, Greenhouse, Lever, Ashby, SmartRecruiters, Workable, Taleo, iCIMS, and company-hosted forms.

Three things make it different from browser autofill:

1. **It understands resumes, not just addresses.** Work history, education, skills, links, work-authorisation answers and voluntary self-ID answers are all first-class data, not just name/email/phone.
2. **It never asks twice.** When a form has a question the profile cannot answer ("Have you worked at Acme before?", "Salary expectation in EUR?"), the user answers it once. The answer is remembered and reused on every later form that asks the same thing — across different sites.
3. **It is local and rule-based.** Nothing is sent to a server. Field matching is deterministic heuristics plus per-site rules, so behaviour is predictable and auditable.

It also generates a clean, ATS-safe resume PDF from the same profile, optionally reordered to match a job description's keywords.

---

## 2. Problem

Applying to jobs means re-typing the same 30–60 fields into a different form for every application. A Workday application alone takes 15–25 minutes; a typical search involves 50–200 applications. The information is identical every time and already exists in the candidate's resume.

Existing tools fall short:

| Approach | Gap |
| --- | --- |
| Chrome's built-in autofill | Only knows contact/address data; ignores work history, education, custom questions. |
| ATS "parse my resume" buttons | Parsing quality varies by vendor; the user still corrects it on every site. |
| Simplify / Teal / LazyApply | Cloud-hosted; resume and answers leave the device. Subscription pricing. LLM-driven matching is opaque. |
| Copy-paste from a notes doc | Slow, error-prone, still manual. |

---

## 3. Goals and non-goals

### Goals

- **G1.** A user with a saved profile can fill ≥ 80 % of fields on a standard application form (Greenhouse, Lever, Ashby, Workday personal-info page) in one click.
- **G2.** A user never has to type the same answer to the same question twice, regardless of which site asks it.
- **G3.** Onboarding from an existing PDF/DOCX resume takes under 5 minutes including review.
- **G4.** Zero data leaves the browser. No accounts, no servers, no telemetry.
- **G5.** Works with no build step — clone, "Load unpacked", done.

### Non-goals (v0.x)

- Auto-submitting applications. The user always presses Submit.
- Solving CAPTCHAs, logging in to job sites, or bypassing anti-bot measures.
- LLM-generated cover letters or rewritten bullet points. Tailoring is reorder-only.
- Firefox / Safari support (MV3 differences; revisit after Chrome is stable).
- Cloud sync between devices (a manual Export / Import file covers this for now).
- Tracking which jobs were applied to (a job tracker is a separate product).

---

## 4. Target users

**Primary — the active job seeker.** Applying to 5–30 roles a week, mostly via ATS portals. Comfortable installing an extension. Wants speed and correctness; is anxious about sending wrong information.

**Secondary — the passive candidate.** Applies occasionally. Values the "upload resume, done" onboarding more than raw speed; must not have to learn a complex profile editor.

**Tertiary — the privacy-conscious professional.** Will not use cloud autofill tools. Chooses this product specifically because it is local-only and inspectable.

---

## 5. User journeys

### 5.1 First run: profile from an existing resume

1. User installs the extension; the profile page opens automatically.
2. User drops `resume.pdf` onto the page.
3. Extension extracts text (pdf.js), parses name, contact, links, experience, education, skills, and shows the result in the editor with a list of warnings ("Could not find graduation year for MIT").
4. User corrects a couple of fields, adds work-authorisation answers, presses **Save**.
5. Extension also keeps the original PDF so it can be attached to upload fields later.

### 5.2 Filling a Greenhouse application

1. User opens a Greenhouse job, clicks **Apply**.
2. User clicks the extension icon → **Fill this page** (or presses `Alt+Shift+F`).
3. Site rules fill first/last name, email, phone, LinkedIn, resume upload. The generic matcher fills the rest (location, GitHub, "How did you hear about us", work authorisation radio buttons).
4. Filled fields flash green; a toast says "Filled 14 fields".
5. Two custom questions remain: "Are you comfortable with 20 % travel?" and "Which time zone are you in?". The user types answers.
6. Extension detects the user completing fields it could not fill and offers: **Remember these 2 answers?** User accepts.
7. User reviews and submits.

### 5.3 Filling a Workday application (multi-page)

1. On **My Information**: extension fills name, address, phone, email, "How did you hear about us", previously-worked-here radio (remembered answer).
2. On **My Experience**: extension fills three employment blocks and two education blocks from the profile arrays, most-recent-first; attaches the stored resume.
3. On **Application Questions**: extension fills work authorisation, sponsorship, relocation from the profile, and "Which time zone are you in?" from the answer remembered in 5.2 — even though this is a different company and a different ATS.
4. On **Voluntary Disclosures**: skipped unless the user has enabled EEO filling.

### 5.4 Generating a tailored resume

1. User opens **Build resume**, pastes the job description.
2. Extension shows keyword coverage (e.g. "63 % — missing: kubernetes, terraform") and reorders skills and bullet points so the matching ones appear first. Nothing is rewritten.
3. User prints to PDF and uploads it in the application.

---

## 6. Feature specification

### 6.1 Profile

The single source of truth. Stored in `chrome.storage.local`.

| Section | Contents |
| --- | --- |
| Basics | First / last / preferred name, pronouns, email, phone, street, city, state, postal code, country, summary |
| Links | LinkedIn, GitHub, portfolio, Twitter/X |
| Work | Array, most-recent-first: company, title, location, start, end, current flag, bullet highlights |
| Education | Array: school, degree, field, location, start, end, GPA |
| Projects | Array: name, URL, description, highlights |
| Skills | Ordered list |
| Application | Cover letter, desired salary, available start date, notice period, relocate, travel, how-heard, years of experience |
| Work authorisation | Authorised to work, requires sponsorship, visa status |
| EEO (voluntary) | Gender, Hispanic/Latino, race, veteran, disability |
| Files | Resume PDF/DOCX and optional cover letter file, stored as data URLs for re-attachment |

### 6.2 Resume import

- Accepts PDF (pdf.js, vendored), DOCX (zero-dependency zip + XML reader), TXT/MD.
- Heuristic parser recognises section headings, date ranges, title/company splits, degree and school keywords, skill lists.
- Output is shown for review; nothing is saved until the user confirms. Warnings list what could not be found.
- The uploaded file is retained for attachment to "Upload resume" inputs.

### 6.3 Form filling engine

**Pipeline:** scan → site rules → generic matcher → learned answers → fill → report.

- **Scan.** Every visible, enabled `input`/`select`/`textarea` in every frame (including open shadow roots) becomes a descriptor: label (resolved via `for=`, `aria-labelledby`, `aria-label`, wrapping `<label>`, single-control ancestors, preceding sibling), `name`, `id`, `autocomplete`, placeholder, data-automation-id (Workday), enclosing section heading, options. Radio/checkbox sets collapse into one descriptor.
- **Site rules.** Hand-written selector maps for Greenhouse, Lever, Ashby, Workday, SmartRecruiters, Workable, Jobvite. A matched selector always wins.
- **Generic matcher.** Whole-word phrase matching against a rule table of ~50 canonical keys, scored by source (`autocomplete` > exact label > label phrase > name/id > placeholder), with disqualifying negatives ("confirm email", "company name" vs "name") and section boosts ("Start date" inside an Experience block). Repeatable keys are indexed in DOM order so N employment blocks pull N different jobs.
- **Learned answers.** See 6.4.
- **Fill.** Uses the native value setter and dispatches `input`/`change` so React/Angular/Vue controlled inputs accept the value. Selects and radio groups pick the closest option by text similarity. Date inputs receive correctly formatted values. File inputs receive the stored resume via `DataTransfer`.
- **Report.** Every field: filled / skipped (with reason) / failed. Shown in the popup; **Preview** mode runs the pipeline without writing.

### 6.4 Learned answers ("never type it twice")

The core differentiator. Two capture paths:

1. **Post-fill capture.** After a fill, the extension watches the fields it could not fill. When the user leaves the page or the form is submitted, it offers to remember any the user completed.
2. **Manual capture.** Popup lists unfilled fields with an inline "remember this answer" control.

Storage model:

```
learnedAnswers: [
  {
    id,                      // stable hash
    question: "which time zone are you in",   // normalised label text
    aliases: ["time zone", "your timezone"],  // other labels matched to this answer
    kind: "text" | "choice" | "boolean" | "longtext",
    value: "Asia/Kolkata",
    sites: ["greenhouse.io", "myworkdayjobs.com"],
    createdAt, lastUsedAt, useCount
  }
]
```

Matching a new field to a learned answer uses the same whole-word phrase scorer as the profile matcher, with a higher threshold (the cost of a wrong custom answer is higher than a wrong phone number). Ties are broken by `useCount`. The user can review, edit, and delete learned answers on the profile page, and see which sites each answer has been used on.

Learned answers are **site-agnostic by default**: an answer captured on Workday is offered on LinkedIn. A per-answer "only on this site" toggle exists for company-specific questions ("Have you worked at Acme before?" — which the matcher also auto-scopes when the label contains the site's company name).

### 6.5 Resume builder

- Renders the profile as a single-column, table-free, icon-free document sized to US Letter — the layout ATS parsers read reliably.
- Print → Save as PDF via the browser dialog; copy/download as plain text.
- Keyword tailoring: extracts frequent non-stopword terms from a pasted job description, reports coverage and missing terms, and stably reorders skills/bullets so matches surface first. Optional cap on bullets per role.

### 6.6 Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| Overwrite existing values | Off | Never clobber what the user or site already entered |
| Attach resume file | On | Fill `<input type=file>` with the stored resume |
| Fill EEO / self-ID | Off | Voluntary questions stay blank unless opted in |
| Highlight filled fields | On | Visual confirmation |
| Offer to remember answers | On | Enables 6.4 capture prompts |

---

## 7. Privacy and security principles

- All data in `chrome.storage.local`. No network requests are made by the extension. No analytics.
- No content script is declared in the manifest; code is injected only when the user triggers a fill. Pages the user never fills on run none of the extension's code.
- Host permissions (`http://*/*`, `https://*/*`) are required because ATS forms are frequently embedded in cross-origin iframes (e.g. Greenhouse inside a company careers page); `activeTab` alone cannot reach them. This is stated in the README.
- The resume file is stored as a data URL and only ever written into a file input the user is looking at.
- EEO answers are off by default and displayed with a plain-language explanation.
- Export produces a single JSON file; the user is told it contains personal data.

---

## 8. Success metrics

| Metric | Target | How measured |
| --- | --- | --- |
| Fill rate on the reference form set (Greenhouse, Lever, Ashby, Workday p1–p3, LinkedIn Easy Apply) | ≥ 80 % of fillable fields | Manual test matrix, recorded per release |
| Wrong-field rate | < 2 % of filled fields | Same matrix; any value in a semantically wrong field counts |
| Re-ask rate | 0 for questions already answered once | Fill the same custom question on two different ATSs |
| Import accuracy on 10 sample resumes | Name, email, phone: 100 %; work entries: ≥ 80 % with correct company + title | Fixture set in `tests/fixtures/` |
| Time from install to first successful fill | < 5 minutes | Hallway test |

No telemetry — these are measured in development and by user report only.

---

## 9. Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| ATS markup changes break site rules | Fill rate drops on that site | Generic matcher is the fallback; rules are one small file; test fixtures per site |
| Custom widgets (react-select, Workday dropdowns) ignore native events | Selects not filled | Try native path first; add per-site interaction rules (click → type → pick) for the worst offenders |
| Resume parser misreads a layout | Bad profile data | Always show parsed output for review; never save silently |
| Learned answer matched to the wrong question | User submits a wrong answer | Higher match threshold than profile fields; preview shows the source of every value; answer text shown next to the question in the popup |
| Storage quota (large resume PDFs) | Save fails | `unlimitedStorage` permission; warn above 5 MB per file |
| User expects auto-submit or "apply to 100 jobs" | Disappointment | Positioning is explicit: it fills, you review, you submit |

---

## 10. Release plan

| Milestone | Scope | Status |
| --- | --- | --- |
| **M1 — Core engine** | Schema, storage, scanner, matcher, filler, site rules, popup, service worker | Done |
| **M2 — Import & build** | PDF/DOCX/TXT parsing, resume renderer, tailoring | Done |
| **M3 — Options editor** | Full profile editor, file slots, import/export, settings | Done |
| **M4 — Learned answers** | Capture, storage, matching, management UI | Done |
| **M5 — Quality** | Unit tests (94), e2e in a real browser (66 checks), mock forms, icons, README | Done |
| **M6 — Release** | Chrome Web Store listing, privacy policy page | Not started |

---

## 11. Open questions

1. ~~Should learned answers be captured automatically on submit, or always prompt?~~ Resolved: captured to a pending list, always confirmed in the popup.
2. Do we scope learned answers to the ATS domain by default, or globally? (Current spec: global, with auto-scoping when the label mentions the employer.)
3. Workday's custom dropdowns — is a per-site interaction script worth the maintenance, or do we accept reporting them as "needs manual input"?
4. Should the resume builder support a second template? (Deferred until users ask.)
