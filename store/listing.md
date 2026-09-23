# Chrome Web Store submission — copy/paste sheet

Everything the Developer Dashboard asks for, in the order it asks. Images are
in `store/images/` (regenerate with `npm run screenshots`). Upload file:
`dist/resume-autofill-<version>.zip` from `npm run package -- --verify`.

---

## Store listing tab

**Name** (max 75)
```
Resume Autofill – Fill Job Applications From Your Resume
```

**Summary** (max 132)
```
Fill job applications in one click from your resume. Remembers answers you type once. Private: all data stays on your device.
```

**Category:** Workflow & Planning (alternative: Tools)

**Language:** English

**Description**
```
Stop retyping your resume into every job application.

Resume Autofill reads your resume once, then fills application forms for you on Workday, Greenhouse, Lever, Ashby, LinkedIn, SmartRecruiters, Workable and most company career sites.

HOW IT WORKS
1. Import your resume (PDF, Word .docx or text). Review what it found and fix anything it missed.
2. Open an application and click "Fill this page", or press Alt+Shift+F.
3. Check the filled fields and submit. The extension never submits for you.

NEVER TYPE THE SAME ANSWER TWICE
Applications ask questions a resume can't answer, like "Which time zone are you in?" or "Are you comfortable with 20% travel?". Answer one once, and Resume Autofill offers to remember it. The next form that asks the same question, on any site, is filled automatically. Answers about a specific employer ("Have you worked at Acme before?") are kept to that employer's site.

WHAT IT FILLS
• Name, email, phone, address and location
• LinkedIn, GitHub and portfolio links
• Work history: each employer block gets a different job, most recent first
• Education, skills and cover letter
• Salary expectation, start date, notice period, relocation and travel
• Work authorisation and visa sponsorship questions
• Your resume and cover letter file uploads
• Voluntary self-identification questions, only if you switch this on

Fields it isn't sure about are left blank rather than guessed. It never touches "confirm email" fields, and it won't overwrite what you've already typed.

BUILD A TAILORED RESUME
Paste a job description to see which of its keywords your resume covers and which it's missing. Your skills and bullet points are reordered so the most relevant come first. Nothing is rewritten or invented. Save the result as a clean, ATS-friendly PDF.

PRIVATE BY DESIGN
• Your data is stored only in your browser. Nothing is uploaded, ever.
• No account, no sign-up, no analytics, no ads.
• The extension runs on a page only when you click Fill.
• Export your data to a file, or delete it all with one click.

Open source: https://github.com/krishna-singh1/resume-autofill
```

**Graphic assets**
| Field | File |
| --- | --- |
| Store icon (128×128) | `icons/icon128.png` |
| Screenshots (1280×800), in this order | `screenshot-1-fill.png`, `screenshot-2-remember.png`, `screenshot-3-builder.png`, `screenshot-4-import.png` (all in `store/images/`) |
| Small promo tile (440×280) | `store/images/promo-small-440x280.png` |
| Marquee promo tile (1400×560, optional) | `store/images/promo-marquee-1400x560.png` |

**Official URL / Homepage URL:** `https://github.com/krishna-singh1/resume-autofill`

**Support URL:** `https://github.com/krishna-singh1/resume-autofill/issues`

---

## Privacy practices tab

**Single purpose description**
```
Fills job application forms with information from the user's own resume profile, which is stored locally in the browser, when the user asks it to.
```

**Permission justifications**

`storage`
```
Stores the user's resume profile, remembered form answers and settings locally in chrome.storage.local. Nothing is synced or sent off the device.
```

`unlimitedStorage`
```
The user's resume and cover-letter files (PDF or DOCX, often 0.5–5 MB) are stored locally so they can be attached to "Upload resume" fields on application forms. The default quota is too small for these files.
```

`scripting`
```
When the user clicks "Fill this page" or presses the keyboard shortcut, the extension injects its form-filling script into the current tab to read the form's fields and write the user's details into them. There is no content script declared in the manifest; nothing runs on a page until the user asks.
```

`activeTab`
```
Grants access to the tab the user is on when they click the toolbar button or press the shortcut, so the form on that page can be filled.
```

Host permissions (`http://*/*`, `https://*/*`)
```
Job application forms are very often embedded from a different site than the one the user is visiting. For example, a Greenhouse or Lever form sits in an iframe inside a company's own careers page. activeTab only covers the top-level page, so without host access the extension cannot reach the embedded form, which is the part that needs filling. This access is used only when the user triggers a fill. The extension makes no network requests to any host.
```

**Are you using remote code?** No.
```
All JavaScript is included in the package. The only third-party library, Mozilla pdf.js, is bundled locally in src/vendor/ and used to read PDF files the user imports.
```

**Data usage.** The data never leaves the device, but it is still personal data
that the extension handles, so disclose it. Over-disclosing is never a policy problem.

Tick:
- [x] Personally identifiable information (name, email, phone, address)
- [x] Location (the user can store their address and city)
- [x] Website content (the extension reads form-field labels on pages it fills)

Leave unticked: health, financial and payment info, authentication information,
personal communications, web history, user activity.

Justification, if asked:
```
The user enters or imports their own resume details. They are stored only in local browser storage and written into web forms only when the user asks. No data is transmitted to the developer or any third party.
```

**Certifications** (tick all three)
- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL**
```
https://krishna-singh1.github.io/resume-autofill/privacy
```

---

## Distribution tab

- **Visibility:** start with **Unlisted** to share with a few people, then switch to Public.
- **Regions:** all regions.
- **Pricing:** free.

## Notes for the reviewer (optional field)

```
To test: open the options page (opens on install), click "choose a file" and import any resume PDF, or fill in name/email manually and press Save. Then open any job application page, for example https://boards.greenhouse.io/ with any open job, click the toolbar icon, and press "Fill this page". The extension makes no network requests; all data is in chrome.storage.local.
```
