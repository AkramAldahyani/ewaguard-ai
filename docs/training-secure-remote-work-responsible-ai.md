# Training Content Phase TC4 — Secure Remote Work and Responsible AI

TC4 adds the final two courses of the seven-course plan. The existing course and quiz engines, section progress tracking, assignments, certificates, Awareness Analytics, the plain-text lesson renderer and the shared provisioning command are reused unchanged (see the TC1–TC3 documents).

**Status:** both courses and their quizzes exist as **drafts** in the local development database. Neither is published or assigned. There are no schema or migration changes.

| Course | Topic | Program ID (local dev DB) | Duration | Source |
| --- | --- | --- | --- | --- |
| Secure Remote Work | `OTHER` | `abc81a6d-8045-4c01-ad20-20915aef6237` | 9 min (about 6–7 reading + 3 quiz) | `backend/src/training/content/secure-remote-work.js` |
| Responsible AI | `OTHER` | `c9da1468-55ee-45ee-9229-9c7af87928e0` | 9 min (about 6–7 reading + 3 quiz) | `backend/src/training/content/responsible-ai.js` |

**Topic choice:** the existing topics have no remote-work or AI value, so both courses use `OTHER`, the least misleading existing value.

Alternatives:
- `INFORMATION_HANDLING` for either course, which Data Privacy already uses.
- New topic values, such as `REMOTE_WORK` or `RESPONSIBLE_AI`. These would need a coordinated change to the training topic list, the frontend topic list, monthly-quiz topic tagging and possibly a migration. That decision belongs to the project owner and was not made in TC4.

The source files hold the full lesson text. Every lesson uses short paragraphs, lists, Example, Watch out and Tip callouts, and a Key takeaway. All people are fictional.

## Course A — Secure Remote Work

**Subtitle:** Stay secure wherever you work. The model has no subtitle field, so it opens the description.

**Learning outcomes:**
- Identify remote-working risks.
- Secure laptops and mobile devices.
- Use networks and remote access safely.
- Protect confidential information outside the workplace.
- Respond to lost devices and suspicious activity.

| # | Key | Lesson | Content |
| --- | --- | --- | --- |
| 1 | `why-remote-security-matters` | Why remote work security matters | Shoulder-surfing, overheard calls, unattended devices, unfamiliar networks, shortcuts; approved remote-access procedures. **Café scenario:** a confidential report visible to the next table; work on non-sensitive tasks and take calls privately. |
| 2 | `protecting-work-devices` | Protecting your work devices | Lock when stepping away (Windows key + L on Windows; other devices have their own lock), never unattended, strong sign-in and approved MFA, approved updates and software only, no sharing devices or accounts, report losses. Family-laptop example and a four-question checklist. |
| 3 | `wifi-and-networks` | Staying safe on Wi-Fi and networks | Fake hotspots; a name is not proof; confirm with a trusted source; approved remote access, using a VPN or secure connection where the organization requires one; an approved hotspot where allowed; never bypass controls. **Two-similar-networks scenario:** ask the front desk, do not guess. Watch out: a VPN does not make a harmful site safe, stop credential theft or clean an infected device. |
| 4 | `protecting-information-remotely` | Protecting confidential information | Public conversations, surroundings and video backgrounds, printed papers, no personal cloud or devices unless policy allows, approved collaboration tools, check recipients. **Personal-email scenario:** use approved remote access or collaboration tools, or ask IT. |
| 5 | `remote-work-checklist` | Remote work safety checklist | What to do about a lost laptop, an unusual sign-in, a message asking for remote-access credentials or codes, and suspected exposure. Report wherever you are. Five-point checklist. |

### Quiz (80% to pass, 3 attempts, 1 point each)

| # | Type | Question (summary) | Correct answer | Explanation |
| --- | --- | --- | --- | --- |
| 1 | Multiple choice | Collecting your café order: what about your laptop? | Lock the screen and take it with you. | Never leave devices unattended in public. |
| 2 | Multiple choice | Two near-identical open hotel networks. | Confirm with hotel staff, then use the approved remote-access method. | A name is not proof. |
| 3 | Multiple choice | Working on a confidential document at home. | Use approved remote-access or collaboration tools, or ask IT. | Personal email and cloud storage leave protected systems. |
| 4 | True/False | On an approved VPN, it is safe to enter your password on any website. | False | A VPN protects the connection, not you from fake sites. |
| 5 | True/False | Report a laptop lost while travelling immediately, not on return. | True | Prompt reporting prevents misuse. |

## Course B — Responsible AI

**Subtitle:** Use AI wisely. Protect information.

**Learning outcomes:**
- Explain what AI can and cannot reliably do.
- Recognize the risks of sharing data with AI.
- Verify AI output.
- Recognize AI-assisted scams.
- Use EWAGuard AI within its documented limits.

| # | Key | Lesson | Content |
| --- | --- | --- | --- |
| 1 | `what-is-ai` | What is AI and how can it help? | Everyday explanation; helpful uses (explanations, non-confidential summaries, writing, security terms, general tips). AI can be wrong. Example: an employee asks what phishing means. |
| 2 | `protecting-data-with-ai` | Protecting data when using AI | Input may be processed and kept by the provider depending on the service. Never enter passwords, MFA codes, API keys, personal data, customer records, confidential documents, restricted operational information or incident evidence unless the tool and use are approved. **Customer-spreadsheet scenario:** approved tools only, anonymize where allowed, or write it yourself. Ask-before-you-paste tip. |
| 3 | `ai-not-always-correct` | AI is helpful, but not always correct | Incorrect answers, missing context, invented details and references, confident tone. **Scenario:** a chatbot wrongly says "Enable content" is safe; the employee follows training and reports. Verify important decisions with trusted organizational resources. Four-question verification checklist. |
| 4 | `ai-powered-scams` | AI-powered scams and social engineering | AI-made phishing, messages, impersonation, voice, images and video, urgent requests. You may not be able to detect AI media by eye or ear. **Voice-message scenario:** a "senior manager" wants confidential figures sent to a personal number; verify through a known independent channel and report. |
| 5 | `using-ewaguard-ai-responsibly` | Using EWAGuard AI responsibly | Implemented capabilities only (see below). How information is handled, limits, and a five-point Responsible AI checklist. |

**Lesson 5 accuracy basis.** The lesson describes only verified behaviour:
- **Ask EWAGuard AI** answers general cybersecurity questions and explains analysis results. It sends messages and recent context to OpenAI, and the provider may retain data for abuse prevention. Conversations are kept under the retention policy. Source: the chat privacy notice in `backend/src/ai/chat-policy.js`.
- **Analyze Email, URL and File** show LOW, MEDIUM, HIGH or CRITICAL with reasons and suggested next steps.
- The **URL analyzer** never visits the submitted site but may query external reputation. Source: `docs/url-analyzer.md`.
- The **file analyzer** sends only a SHA-256 hash, not the file. Source: `shared/file-policy.js`.
- **Password Security** runs in the browser and sends nothing to the server. Source: `docs/password-security.md`.
- **HIGH and CRITICAL results** create an incident for review that the employee can follow under My Incidents. Source: `docs/incident-engine.md`.

The lesson makes no confidentiality guarantee and does not mention PDPL or company-policy document retrieval. A test enforces all of this.

### Quiz (80% to pass, 3 attempts, 1 point each)

| # | Type | Question (summary) | Correct answer | Explanation |
| --- | --- | --- | --- | --- |
| 1 | Multiple choice | What is safe to enter into an unapproved public chatbot? | A general question such as "What is multi-factor authentication?" | No passwords, customer data or confidential documents. |
| 2 | Multiple choice | An AI quotes a security rule and a policy number you have never heard of. | Verify with approved policies or IT/security before acting. | AI can invent rules and references. |
| 3 | Multiple choice | A voice that sounds like your director asks for confidential figures on a personal number. | Verify through a known independent channel and report. | Voices can be imitated. |
| 4 | True/False | A LOW-risk link from EWAGuard AI is guaranteed safe. | False | Automated analysis can miss threats. |
| 5 | True/False | Analyzing an email in EWAGuard AI does not replace official reporting. | True | Official reporting comes first. |

## Provisioning

```bash
npm run training:provision -- --course secure-remote-work --admin-email <administrator email>
npm run training:provision -- --course responsible-ai --admin-email <administrator email>
npm run training:provision -- --course all --admin-email <administrator email>   # all seven courses
```

The shared, development-only command keeps its existing behaviour:
- it refuses to run in production;
- it requires an active, MFA-enrolled `IT_SECURITY_ADMIN`;
- it records the `TRAINING_CREATED` and `COURSE_QUIZ_CREATED` audit entries;
- it detects existing courses by case-insensitive title, so it never creates duplicates;
- it never reviews, publishes, assigns, or touches progress, attempts or certificates.

**Local result:** each course was created once by `admin@ewa.bh`. Rerunning `--course all` reported "Already exists. Nothing was changed." for all seven courses.

## Review, publication, assignment, progress and certificates

These steps are unchanged:
1. Open **Training Programs** (`/admin/training`).
2. Preview the material and the Course quiz tab.
3. **Review** and **Publish** the course, then **Approve** and **Publish** the quiz.
4. **Assign** employees individually.

Employees acknowledge lessons in order. Progress is saved on the server and resumes after a refresh. Once the reading is complete, the quiz shows the passing score and remaining attempts. A failed attempt leaves the course in progress. A pass completes it and issues one certificate. Activity appears in Awareness Analytics. `backend/tests/training-content.integration.test.js` checks this for all seven courses.

## Organizational items requiring approval before publication

- The approved remote-access method, and whether and when a VPN or other secure connection is required. The course states neither a product nor a rule.
- Whether approved mobile hotspots and privacy screen filters are available.
- Which personal devices, personal cloud storage or personal email, if any, policy allows.
- The approved collaboration and file-sharing applications.
- **Which AI tools are approved for work use**, and what data may be entered into them. The course says only "approved tools".
- Whether Ask EWAGuard AI is itself approved for employee use, given its external OpenAI processing. Lesson 5 states this processing plainly.
- The reporting channel(s) for lost devices, suspicious sign-ins, credential requests and exposure.
- Whether `OTHER` is acceptable as the topic for both courses.

## Known limitations

- Text only. No browser visual verification has been performed.
- Lesson acknowledgement does not prove comprehension. The quiz is the check.
- Lesson 5's description of EWAGuard AI reflects the implementation at TC4. If the analyzers, chat processing or retention behaviour change, the lesson must be revised. Because published content is read-only, that means a new program.
