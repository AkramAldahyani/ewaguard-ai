# Training courses

## In short

EWAGuard AI comes with **seven beginner courses** for all employees. Each has
**five short lessons** (about 6 minutes of reading) and a **five-question quiz**
(**80% to pass, 3 attempts**, 1 point per question), about 9 minutes in total.

- All content was written by people and lives in `backend/src/training/content/` (one file per course, listed in `index.js`).
- All people, companies and websites in examples are fictional; web addresses use reserved example domains.
- The courses do **not** invent EWA contacts, phone numbers, procedures or legal details. They say "the approved reporting channel" or "approved tools" instead.
- They are created as **drafts** with `npm run training:provision -- --course all --admin-email <admin email>`. An administrator must review, publish and assign them (see [training and quizzes](training-and-quizzes.md)).

| # | Course | Topic | Content file |
| --- | --- | --- | --- |
| 1 | Phishing Awareness | `PHISHING` | `phishing-awareness.js` |
| 2 | Safe Browsing | `SAFE_BROWSING` | `safe-browsing.js` |
| 3 | Data Privacy | `INFORMATION_HANDLING` | `data-privacy.js` |
| 4 | Physical Security | `PHYSICAL_SECURITY` | `physical-security.js` |
| 5 | Reporting Security Incidents | `INCIDENT_REPORTING` | `reporting-security-incidents.js` |
| 6 | Secure Remote Work | `OTHER` | `secure-remote-work.js` |
| 7 | Responsible AI | `OTHER` | `responsible-ai.js` |

Data Privacy uses `INFORMATION_HANDLING` and the last two use `OTHER` because the
topic list has no privacy, remote-work or AI value. Adding new topics would need
coordinated backend, frontend and monthly-quiz changes.

---

## 1. Phishing Awareness: "Think before you click"

**Goal:** recognize phishing, avoid fake sign-in requests and report quickly.

| Lesson | Main points |
| --- | --- |
| What is phishing? | What attackers want (passwords, data, payments); channels beyond email; why one stolen password matters |
| Warning signs | Seven signs: urgency, unrequested password resets, odd senders, suspicious links, unexpected attachments, requests for passwords/codes or confidential data. How to find a link's real website name |
| Real-world scenario | "Layla" gets a fake "Microsoft 365 will be disabled today" email; the unsafe path vs the safe response |
| Protect yourself | Sign in only through trusted paths; verify via known contacts; never share codes or approve unrequested sign-ins; MFA helps but does not stop phishing alone |
| What should you do? | Actions after receiving, clicking, entering credentials or opening an attachment; EWAGuard analyzers help but do not replace reporting |

| # | Quiz question | Correct answer |
| --- | --- | --- |
| 1 | "HR Team" email demands bank details within one hour: strongest warning sign? | Sensitive request with a short, threatening deadline |
| 2 | "Microsoft 365 disabled today unless you verify" email: safest response? | Do not click; check the usual way; report |
| 3 | Real website in `https://portal.example.com.files-share.example/review`? | `files-share.example` |
| 4 | With MFA on, phishing cannot affect you. | False |
| 5 | Entered your password on a suspicious page: report even if nothing seems wrong. | True |

## 2. Safe Browsing: "Stay safe while exploring the web"

| Lesson | Main points |
| --- | --- |
| Browsing safely | Browser warnings; the padlock means "encrypted", not "trustworthy" |
| Dangerous websites | Look-alike names, fake sign-in, payment and verification pages, misleading pop-ups and fake security alerts |
| Downloads and attachments | Fake updates, risky extensions, "Enable content" documents; use only IT-approved software |
| QR codes and online tricks | Stickers over real QR codes, QR codes in emails, shortened links; verify independently |
| Safe browsing habits | Six-point checklist; the URL Analyzer helps but guarantees nothing; what to do after a mistake |

| # | Quiz question | Correct answer |
| --- | --- | --- |
| 1 | Search result imitating the payroll site asks for your password | Close it, use the known address or bookmark, report |
| 2 | Pop-up says your browser needs an update | Close it; rely on approved IT updates |
| 3 | Lobby QR sticker offers parking if you sign in with your work account | It asks for credentials after scanning a code that may cover the real one |
| 4 | A padlock means it is safe to enter your password. | False |
| 5 | After an unexpected link leads to a sign-in page, open the service yourself instead. | True |

## 3. Data Privacy: "Protecting personal and confidential information"

| Lesson | Main points |
| --- | --- |
| What is data privacy? | What personal information is (service requests, billing, HR records...) and why it matters |
| Recognizing sensitive information | Customer and employee records, ID documents, internal documents, passwords, operational data |
| Handling information safely | Authorized recipients only, share the minimum, approved storage and sharing, no personal cloud |
| Data privacy in Bahrain | The PDPL at awareness level only: protect data, use it for authorized purposes, report incidents. Not legal advice; refers to the DPO/legal team |
| Everyday privacy decisions | Misdirected documents, visible papers, work data in unapproved AI tools, personal messaging apps |

The PDPL lesson deliberately states **no** law number, articles, deadlines,
penalties or consent rules; a test enforces this.

| # | Quiz question | Correct answer |
| --- | --- | --- |
| 1 | Which is personal information? | A customer's name, account number and home address |
| 2 | Contractor asks for customer contacts at a personal email | Confirm need and authorization; share the minimum through an approved system |
| 3 | You emailed account details to the wrong external person | Report promptly through the approved channel |
| 4 | It is fine to paste a complaint with a name and account number into any public AI chatbot. | False |
| 5 | Report possible exposure of customer data even if unsure. | True |

## 4. Physical Security: "Protecting our workplace and information"

| Lesson | Main points |
| --- | --- |
| Why physical security matters | A propped door, an unlocked PC and a printed staff list exploited in five minutes |
| Lock your screen, protect your desk | Windows key + L; no passwords on sticky notes; put printouts away |
| Badges, visitors and tailgating | "Friendly" is not "authorized"; politely send people to reception; never confront |
| Devices and documents | Never plug in unknown USB drives; approved storage and disposal; report losses immediately |
| When something looks suspicious | Responses for strangers in restricted areas, lost badges or laptops, unattended papers; emergencies first |

| # | Quiz question | Correct answer |
| --- | --- | --- |
| 1 | Leaving your desk for five minutes | Lock the computer first |
| 2 | Someone without a badge asks to follow you in | Politely decline, direct to reception, report if they persist |
| 3 | You find an unlabelled USB drive in the car park | Do not connect it; hand it in or report it |
| 4 | Confidential printouts can wait on a shared printer. | False |
| 5 | Report a lost badge or laptop immediately. | True |

## 5. Reporting Security Incidents: "Spot it. Report it. Protect everyone."

| Lesson | Main points |
| --- | --- |
| What is a security incident? | Six everyday examples; you report, you don't need proof |
| Why reporting quickly matters | Ten minutes vs ten days after entering a password on a fake page; don't hide mistakes |
| What to do first | Safe first steps for common situations; **don't try to fix it yourself** |
| Making a useful report | What, when, which device/account, what you did; never include passwords; EWAGuard creates incidents for HIGH/CRITICAL results but does not replace reporting |
| After you report | Follow instructions, keep details need-to-know, don't investigate; Notice → Stop → Report → Describe → Follow up |

| # | Quiz question | Correct answer |
| --- | --- | --- |
| 1 | Which should be reported? | A sign-in alert you did not cause |
| 2 | You typed your password into a suspicious page | Report immediately and follow instructions |
| 3 | Most useful detail in a report | Roughly when it happened and what you clicked, opened or entered |
| 4 | Wait until you are sure before reporting. | False |
| 5 | If EWAGuard rates an email LOW you need not report it even if still worried. | False |

## 6. Secure Remote Work: "Stay secure wherever you work"

| Lesson | Main points |
| --- | --- |
| Why remote security matters | Shoulder-surfing, overheard calls, unattended devices; a café scenario |
| Protecting work devices | Lock screens, never leave devices, approved updates and MFA, no sharing with family |
| Wi-Fi and networks | Fake hotspots; a network name is not proof; approved remote access; a VPN does not make fake sites safe |
| Protecting information remotely | Video backgrounds, printed papers, no personal email or cloud unless allowed |
| Remote work checklist | Lost laptop, unusual sign-in, requests for codes, suspected exposure: report wherever you are |

| # | Quiz question | Correct answer |
| --- | --- | --- |
| 1 | Collecting your café order: your laptop? | Lock it and take it with you |
| 2 | Two near-identical open hotel networks | Ask hotel staff, then use the approved remote-access method |
| 3 | Working on a confidential document at home | Use approved tools or ask IT |
| 4 | On a VPN it is safe to enter your password on any website. | False |
| 5 | Report a laptop lost while travelling immediately. | True |

## 7. Responsible AI: "Use AI wisely. Protect information."

| Lesson | Main points |
| --- | --- |
| What is AI and how can it help? | Useful everyday tasks; AI can be wrong |
| Protecting data when using AI | Never enter passwords, codes, personal or confidential data into unapproved tools; "ask before you paste" |
| AI is not always correct | Invented facts and references, confident tone; verify important decisions |
| AI-powered scams | AI phishing, voice and video impersonation; verify through a known channel |
| Using EWAGuard AI responsibly | Only what the app really does (see below) and a five-point checklist |

Lesson 5 describes only verified behavior: the assistant sends messages and
recent context to OpenAI; analyzers show LOW–CRITICAL with reasons; the URL
analyzer never visits the site; the file analyzer sends only a SHA-256 hash;
password tools run in the browser; HIGH/CRITICAL results create incidents. **If
any of this changes, the lesson must be updated** (as a new course, because
published content is read-only).

| # | Quiz question | Correct answer |
| --- | --- | --- |
| 1 | Safe to enter into an unapproved public chatbot? | A general question like "What is MFA?" |
| 2 | AI quotes a policy number you've never heard of | Verify with approved policies or IT/security |
| 3 | A voice like your director's asks for confidential figures on a personal number | Verify through a known independent channel and report |
| 4 | A LOW-risk link from EWAGuard AI is guaranteed safe. | False |
| 5 | Analyzing an email in EWAGuard AI does not replace official reporting. | True |

---

## To confirm with the organization before publishing

- The approved reporting channel(s) for security, privacy and physical-security concerns, and that staff know them.
- Visitor and badge procedures, lost-device and found-USB processes, approved storage and disposal.
- Approved storage, collaboration, remote-access (VPN) and AI tools, and whether personal devices, cloud or email are allowed.
- Whether employees may change their own password after a suspected compromise.
- That the PDPL lesson wording is acceptable (DPO/legal review).
- Whether Ask EWAGuard AI is approved for staff use, given its OpenAI processing.
- Whether the chosen topics (`INFORMATION_HANDLING`, `OTHER`) are acceptable.

## Limitations

- Text only: no video or interactive simulations.
- The Windows key + L tip covers Windows devices only.
- Reading acknowledgements show the steps were done, not understanding; the quiz checks understanding.

## Tests

`backend/tests/training-content.integration.test.js` runs the full flow for all
seven courses (provision, publish, assign, read, pass, certificate, analytics)
and checks that no content invents contacts, legal details or guarantees.
