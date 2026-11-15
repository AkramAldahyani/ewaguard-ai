// Training Content Phase TC3: human-authored Reporting Security Incidents course.
// Plain text using the lesson conventions described in phishing-awareness.js.
// All people are fictional. No organization-specific reporting channel, contact, escalation
// procedure, response time or containment step is assumed. EWAGuard AI capabilities are
// described as implemented: email, URL and file analysis with deterministic risk levels, and
// automatic incident records for HIGH and CRITICAL results that employees can follow in My Incidents.

export const reportingSecurityIncidentsCourse = {
  title: 'Reporting Security Incidents',
  description:
    'Spot it. Report it. Protect everyone. Learn how to recognize a possible security incident, why reporting quickly matters, what to do first, how to make a useful report, and what to expect after you report.',
  topic: 'INCIDENT_REPORTING',
  learningObjectives: [
    'Recognize situations that may indicate a security incident.',
    'Explain why prompt reporting matters.',
    'Describe the information that makes a report useful.',
    'Respond safely after a suspicious action.',
    'Understand your role after reporting an incident.',
  ],
  estimatedMinutes: 9,
  requiresQuiz: true,
  content: {
    version: 1,
    sections: [
      {
        key: 'what-is-a-security-incident',
        title: 'Lesson 1: What is a security incident?',
        body: `A security incident is anything that may put the organization's information, accounts, devices or systems at risk. It can start with a single click, a lost bag or an email sent to the wrong person.

Possible incidents include:
- clicking a link in a suspicious message
- typing your password or a verification code into an unexpected sign-in page
- losing a work laptop, phone, badge or storage device
- accidentally sending sensitive information to the wrong person
- noticing account activity you did not do, such as sign-in alerts or sent emails you did not write
- finding an unknown device plugged into a work computer or other equipment

Tip: Suspicious is enough
There is a difference between noticing something suspicious and confirming a security breach. Confirming a breach is the security team's job. Your job is to notice and report.

Example: Is this an incident?
Omar, a fictional employee, gets a text saying "New sign-in to your work account from another country." He did not sign in from abroad. He does not know whether it is a real attack, a system glitch or a fake text. He does not need to know. It is worth reporting.

Key takeaway: You do not have to prove an incident before reporting it. If something seems wrong, report it.`,
      },
      {
        key: 'why-reporting-quickly-matters',
        title: 'Lesson 2: Why reporting quickly matters',
        body: `Security incidents are often like a small leak: easy to deal with early, much harder once the damage spreads.

Why speed helps:
- Early reports give the security team the chance to act before an attacker can use stolen access.
- Small warning signs can be the first visible part of something bigger.
- Several small reports from different people can reveal a wider attack.
- Waiting often makes the impact larger and harder to fix.

Example: Ten minutes or ten days
Reem, a fictional employee, enters her password into what she thinks is a file-sharing page. A moment later she realizes the website address was strange.
If she reports it straight away, the security team can take action on her account through approved procedures while the attacker may not have used it yet.
If she stays quiet and hopes for the best, an attacker could use her account for days, reading email and sending convincing messages to her colleagues.

Watch out: Do not hide mistakes
Everyone makes mistakes, and attackers design their tricks to catch careful people. Hiding a mistake helps only the attacker. Reporting it quickly is the responsible, professional choice.

Always report through your organization's approved reporting channels, so the right people receive the information.

Key takeaway: Report early, even if you are unsure or embarrassed. Fast reporting limits harm.`,
      },
      {
        key: 'what-to-do-first',
        title: 'Lesson 3: What should you do first?',
        body: `When something goes wrong, the first few minutes matter. These are safe general first steps. Always follow instructions from your IT or security team, and your organization's approved procedures, where they say something different.

If you received a suspicious email:
- Do not click links, open attachments or reply.
- Report it through the approved channel.

If you clicked a suspicious link:
- Close the page without entering any information.
- Report it promptly, including roughly when it happened.

If you entered a password or verification code on a suspicious page:
- Report it immediately. This is urgent.
- Change your password from a trusted device by going to the service directly, if your approved procedures allow it.
- Tell the security team whether you also entered a code or approved a sign-in request.

If you opened an unexpected attachment:
- Close it, and do not enable editing, content or macros.
- Report it promptly and follow the instructions you are given.

If a work device is lost or stolen:
- Report it immediately, with when and where you last had it.

If you sent confidential information to the wrong person:
- Report it promptly, even if you have also asked the recipient to delete it.

Watch out: Do not try to fix it yourself
Do not delete evidence, run cleaning tools, restart, unplug or switch off workplace systems or equipment unless the IT or security team tells you to. Well-meant actions can disrupt operations or destroy information the team needs.

Key takeaway: Stop, do not make it worse, report promptly, and follow the security team's instructions.`,
      },
      {
        key: 'making-a-useful-report',
        title: 'Lesson 4: How to make a useful security report',
        body: `A good report helps the security team understand what happened quickly. You do not need technical knowledge. Describe what you saw and did in plain words.

Useful details to include:
- What happened, in a sentence or two.
- Roughly when it happened.
- Which device, account or application was involved, such as your work laptop, your email or a particular website.
- What you did: clicked, downloaded, opened, entered information or approved a request.
- Any warning messages or unusual behaviour you noticed.

Example: A clear report
"At about 10:15 today I clicked a link in an email that claimed to be from a delivery company. It opened a sign-in page on my work laptop. I did not enter my password. I closed the page straight away. The sender address looked unusual."

Watch out: Protect sensitive information in your report
Never include your password or verification codes in a report. Do not copy confidential documents, customer data or other private information into chat fields, unapproved messaging apps or general forms. If the security team needs sensitive evidence, they will tell you how to provide it through authorized procedures.

Tip: How EWAGuard AI can help
- Analyze Email, Analyze URL and Analyze File check a suspicious email, link or permitted file with the available security checks and show a risk level with the reasons behind it.
- When an analysis result is HIGH or CRITICAL, EWAGuard AI records an incident for review by the security team, and you can follow its status under My Incidents.
These tools help you and the security team, but they may not detect every threat, and a low result does not mean something is safe. They do not replace official incident reporting. If you are worried, report it through the approved channel as well.

Key takeaway: Say what happened, when, what was involved and what you did. Keep passwords and confidential data out of your report.`,
      },
      {
        key: 'after-you-report',
        title: 'Lesson 5: What happens after you report?',
        body: `Reporting is the most important step, but your role does not end there.

After you report:
- Follow directions from the authorized security team.
- Answer follow-up questions through approved channels.
- Avoid sharing incident details with colleagues who do not need to know.
- Do not investigate suspicious systems, messages or devices yourself.
- Keep following normal security procedures.
- Report anything new that you notice, such as more strange emails or sign-in alerts.

Example: Doing it right
Khalid, a fictional employee, clicks a link in a message about an "updated holiday schedule". A sign-in page appears that does not look quite right.
1. He stops and closes the page without typing anything.
2. He reports it through the approved channel with the time, the message subject and what he clicked.
3. He does not forward the message to colleagues to ask what they think.
4. The security team asks whether he entered any details. He answers promptly and follows their instructions.
5. The next day he receives a similar message. He reports that too.

Your five-point reporting checklist:
1. Notice: if something seems wrong, treat it as worth reporting.
2. Stop: do not click, open, enter or try to fix anything more.
3. Report: use the approved channel promptly, without waiting for proof.
4. Describe: what happened, when, what was involved and what you did.
5. Follow up: follow instructions, keep details private and report anything new.

Key takeaway: Spot it. Report it. Protect everyone.

Next, complete the short five-question quiz below to finish the course.`,
      },
    ],
  },
};

export const reportingSecurityIncidentsQuiz = {
  title: 'Reporting Security Incidents quiz',
  passingPercent: 80,
  maxAttempts: 3,
  questions: [
    {
      type: 'MULTIPLE_CHOICE',
      points: 1,
      text: 'Which of these situations should be reported as a possible security incident?',
      explanation:
        'A sign-in alert you did not cause may indicate someone else is using your account. You do not need to confirm it is an attack before reporting.',
      options: [
        { text: 'You receive a sign-in alert for your work account that you did not cause.', isCorrect: true },
        { text: 'Your scheduled software update finishes normally.', isCorrect: false },
        { text: 'A colleague sends you the meeting agenda you asked for.', isCorrect: false },
        { text: 'You sign in to your work email as usual from your office computer.', isCorrect: false },
      ],
    },
    {
      type: 'MULTIPLE_CHOICE',
      points: 1,
      text: 'You realize you have just typed your work password into a suspicious sign-in page. What should you do?',
      explanation:
        'Report immediately through the approved channel. Change your password from a trusted device if your procedures allow it, and tell the security team exactly what you entered.',
      options: [
        { text: 'Wait a few days to see whether anything unusual happens.', isCorrect: false },
        {
          text: "Report it immediately and follow the security team's instructions, including changing your password through a trusted route if procedures allow.",
          isCorrect: true,
        },
        { text: 'Delete your browser history so nobody can see the page.', isCorrect: false },
        { text: 'Ask colleagues in a group chat whether they have seen the same page.', isCorrect: false },
      ],
    },
    {
      type: 'MULTIPLE_CHOICE',
      points: 1,
      text: 'Which detail is most useful to include in a security report?',
      explanation:
        'Describe what happened, when, what was involved and what you did. Never include your password or verification codes in a report.',
      options: [
        { text: 'Your password, so the team can check your account.', isCorrect: false },
        { text: 'Roughly when it happened and what you clicked, opened or entered.', isCorrect: true },
        { text: 'A copy of every confidential file on your laptop.', isCorrect: false },
        { text: 'Your guess about who the attacker is.', isCorrect: false },
      ],
    },
    {
      type: 'TRUE_FALSE',
      points: 1,
      text: 'True or false: You should wait until you are sure a security incident has happened before reporting it.',
      explanation:
        "False. Report suspicious activity promptly. Confirming an incident is the security team's job, and early reports help limit harm.",
      options: [
        { text: 'True', isCorrect: false },
        { text: 'False', isCorrect: true },
      ],
    },
    {
      type: 'TRUE_FALSE',
      points: 1,
      text: 'True or false: If EWAGuard AI rates a suspicious email as LOW risk, you do not need to report it even if you are still worried.',
      explanation:
        'False. Automated analysis may not detect every threat and does not replace official reporting. If you are worried, report it through the approved channel.',
      options: [
        { text: 'True', isCorrect: false },
        { text: 'False', isCorrect: true },
      ],
    },
  ],
};
