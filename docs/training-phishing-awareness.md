# Training Content Phase TC1 — Phishing Awareness

**Title:** Phishing Awareness · **Subtitle:** Think before you click · **Topic:** `PHISHING` · **Audience:** all employees · **Level:** beginner · **Duration:** 9 minutes (about 6 minutes reading + 2–3 minutes quiz)

**Objective:** help non-technical employees recognize phishing, avoid fake sign-in requests, and report suspicious activity promptly through approved channels.

The canonical, full lesson text and quiz live in `backend/src/training/content/phishing-awareness.js`. The content is human-authored (`origin: HUMAN`), uses only reserved example domains (`example.com`, `example.net`, `*.example`), and does not invent EWA policies, contacts or phone numbers.

## Learning outcomes

1. Explain phishing in simple terms.
2. Recognize common signs of suspicious messages.
3. Identify suspicious links and fake login requests.
4. Respond safely to potential phishing attempts.
5. Know when and how to report suspicious activity using approved channels.

## Lessons (five sections, acknowledged in order)

| # | Key | Title | Content |
| --- | --- | --- | --- |
| 1 | `what-is-phishing` | What is phishing? | Plain definition; what attackers want (passwords, attachments, data, payments); channels beyond email; example "update your account within 2 hours" email; why one stolen password matters; why everyone is a target. |
| 2 | `warning-signs` | Recognizing phishing warning signs | Seven signs: urgency/threats, unrequested password resets, unusual sender addresses, suspicious links, unexpected attachments, requests for passwords/codes, requests for confidential information. Professional design and spelling prove nothing. How to preview a link on desktop and phone and find the real website name. A four-question check. |
| 3 | `real-world-scenario` | Real-world scenario | Fictional employee Layla receives a "Microsoft 365 account will be disabled today" email from `security-alert@m365-account.example` linking to `login.microsoftonline.com-verify.example.com`. Covers why it is convincing, the warning signs, the unsafe path (password and code captured), and the safer response (pause, verify through the usual path, report). |
| 4 | `protect-yourself` | How to protect yourself | Do/don't lists: sign in only via trusted paths, verify through known contact methods, check link destinations, be cautious with attachments, follow approved procedures; never share passwords or codes or approve unrequested sign-ins. MFA helps but does not stop phishing on its own. |
| 5 | `what-to-do` | What should you do? | Actions for: a suspicious message received, a link clicked, credentials or a code entered, an attachment opened. Optional use of the EWAGuard AI Email and URL Analyzers, which do not replace official reporting. Encourages reporting, then gives a five-point recap and points to the quiz. |

Each lesson ends with a highlighted key takeaway.

### Lesson formatting

Bodies are still plain text and are validated by the existing course contract (no HTML, no angle brackets). The reader now recognizes a few plain-text conventions and renders them as React text nodes, never as HTML:

- a blank line starts a new paragraph
- lines starting with `- ` become bullets, and lines starting with `1. ` become numbered steps
- a short line ending in `:` directly above a list becomes the list heading
- paragraphs starting with `Key takeaway:`, `Example:`, `Watch out:` or `Tip:` become highlighted callouts

Text that uses none of these conventions displays as ordinary paragraphs, so existing courses still render.

## Quiz (existing course-quiz engine)

Passing score **80%** (4 of 5), **3 attempts** (the existing authoring defaults), 1 point per question. Answers are scored on the server. Correct answers and explanations are only returned after submission.

| # | Type | Question (summary) | Correct answer | Explanation |
| --- | --- | --- | --- | --- |
| 1 | Multiple choice | "HR Team" email demands bank details within one hour. Strongest warning sign? | It demands sensitive information within a short, threatening deadline. | Urgency plus a sensitive request is a classic sign; branding proves nothing. |
| 2 | Multiple choice | Microsoft 365 "disabled today unless you verify your password" email. Safest response? | Do not click; check your account the usual way and report through the approved channel. | Replying or testing the link exposes you. |
| 3 | Multiple choice | Real website for `https://portal.example.com.files-share.example/review`? | `files-share.example` | The real name is just before the first single "/". |
| 4 | True/False | With MFA on, you cannot be affected by phishing. | False | Fake pages can capture codes; attackers send repeated approval requests. |
| 5 | True/False | If you entered your password on a suspicious page, report immediately even if nothing seems wrong. | True | Stolen passwords are used quickly; prompt reporting limits harm. |

## Provisioning

`npm run training:provision:phishing -- --admin-email <administrator email>` (development only; refuses `NODE_ENV=production`).

- The command calls the existing `createTrainingService().create` and `createCourseQuizService().save` services, so validation, transactions and audit records (`TRAINING_CREATED`, `COURSE_QUIZ_CREATED`) match the administrator API.
- The named account must be an active `IT_SECURITY_ADMIN` with MFA enrolled. It is recorded as the author.
- It is idempotent. If a `PHISHING` program titled "Phishing Awareness" already exists, the command changes nothing, unless that program is missing its quiz, in which case only the draft quiz is added. If more than one matching program exists, it stops without changes.
- It only creates a **draft** course and a **draft** quiz. It never reviews, publishes, assigns, edits existing content, or touches progress, attempts or certificates.

In the local development database, the draft was created once by `admin@ewa.bh`. A second run reported "already exists" and changed nothing.

Without shell access, an administrator can enter the same content manually in the training editor.

## Administrator workflow

1. Sign in with MFA and open **Training Programs** (`/admin/training`). Open "Phishing Awareness" (status Draft).
2. **Preview** the material and the **Course quiz** tab (answer-key preview). Edit if needed. Any edit clears the review.
3. **Review**, then **Publish** the program.
4. In the Course quiz tab, **Approve**, then **Publish** the quiz. A quiz can only be published after its program is published.
5. **Assign** employees individually from the program's assignment panel. There is no automatic or bulk assignment.

Published content becomes read-only. To change it later, create a new program.

## Employee experience

Employees open **My Training**, then the course. They press **Start this course** and read each lesson, selecting **I have read this section** in order. Progress is saved on the server, and after a refresh they resume at the first unacknowledged lesson. Once all five lessons are acknowledged, the material is complete, but the course stays *In progress* until the quiz is passed. The quiz panel shows the question count, the passing score and the remaining attempts. A passing submission marks the course **Completed** and issues a certificate under the existing rules. Failed attempts do not.

## Awareness Analytics

After publication and assignment, the existing Awareness Analytics page includes this course in its assignment counts, completion rates, course-quiz average scores and pass rates, and certificates issued. There are no course-specific analytics changes.

## Manual tasks remaining

- An administrator must review and publish the course and quiz, then assign employees.
- Before publication, an administrator should confirm that the organization's approved reporting channel is communicated to staff. The course refers to it generically.
- Authenticated browser verification at desktop and mobile widths has not been performed.
