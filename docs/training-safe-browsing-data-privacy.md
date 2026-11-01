# Training Content Phase TC2 — Safe Browsing and Data Privacy

TC2 adds two human-authored beginner courses for all employees. Both reuse the TC1 approach unchanged: the existing course and quiz engines, section-by-section progress, assignments, certificates, Awareness Analytics and the plain-text lesson renderer (see `docs/training-phishing-awareness.md`).

**Status:** both courses and their quizzes exist as **drafts** in the local development database. Neither is published or assigned.

| Course | Topic | Program ID (local dev DB) | Duration | Source |
| --- | --- | --- | --- | --- |
| Safe Browsing | `SAFE_BROWSING` | `5f5e5dd6-fdfc-468f-ad7d-f541704a2d19` | 9 min (about 6 reading + 3 quiz) | `backend/src/training/content/safe-browsing.js` |
| Data Privacy | `INFORMATION_HANDLING` | `13baa48d-3472-453a-a591-efb5d8ea56e0` | 9 min (about 6 reading + 3 quiz) | `backend/src/training/content/data-privacy.js` |

Data Privacy uses `INFORMATION_HANDLING` because the existing topic list has no privacy topic. No new topic was added.

The source files hold the full lesson text. Every lesson uses short paragraphs, lists, and Example, Watch out and Tip callouts, and ends with a Key takeaway. All people, customers, accounts and websites are fictional, and every web address uses a reserved example domain.

## Course A — Safe Browsing

**Subtitle:** Stay safe while exploring the web.

**Learning objectives:**
- Explain what HTTPS does and does not prove.
- Recognize lookalike sites, fake sign-in pages, pop-ups and fake security alerts.
- Avoid risky downloads, fake updates and unapproved extensions.
- Recognize QR-code and shortened-link tricks and verify requests independently.
- Apply safe-browsing habits and report through approved channels.

| # | Key | Lesson | Content |
| --- | --- | --- | --- |
| 1 | `browsing-safely` | Browsing safely | Why sites cannot all be trusted; care with unfamiliar links; what "Deceptive site" and "Not private" warnings mean; the padlock means "encrypted", not "trustworthy" (example with two padlocked sites). |
| 2 | `dangerous-websites` | Recognizing dangerous websites | Lookalike names, fake sign-in pages, unexpected credential requests, fake payment and verification pages, redirects, misleading pop-ups, fake security alerts. Fictional fake invoice-portal example. Four steps to navigate to a site yourself. No practice visits to malicious sites. |
| 3 | `downloads-attachments` | Downloads and attachments | Unfamiliar files, fake updates, over-privileged extensions, "Enable content" documents, unofficial software. Scenario: a fictional employee is offered a fake meeting-software update and joins through the IT-installed app instead. Use only approved software. |
| 4 | `qr-codes-online-tricks` | QR codes and online tricks | What QR phishing is, stickers covering genuine codes, QR codes in emails, fake sign-in pages. Scenario: a "free coffee" cafeteria QR sticker that asks for a work password. Shortened links. Independent verification. |
| 5 | `safe-browsing-habits` | Safe browsing habits | Six-point checklist. The EWAGuard AI URL Analyzer can help assess a link, but no automated check guarantees safety or replaces reporting. What to do after a mistake. Recap. |

### Quiz (80% to pass, 3 attempts, 1 point each)

| # | Type | Question (summary) | Correct answer | Explanation |
| --- | --- | --- | --- | --- |
| 1 | Multiple choice | A search result `payroll-example-login.example` imitates `payroll.example.com` and asks for your password. | Close it, open the known address or a bookmark, and report it. | The website name differs from the one you know. Navigate yourself. |
| 2 | Multiple choice | A pop-up says your browser is out of date and offers an update. | Close it and rely on approved IT update processes. | Real updates do not come from website pop-ups. |
| 3 | Multiple choice | A lobby poster's QR sticker offers a parking permit if you sign in with your work account. | It asks for work credentials after scanning a code that may cover the original. | Classic QR phishing. Verify and report. |
| 4 | True/False | A padlock and HTTPS mean it is safe to enter your password. | False | HTTPS means encrypted, not legitimate. |
| 5 | True/False | After an unexpected link leads to a sign-in page, it is safer to open the service yourself. | True | Avoids lookalike and redirected pages. |

## Course B — Data Privacy

**Subtitle:** Protecting personal and confidential information.

**Learning objectives:**
- Explain what personal information is and why it must be protected.
- Recognize sensitive information at work.
- Handle, store and share it safely.
- Describe at a high level why the PDPL matters.
- Respond to privacy mistakes and report suspected incidents promptly.

| # | Key | Lesson | Content |
| --- | --- | --- | --- |
| 1 | `what-is-data-privacy` | What is data privacy? | Definition of personal information; fictional utility examples (service requests, billing history, HR records, contractor IDs); why it matters for people, the organization and you. |
| 2 | `recognizing-sensitive-information` | Recognizing sensitive information | Customer contacts and accounts, employee records, identity documents, internal documents, passwords and codes, confidential operational information. A fictional "visit list" spreadsheet. Different data needs different handling under approved policies (no classification scheme is invented). |
| 3 | `handling-information-safely` | Handling information safely | Authorized recipients, checking recipients, sharing the minimum, avoiding copies, approved storage and sharing, locking screens, printed documents, no personal cloud. Scenario: a fictional employee about to email a customer arrears spreadsheet to a contractor's personal address instead shares an anonymized summary through approved channels. |
| 4 | `data-privacy-in-bahrain` | Data privacy in Bahrain | Bahrain's Personal Data Protection Law (PDPL) at awareness level: data deserves protection, access must serve an authorized work purpose, follow approved policies, escalate suspected incidents promptly. Explicitly not legal advice; refers questions to the DPO, legal or compliance team. Mentions the existing EWAGuard AI PDPL assistant as guidance only. |
| 5 | `everyday-privacy-decisions` | Everyday privacy decisions | Safe general responses to a misdirected document received, a record sent to the wrong person, papers left visible, work data in unapproved AI tools, and personal messaging apps. Checklist and Key takeaway. |

### Quiz (80% to pass, 3 attempts, 1 point each)

| # | Type | Question (summary) | Correct answer | Explanation |
| --- | --- | --- | --- | --- |
| 1 | Multiple choice | Which is personal information? | A customer's name, account number and home address. | Identifies a person; statistics and public information do not. |
| 2 | Multiple choice | A contractor asks for customer contacts at their personal email. | Confirm the need and authorization, then share the minimum through an approved system. | Minimum, authorized, approved channel. |
| 3 | Multiple choice | You emailed a customer's account details to the wrong external recipient. | Report it promptly through the approved channel, even if you also ask them to delete it. | Early reporting limits harm. |
| 4 | True/False | It is fine to paste a complaint with a name and account number into any public AI chatbot. | False | Use only approved tools. |
| 5 | True/False | Report possible exposure of customer information promptly, even if unsure. | True | Certainty is not required. |

## PDPL content limits and items needing organizational approval

Lesson 4 intentionally names only the law and gives general principles. It does **not** state:
- the law number or articles,
- obligations or deadlines,
- notification timelines,
- penalties,
- consent rules or exceptions,
- any EWA-specific compliance procedure.

A test enforces this. The repository's PDPL corpus is an unofficial English translation, so it was not used as a legal source for training content.

Before publication, the content owner, and the DPO or legal team where appropriate, should confirm:
1. The PDPL lesson wording is acceptable for staff awareness.
2. Employees know the approved channel for privacy incidents and security reports. The courses refer to it only generically.
3. Data Privacy's references to "approved data-handling and classification policies", approved sharing and storage systems, and approved AI tools match the policies employees actually have.
4. Safe Browsing's statements that software, updates and extensions come only through approved IT processes match current IT practice.
5. The `INFORMATION_HANDLING` topic is acceptable for Data Privacy.

## Provisioning

```bash
npm run training:provision -- --course safe-browsing --admin-email <administrator email>
npm run training:provision -- --course data-privacy --admin-email <administrator email>
npm run training:provision -- --course all --admin-email <administrator email>
```

The TC1 command `npm run training:provision:phishing -- --admin-email …` still works. All three courses go through one shared, development-only script (`backend/scripts/provision-training-course.js`), which refuses `NODE_ENV=production`. It uses the TC1 service `provisionCourse`, which:
- requires an active `IT_SECURITY_ADMIN` with MFA enrolled, who is recorded as the author;
- creates the draft through the existing training and quiz services, with `TRAINING_CREATED` and `COURSE_QUIZ_CREATED` audit records;
- treats any program with the same title (case-insensitive, any topic) as existing and changes nothing;
- never reviews, publishes, assigns, or touches progress, attempts or certificates.

**Local result:** each course was created once by `admin@ewa.bh`. Rerunning `--course all` reported "Already exists. Nothing was changed." for all three courses.

## Administrator, employee, certificate and analytics workflow

These are identical to TC1:
1. Preview the course and its quiz in **Training Programs** (`/admin/training`).
2. **Review** and **Publish** the course, then **Approve** and **Publish** the quiz.
3. **Assign** employees individually.

Employees start the course, acknowledge the five lessons in order (progress is saved on the server and resumes after a refresh or new sign-in), and then take the quiz. A passing attempt completes the course and issues a certificate under the existing rules. Failed attempts leave the course in progress. Completion, quiz scores, pass rates and certificates appear in the existing Awareness Analytics.

## Limitations

- The courses are text-only, with no video or interactive simulator.
- Browser visual verification as administrator and employee has not been performed.
- Section acknowledgement shows that the workflow was completed, not that the employee understood the material. The quiz is the comprehension check.
