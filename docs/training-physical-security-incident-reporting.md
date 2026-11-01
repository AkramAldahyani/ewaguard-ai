# Training Content Phase TC3 — Physical Security and Reporting Security Incidents

TC3 adds two human-authored beginner courses for all employees. They use the same platform and conventions as TC1 and TC2 (`docs/training-phishing-awareness.md`, `docs/training-safe-browsing-data-privacy.md`). The existing course and quiz engines, section progress tracking, assignments, certificates, Awareness Analytics, the plain-text lesson renderer and the shared provisioning command are reused unchanged.

**Status:** both courses and their quizzes exist as **drafts** in the local development database. Neither is published or assigned. There are no schema or migration changes.

| Course | Topic | Program ID (local dev DB) | Duration | Source |
| --- | --- | --- | --- | --- |
| Physical Security | `PHYSICAL_SECURITY` | `bdddf802-0442-456c-a984-7fb33778cf07` | 9 min (about 6 reading + 3 quiz) | `backend/src/training/content/physical-security.js` |
| Reporting Security Incidents | `INCIDENT_REPORTING` | `411b3863-fbe4-47be-b4a0-5636daaeb190` | 9 min (about 6 reading + 3 quiz) | `backend/src/training/content/reporting-security-incidents.js` |

Both topics already exist in the domain model. The course model has no subtitle field, so, as in TC1 and TC2, each subtitle opens the description. The source files hold the full lesson text. Every lesson uses short paragraphs, lists, Example, Watch out and Tip callouts, and a Key takeaway. All people are fictional.

## Course A — Physical Security

**Subtitle:** Protecting our workplace and information.

**Learning objectives:**
- Explain why physical security matters.
- Protect your workspace and computer.
- Recognize unauthorized-access risks.
- Handle documents and removable devices safely.
- Report suspicious physical-security situations.

| # | Key | Lesson | Content |
| --- | --- | --- | --- |
| 1 | `why-physical-security-matters` | Why physical security matters | Cybersecurity includes places, equipment and paper. Scenario: a propped side door, an unlocked computer and a printed staff list photographed in five minutes. |
| 2 | `lock-screen-protect-desk` | Lock your screen and protect your desk | Lock every time (Windows key + L), no passwords on sticky notes, put printouts away, nothing sensitive in shared areas, approved storage and disposal. Scenario: a fictional employee leaves his computer unlocked during a long meeting; the safe alternative. |
| 3 | `badges-visitors-tailgating` | Badges, visitors and tailgating | What badges and tailgating are; why friendly is not authorized. **Tailgating scenario:** a person in a contractor jacket "forgot his badge". Politely decline, direct him to reception or the visitor process, report if he persists. Never confront; stay safe. Follow approved visitor procedures. |
| 4 | `devices-and-documents` | Protecting devices and documents | Secure laptops and phones, no unknown USB drives or chargers, approved storage, no unattended papers, approved disposal, report lost items immediately. Scenario: a USB drive labelled "Salary review - confidential" is found; report it, never test it. |
| 5 | `when-something-looks-suspicious` | What to do when something looks suspicious | Safe responses to: an unfamiliar person in a restricted area, a lost badge, an unlocked workstation, a lost laptop, unattended documents. Follow emergency procedures first if people are in danger. Six-point checklist. |

### Quiz (80% to pass, 3 attempts, 1 point each)

| # | Type | Question (summary) | Correct answer | Explanation |
| --- | --- | --- | --- | --- |
| 1 | Multiple choice | Stepping away for five minutes: what about your computer? | Lock it before you leave, for example with Windows key + L. | An unlocked computer lets anyone act as you. |
| 2 | Multiple choice | An unknown person without a badge asks to follow you in. | Politely decline, direct them to reception or the visitor process, and report if they persist. | Do not confront; report through the approved channel. |
| 3 | Multiple choice | You find an unlabelled USB drive in the car park. | Do not connect it; hand it over or report it. | Unknown devices can run harmful software. |
| 4 | True/False | You can leave confidential printouts on a shared printer if you plan to return. | False | Unattended papers can be read or taken. |
| 5 | True/False | Report a lost badge or laptop immediately, even if it might turn up. | True | Prompt reporting prevents misuse. |

## Course B — Reporting Security Incidents

**Subtitle:** Spot it. Report it. Protect everyone.

**Learning objectives:**
- Recognize possible incidents.
- Explain why prompt reporting matters.
- Describe what makes a report useful.
- Respond safely after a suspicious action.
- Understand your role after reporting.

| # | Key | Lesson | Content |
| --- | --- | --- | --- |
| 1 | `what-is-a-security-incident` | What is a security incident? | Everyday definition and six examples (suspicious link, credentials entered, lost device, misdirected information, unexpected account activity, unknown device connected). Noticing versus confirming: employees report, they do not need proof. Example: an unexpected foreign sign-in alert. |
| 2 | `why-reporting-quickly-matters` | Why reporting quickly matters | Early reports let the team act, small signs matter, several reports can reveal a wider attack, waiting increases impact. Scenario: a fictional employee who entered her password on a fake file-sharing page; reporting in ten minutes versus ten days. Do not hide mistakes; use approved channels. No response times are promised. |
| 3 | `what-to-do-first` | What should you do first? | Safe first steps for a suspicious email, a clicked link, credentials or a code entered, an opened attachment, a lost or stolen device, information sent to the wrong person. **Do not try to fix it yourself:** no deleting evidence, cleaning tools, restarting, unplugging or switching off workplace systems unless IT or security instructs it. |
| 4 | `making-a-useful-report` | How to make a useful security report | What, when, which device, account or application, what you did, warnings seen. Example of a clear report. Never include passwords or codes; no confidential data in chat or unapproved channels; sensitive evidence only through authorized procedures. EWAGuard AI's Analyze Email, URL and File tools, and automatic incident records for HIGH and CRITICAL results visible under My Incidents. These may not detect every threat and do not replace official reporting. |
| 5 | `after-you-report` | What happens after you report? | Follow the authorized team's directions, answer follow-ups through approved channels, keep details need-to-know, do not investigate, keep following procedures, report anything new. **Clicked-link scenario:** a fictional employee clicks a "holiday schedule" link and shows good reporting behaviour in five steps. Five-point checklist: Notice, Stop, Report, Describe, Follow up. |

### Quiz (80% to pass, 3 attempts, 1 point each)

| # | Type | Question (summary) | Correct answer | Explanation |
| --- | --- | --- | --- | --- |
| 1 | Multiple choice | Which should be reported as a possible incident? | A sign-in alert for your account that you did not cause. | No proof is needed to report. |
| 2 | Multiple choice | You typed your password into a suspicious page. | Report immediately and follow instructions, including changing your password through a trusted route if procedures allow. | Fast reporting limits misuse. |
| 3 | Multiple choice | The most useful detail for a report? | Roughly when it happened and what you clicked, opened or entered. | Never include passwords or codes. |
| 4 | True/False | Wait until you are sure before reporting. | False | Confirmation is the security team's job. |
| 5 | True/False | If EWAGuard AI rates an email LOW, you need not report it even if still worried. | False | Automated analysis may miss threats and does not replace official reporting. |

## Provisioning

```bash
npm run training:provision -- --course physical-security --admin-email <administrator email>
npm run training:provision -- --course reporting-security-incidents --admin-email <administrator email>
npm run training:provision -- --course all --admin-email <administrator email>
```

The two new courses are registered in `backend/src/training/content/index.js`. The shared, development-only command keeps its existing behaviour:
- it refuses to run in production;
- it requires an active, MFA-enrolled `IT_SECURITY_ADMIN`;
- it records the `TRAINING_CREATED` and `COURSE_QUIZ_CREATED` audit entries;
- it detects existing courses by case-insensitive title, so it never creates duplicates;
- it never reviews, publishes, assigns, or touches progress, attempts or certificates.

**Local result:** each course was created once by `admin@ewa.bh`. Rerunning `--course all` reported "Already exists. Nothing was changed." for all five courses.

## Review, publication, assignment, progress and certificates

These steps are unchanged:
1. In **Training Programs** (`/admin/training`), preview the material and the Course quiz tab.
2. **Review** and **Publish** the course, then **Approve** and **Publish** the quiz.
3. **Assign** employees individually.

Employees start the course and acknowledge lessons in order. Progress is saved on the server and resumes on refresh. Once the reading is complete, the quiz becomes available and shows the passing score and remaining attempts. A failed attempt leaves the course in progress. A passing attempt completes it and issues a single certificate. Completions, quiz attempts and certificates appear in Awareness Analytics. `backend/tests/training-content.integration.test.js` checks all of this for each of the five courses, including that listing certificates does not issue a duplicate and that analytics filtered by program report the expected counts.

## Organizational items requiring approval before publication

The courses refer generically to the "approved reporting channel", "approved security channel", "approved visitor procedures", "approved storage and disposal methods" and "emergency procedures". No EWA contacts, phone numbers, badge rules, visitor steps, escalation paths or response times are stated. Confirm:
1. The reporting channel(s) employees should use for security, privacy and physical-security concerns, and that staff know them.
2. The visitor and access-badge procedures, including where people without a badge should be directed. The course says "reception or the visitor process".
3. The process for lost badges and devices, and for found USB drives.
4. Approved document storage and disposal methods.
5. Whether employees may change their own password after a suspected compromise. The course says "if your approved procedures allow it".
6. That emergency procedures take precedence over these courses where people are in danger.

## Known limitations

- The courses are text only. No browser visual verification has been performed yet.
- Section acknowledgement records completion of the workflow, not comprehension. The quiz is the comprehension check.
- The Windows key + L shortcut applies to Windows devices only. Other platforms are not covered.
