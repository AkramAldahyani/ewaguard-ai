// Training Content Phase TC1: human-authored Phishing Awareness course.
// Bodies are plain text validated by courseInput(). The employee reader recognizes a few
// plain-text conventions (blank-line paragraphs, "- " bullets, "1. " steps, and
// "Key takeaway:", "Example:", "Watch out:" or "Tip:" callouts) and renders them as React text.
// All addresses use reserved example domains. No organization-specific policy or contact is assumed.

export const phishingAwarenessCourse = {
  title: 'Phishing Awareness',
  description:
    'Think before you click. Learn how to recognize suspicious emails and messages, identify common phishing warning signs, protect your accounts, and respond safely when you encounter a possible phishing attempt.',
  topic: 'PHISHING',
  learningObjectives: [
    'Explain phishing in simple terms.',
    'Recognize common signs of suspicious messages.',
    'Identify suspicious links and fake login requests.',
    'Respond safely to potential phishing attempts.',
    'Know when and how to report suspicious activity using approved channels.',
  ],
  estimatedMinutes: 9,
  requiresQuiz: true,
  content: {
    version: 1,
    sections: [
      {
        key: 'what-is-phishing',
        title: 'Lesson 1: What is phishing?',
        body: `Phishing is a trick. A criminal sends a fake message that pretends to come from someone you trust, such as a bank, a delivery company, an IT service desk, a manager or a colleague.

The goal is to get you to do something that helps the attacker:
- type your password into a fake sign-in page
- open a harmful attachment
- share confidential or personal information
- send money or approve a payment

Phishing usually arrives by email, but the same trick also appears in text messages, phone calls, chat apps and social media.

Example: An unexpected email
From: IT Service Desk (it-support@example.com)
Subject: Action required: update your account today
"Our records show your account details are out of date. Update them within 2 hours using the link below, or your access will be suspended."

The message looks official. But you were not expecting it, it pushes you to hurry, and it wants you to click a link and sign in. Those are the first clues.

Why do criminals do this? Tricking one person is often easier than breaking into a system. A single stolen password can give an attacker access to email, files and shared systems, and a way to send convincing messages to everyone you work with.

That is why everyone can be a target. You do not need to work in IT or finance. Attackers often send the same message to many people and wait for one person to respond.

Key takeaway: Phishing is a fake message designed to make you act quickly. If a message is unexpected and asks you to click, sign in, open, pay or share, stop and check first.`,
      },
      {
        key: 'warning-signs',
        title: 'Lesson 2: Recognizing phishing warning signs',
        body: `Phishing messages often share the same warning signs. One sign alone does not prove a message is fake, but each one is a good reason to slow down.

Seven common warning signs:
- Urgency or threats: "Your mailbox will be deleted today" or "Final notice". Pressure is meant to stop you from thinking.
- A password reset you did not ask for: a message telling you to reset, confirm or re-enter your password when you did nothing to trigger it.
- An unusual sender address: the display name says "IT Support", but the actual address is something like helpdesk-team@mail.example.net. Or a colleague's name appears with a personal email address.
- Suspicious links: the text says one thing, but the real destination is a different or misspelled website.
- Unexpected attachments: invoices, "shared documents", voicemails or delivery notes you were not expecting, especially files that ask you to enable editing or content.
- Requests for passwords or verification codes: a genuine service desk will not ask you to send your password or the code from your authenticator app or text message.
- Requests for confidential information: staff lists, customer records, financial details or internal documents requested without a clear, verified reason.

Watch out: Looking professional proves nothing
Criminals can copy logos, colours, signatures and layouts in minutes. Many phishing emails have perfect spelling and grammar. A message can look completely genuine and still be fake. Judge the request, not the design.

How to check a link without opening it:
- On a computer, rest your mouse pointer over the link and read the address that appears, usually near the bottom of the window.
- On a phone, press and hold the link to preview the address. Do not tap it.
- Find the real website name: it is the part just before the first single "/". In https://example.com.account-check.example/login the real website is account-check.example, not example.com.

Tip: The four-question check
Before you act on any unexpected message, ask yourself:
1. Do I recognize the real sender address, not just the name?
2. Was I expecting this message?
3. Is it rushing me, threatening me or offering something too good to be true?
4. Is it asking for a password, a code, money or confidential information?
If any answer worries you, do not click. Verify the request or report it.

Key takeaway: Slow down when a message is unexpected, urgent or asks for something sensitive. Check the sender and the real link destination before you act.`,
      },
      {
        key: 'real-world-scenario',
        title: 'Lesson 3: Real-world scenario',
        body: `Meet Layla, a fictional employee. It is 4:45 pm on a busy Thursday, and she is trying to finish a report before the weekend. A new email arrives.

Example: The email Layla receives
From: Microsoft 365 Security Team (security-alert@m365-account.example)
Subject: Your account will be disabled today
"We detected unusual sign-in activity on your Microsoft 365 account. To protect your mailbox, your account will be disabled at 6:00 pm today unless you verify your password."
Button: Verify my account
Link destination: https://login.microsoftonline.com-verify.example.com/secure

Why it seems convincing:
- It uses familiar Microsoft branding and a security theme, so it sounds protective.
- It arrives late in the day, when Layla is busy and wants to avoid problems.
- The link begins with "login.microsoftonline.com", which looks right at a quick glance.
- Losing access to email before the weekend feels like a real risk.

The warning signs:
- The sender's domain, m365-account.example, is not a Microsoft address and not her organization's address.
- It sets a tight deadline and threatens to disable her account.
- It asks her to "verify your password" through a link.
- The real website in the link is example.com. Everything before it is just decoration.
- Layla did nothing that should have triggered this message.

Watch out: The unsafe action
1. Layla clicks "Verify my account".
2. A page opens that looks exactly like the normal sign-in page.
3. She enters her email address and password, then the verification code sent to her phone.
4. The page says "Thank you, your account is verified." Nothing seems wrong.
Behind the scenes, the attacker now has her password and possibly a working code. They may sign in as Layla, read her email and send new phishing messages to her colleagues from her real account.

The safer response:
1. Layla pauses. An unexpected deadline is a reason to slow down, not to hurry.
2. She does not click the link or the button. She checks the sender address and previews the link destination.
3. She checks her account the usual way, by opening the app or typing the address she normally uses. There are no warnings.
4. She reports the email through her organization's approved reporting channel.
5. She deletes it only after reporting it, or when the security team tells her to.

Key takeaway: A genuine account warning can always be checked without using the link in the email. Go to the service the way you normally do.`,
      },
      {
        key: 'protect-yourself',
        title: 'Lesson 4: How to protect yourself',
        body: `A few simple habits stop most phishing attempts before they cause harm.

Do:
- Sign in only through an address you type yourself, a saved bookmark or an approved app, not through links in unexpected messages.
- Verify unusual requests using a contact method you already know and trust, such as a number from the official directory or a new message to the person's known address. Never use the contact details provided in the suspicious message.
- Check where a link really goes before opening it, when you can.
- Treat unexpected attachments with caution, even from people you know. Their account may have been taken over.
- Follow your organization's approved security procedures for reporting, sharing files and approving payments.

Do not:
- Share your password with anyone, including someone who says they are from IT.
- Share a verification code, or approve a sign-in request that you did not start yourself.
- Enable editing, content or macros in a document you were not expecting.
- Reply to a suspicious message to ask whether it is genuine. You may be replying to the attacker.

Watch out: MFA helps, but it is not a shield
Multi-factor authentication (MFA) makes a stolen password much harder to use, so always keep it turned on. But a fake sign-in page can also ask for your code, and attackers sometimes send repeated approval requests hoping you will tap "Approve". If you did not start a sign-in, deny the request and report it.

Key takeaway: Use a path you trust. When in doubt, verify the request through a separate, known contact method before you act.`,
      },
      {
        key: 'what-to-do',
        title: 'Lesson 5: What should you do?',
        body: `Mistakes happen. Phishing is designed to fool careful people. What matters most is acting quickly, because early reporting gives the security team the best chance to limit harm.

If you receive a suspicious message:
- Do not click links, open attachments or reply.
- Report it through your organization's approved reporting channel.
- Delete it only after reporting it, or when the security team tells you to.

If you clicked a suspicious link:
- Close the page without entering any information.
- Report it promptly and say when it happened.
- Follow the security team's instructions.

If you entered your password or a code on a suspicious page:
- Report it immediately. This is urgent.
- Change your password from a trusted device by going to the service directly, if your organization's procedures allow it.
- Tell the security team whether you also entered a verification code or approved a sign-in request.
- Watch for unusual activity, such as unexpected sign-in alerts or sent emails you did not write.

If you opened an attachment that might be harmful:
- Close it and do not enable editing, content or macros.
- Report it immediately and follow the security team's instructions, which may include disconnecting the device from the network.
- Do not try to clean the device yourself.

Tip: How EWAGuard AI can help
You can submit a suspicious email to the EWAGuard AI Email Analyzer, or check a link with the URL Analyzer, to see which warning signs the available checks found. Never submit passwords or confidential information. A low-risk result does not guarantee that a message is safe, and these tools do not replace official reporting. If you are unsure, report it.

Never be afraid to report. A false alarm costs a few minutes. An unreported attack can cost much more.

Key takeaway: Quick recap
- Phishing is a fake message designed to make you act fast.
- Slow down when a message is unexpected, urgent, or asks for passwords, codes, money or confidential information.
- Check the real sender and link destination. Professional design proves nothing.
- Sign in only through paths you trust, and never share passwords or verification codes.
- If something goes wrong, report it immediately through approved channels.

Next, complete the short five-question quiz below to finish the course.`,
      },
    ],
  },
};

export const phishingAwarenessQuiz = {
  title: 'Phishing Awareness quiz',
  passingPercent: 80,
  maxAttempts: 3,
  questions: [
    {
      type: 'MULTIPLE_CHOICE',
      points: 1,
      text: 'You receive an email from "HR Team" saying your salary payment is on hold and you must confirm your bank details within one hour. Which detail is the strongest warning sign?',
      explanation:
        'Urgent deadlines combined with requests for sensitive information are classic phishing signs. A professional layout or a familiar department name does not prove a message is genuine.',
      options: [
        { text: 'The email uses a professional layout and the HR team name.', isCorrect: false },
        { text: 'It demands sensitive information within a short, threatening deadline.', isCorrect: true },
        { text: 'It was sent during working hours.', isCorrect: false },
        { text: 'It is addressed to you by name.', isCorrect: false },
      ],
    },
    {
      type: 'MULTIPLE_CHOICE',
      points: 1,
      text: 'An unexpected email says your Microsoft 365 account will be disabled today unless you click a link and verify your password. What is the safest response?',
      explanation:
        'Do not use the link. Check your account the way you normally do, then report the email through your approved reporting channel. Replying or "testing" the link can expose you to the attacker.',
      options: [
        { text: 'Click the link but only enter your password, not your verification code.', isCorrect: false },
        { text: 'Reply to the sender and ask whether the message is genuine.', isCorrect: false },
        {
          text: 'Do not click the link. Check your account the usual way and report the email through the approved channel.',
          isCorrect: true,
        },
        { text: 'Forward the email to colleagues to ask whether they received it too.', isCorrect: false },
      ],
    },
    {
      type: 'MULTIPLE_CHOICE',
      points: 1,
      text: 'A message from a "colleague" asks you to review a document at https://portal.example.com.files-share.example/review. What is the real website the link would open?',
      explanation:
        'The real website name is the part just before the first single "/". Here it is files-share.example. The words "portal.example.com" at the start are decoration designed to look familiar.',
      options: [
        { text: 'portal.example.com', isCorrect: false },
        { text: 'example.com', isCorrect: false },
        { text: 'files-share.example', isCorrect: true },
        { text: 'It is impossible to tell without opening the link.', isCorrect: false },
      ],
    },
    {
      type: 'TRUE_FALSE',
      points: 1,
      text: 'True or false: If multi-factor authentication (MFA) is turned on, you cannot be affected by phishing.',
      explanation:
        'False. MFA greatly reduces risk, but fake sign-in pages can also ask for your code, and attackers may send repeated approval requests. Never share codes or approve sign-ins you did not start.',
      options: [
        { text: 'True', isCorrect: false },
        { text: 'False', isCorrect: true },
      ],
    },
    {
      type: 'TRUE_FALSE',
      points: 1,
      text: 'True or false: If you entered your password on a suspicious page, you should report it immediately, even if nothing bad seems to have happened yet.',
      explanation:
        'True. Attackers can use stolen passwords quickly and quietly. Prompt reporting through approved channels gives the security team the best chance to secure your account and limit harm.',
      options: [
        { text: 'True', isCorrect: true },
        { text: 'False', isCorrect: false },
      ],
    },
  ],
};
