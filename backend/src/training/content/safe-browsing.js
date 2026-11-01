// Training Content Phase TC2: human-authored Safe Browsing course.
// Plain text using the lesson conventions described in phishing-awareness.js.
// All sites use reserved example domains. No organization-specific policy or contact is assumed.

export const safeBrowsingCourse = {
  title: 'Safe Browsing',
  description: 'Stay safe while exploring the web. Learn how to recognize suspicious websites, fake sign-in pages, risky downloads and QR-code tricks, and how to respond safely when something online does not look right.',
  topic: 'SAFE_BROWSING',
  learningObjectives: [
    'Explain why not every website can be trusted, and what HTTPS does and does not prove.',
    'Recognize lookalike websites, fake sign-in pages, misleading pop-ups and fake security alerts.',
    'Avoid risky downloads, fake updates and unapproved browser extensions.',
    'Recognize QR-code and shortened-link tricks and verify requests independently.',
    'Apply simple safe-browsing habits and report suspicious activity through approved channels.',
  ],
  estimatedMinutes: 9,
  requiresQuiz: true,
  content: { version: 1, sections: [
    { key: 'browsing-safely', title: 'Lesson 1: Browsing safely', body: `The web is a busy place. Most websites are genuine, but some are built to steal passwords, take payments or install harmful software. They can look just as polished as the real thing.

That is why unfamiliar links deserve a moment of care, whether they arrive in an email, a chat message, a search result or an advert.

Browser warnings are there to help:
- "Deceptive site ahead" or "Dangerous site" means the browser has information that the page may be harmful.
- "Your connection is not private" means the browser could not confirm the website's identity.
- In both cases, the safe choice is to go back, not to click "Continue anyway".

Watch out: The padlock is not a safety badge
HTTPS and the padlock icon mean the connection between your browser and the website is encrypted, so others on the network cannot easily read it. They do not tell you who runs the website. Criminals can get a padlock for a fake site in minutes.

Example: Same padlock, different owner
https://portal.example.com and https://portal-example-login.example both show a padlock. Only one of them may belong to the organization you expect. The padlock cannot tell you which.

Key takeaway: Treat unfamiliar links with care, respect browser warnings, and remember that a padlock means "encrypted", not "trustworthy".` },
    { key: 'dangerous-websites', title: 'Lesson 2: Recognizing dangerous websites', body: `Dangerous websites usually try to make you do one of three things: sign in, pay or download. Knowing the common tricks makes them much easier to spot.

Common tricks:
- Lookalike website names: a letter swapped or added, extra words, or a different ending. For example, the number 1 in place of the letter l ("examp1e" instead of "example"), or example-support.example instead of example.com.
- Fake sign-in pages: a copy of a familiar login screen that sends your password to the attacker.
- Unexpected requests for credentials: a page asks you to sign in again when you were only reading or downloading something.
- Fake payment or verification pages: "confirm your card to avoid a late fee" or "verify your account to keep access".
- Suspicious redirects: you click one link but land on a completely different website.
- Misleading pop-ups: "You have won a prize", "Click Allow to continue" or a download button that is really an advert.
- Fake security alerts: a full-screen warning that your computer is infected, often with a phone number to call or a "cleaning tool" to download.

Example: A convincing fake portal
You search for a supplier's invoice portal. One of the top results is billing-portal-example.example, which looks exactly like the real billing.example.com. It asks for your work email and password "to view your invoice". The real portal would not need your work password, and the website name is not the one you know.

Watch out: Fake security alerts
A genuine security tool does not ask you to phone a number shown in a browser pop-up or to download a "fix" from a website. Close the browser tab. If you cannot close it, or you already followed its instructions, report it.

Go there yourself instead:
1. Do not use the link, pop-up or search advert.
2. Open a new browser tab.
3. Type the address you already know, or use a saved bookmark or approved app.
4. Sign in from there. If there is a real message for you, it will be waiting.

Key takeaway: Before you sign in, pay or download, check the real website name. When in doubt, navigate to the website yourself rather than following the link.` },
    { key: 'downloads-attachments', title: 'Lesson 3: Downloads and attachments', body: `Downloading a file or installing software gives it a chance to run on your computer. One harmful file can steal information, lock files or spread to other systems.

Higher-risk downloads:
- Files from unfamiliar websites, pop-ups or file-sharing links you were not expecting.
- "Updates" offered by a website, such as "Your browser is out of date, install now". Real updates come through your device's normal update process or IT.
- Browser extensions and add-ons that promise convenience but ask to "read and change all your data on all websites".
- Documents that ask you to "Enable editing", "Enable content" or allow macros or unusual permissions before you can see anything.
- Free versions of paid software, unofficial tools and file converters.

Example: The video call that needed an update
Ahmed, a fictional employee, opens a meeting link from an unknown sender. A page says his video software is out of date and offers a download called MeetingUpdate.exe. The meeting starts in two minutes and he feels pressure to install it.
The safer decision: he closes the page and joins through the meeting app already installed by IT. Updates come through approved channels, never from a link in a meeting invitation.

Watch out: "Enable content" is a red flag
A document that will only show its content after you enable editing, content or macros is a common way to run harmful code. If you were not expecting the file, do not enable anything. Report it.

Tip: Use only approved software
Install software, updates and browser extensions only through your organization's approved IT process. If you need a tool you do not have, ask IT rather than finding it online.

Key takeaway: If you did not expect a download, do not open it. Get software and updates only through approved channels.` },
    { key: 'qr-codes-online-tricks', title: 'Lesson 4: QR codes and online tricks', body: `QR codes are convenient, but you cannot read where they go just by looking at them. Criminals use this to hide fake links. This is often called QR phishing.

How QR tricks work:
- A sticker with a harmful QR code is placed on top of a genuine one, for example on a poster, parking machine or meeting-room sign.
- A QR code in an email asks you to scan it with your phone, which may have fewer protections than your work computer.
- The code leads to a fake sign-in page or payment page that looks real on a small screen.

Example: The sticker in the break room
A notice in a fictional office break room says: "New staff cafeteria app. Scan to sign in with your work account and get a free coffee." The QR code is a sticker stuck onto the printed notice. It opens cafeteria-rewards.example, which asks for your work email and password.
Why it is suspicious: the reward is tempting, the code is a sticker, the website is not one you know, and a cafeteria app has no reason to ask for your work password.
The safer response: do not enter anything. Check with the facilities team or your line manager using a contact you already know, and report the notice.

Shortened links hide the destination too. A link such as https://short.example/x7Kq2 could lead anywhere. Treat it with the same care as a QR code.

Tip: Before you scan or tap
- Check whether the QR code is a sticker covering something else.
- Read the website address your phone shows before you open it.
- Never enter a password or payment details after scanning a code you were not expecting.
- Verify the request through an independent, trusted method, such as the official website or a known contact.

Key takeaway: A QR code or short link hides where it goes. Check the destination, and never sign in or pay through one you were not expecting.` },
    { key: 'safe-browsing-habits', title: 'Lesson 5: Safe browsing habits', body: `Good habits protect you every day, often without you noticing.

Your safe-browsing checklist:
- Verify unfamiliar websites before you sign in, pay or download.
- Avoid unexpected downloads, updates and browser extensions.
- Never enter your credentials into a page you reached through an unexpected link, pop-up or QR code.
- Follow browser warnings. Go back instead of continuing.
- Keep your browser updated through approved IT processes, not through website pop-ups.
- Report suspicious websites, downloads and alerts through your organization's approved reporting channel.

Tip: How EWAGuard AI can help
If you are unsure about a link, you can check it with the EWAGuard AI URL Analyzer. It looks at the link's structure and other available signals and explains what it found. No automated check can guarantee that a website is safe. A low-risk result is not permission to enter your password, and the tool does not replace official reporting.

If you already entered a password, downloaded a file or followed instructions from a suspicious page, report it immediately and say what happened. Quick reporting helps limit harm.

Key takeaway: Quick recap
- A padlock means encrypted, not trustworthy.
- Check the real website name before you sign in, pay or download.
- Navigate to important websites yourself.
- Get software, updates and extensions only through approved channels.
- QR codes and short links hide their destination.
- Report anything suspicious promptly.

Next, complete the short five-question quiz below to finish the course.` },
  ] },
};

export const safeBrowsingQuiz = {
  title: 'Safe Browsing quiz',
  passingPercent: 80,
  maxAttempts: 3,
  questions: [
    { type: 'MULTIPLE_CHOICE', points: 1,
      text: 'You search for your usual payroll portal, payroll.example.com. The top result is payroll-example-login.example. It looks identical and asks for your work password. What should you do?',
      explanation: 'The website name is different from the one you know, so it may be a lookalike. Navigate to the known address yourself or use a saved bookmark, and report the suspicious result.',
      options: [
        { text: 'Sign in, because the page looks identical and has a padlock.', isCorrect: false },
        { text: 'Close it, open payroll.example.com yourself or from a bookmark, and report the suspicious result.', isCorrect: true },
        { text: 'Enter your email address but not your password to see what happens.', isCorrect: false },
        { text: 'Sign in quickly, then change your password afterward.', isCorrect: false },
      ] },
    { type: 'MULTIPLE_CHOICE', points: 1,
      text: 'While reading a news website, a pop-up says your browser is out of date and offers to install an update now. What is the safest response?',
      explanation: 'Real updates come through your device\'s normal update process or approved IT channels, not website pop-ups. A "required update" from a website is a common way to deliver harmful software.',
      options: [
        { text: 'Install it, because outdated browsers are risky.', isCorrect: false },
        { text: 'Download it but scan it before opening.', isCorrect: false },
        { text: 'Close the pop-up and rely on approved IT update processes.', isCorrect: true },
        { text: 'Click "Remind me later" so it goes away for now.', isCorrect: false },
      ] },
    { type: 'MULTIPLE_CHOICE', points: 1,
      text: 'A poster in the office lobby has a QR code sticker offering a "free parking permit" if you sign in with your work account. What is the main warning sign?',
      explanation: 'A sticker can cover a genuine code, and an unexpected request for your work password after scanning is a classic QR phishing sign. Verify through a trusted contact and report it.',
      options: [
        { text: 'It asks for your work credentials after scanning a code that may have been stuck on top of the poster.', isCorrect: true },
        { text: 'QR codes are always malicious.', isCorrect: false },
        { text: 'The poster is in a public area of the office.', isCorrect: false },
        { text: 'Parking permits are never offered online.', isCorrect: false },
      ] },
    { type: 'TRUE_FALSE', points: 1,
      text: 'True or false: If a website shows a padlock and uses HTTPS, it is safe to enter your password.',
      explanation: 'False. HTTPS only means the connection is encrypted. It does not prove who runs the website. Fake sites commonly use HTTPS too.',
      options: [{ text: 'True', isCorrect: false }, { text: 'False', isCorrect: true }] },
    { type: 'TRUE_FALSE', points: 1,
      text: 'True or false: If an unexpected link takes you to a sign-in page, it is safer to close it and open the service yourself from a known address or bookmark.',
      explanation: 'True. Navigating to the service yourself avoids lookalike and redirected pages. Any genuine request will still be there when you sign in normally.',
      options: [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }] },
  ],
};
