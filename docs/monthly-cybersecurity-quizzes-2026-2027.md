# Monthly cybersecurity quizzes: November 2026 to October 2027

> **Administrators only.** This page contains every correct answer. Do not share it with employees.

## In short

There are **twelve monthly quizzes**, one per month, that reinforce the seven
[training courses](training-courses.md). Each quiz has **15 one-point questions**
(10 multiple choice with four options, 5 true/false), so 180 questions in total.
They use the normal monthly quiz system described in
[training and quizzes](training-and-quizzes.md).

## Calendar

| Month | Period | Title | Based on |
| --- | --- | --- | --- |
| November 2026 | `2026-11` | Spot the Phishing Attempt | Phishing Awareness |
| December 2026 | `2026-12` | Browse Safely Online | Safe Browsing |
| January 2027 | `2027-01` | Protecting Personal Information | Data Privacy |
| February 2027 | `2027-02` | Security Starts at the Workplace | Physical Security |
| March 2027 | `2027-03` | Recognize It, Report It | Reporting Security Incidents |
| April 2027 | `2027-04` | Working Securely Anywhere | Secure Remote Work |
| May 2027 | `2027-05` | Using AI Responsibly | Responsible AI |
| June 2027 | `2027-06` | Phishing, Links & Online Scams | Phishing Awareness + Safe Browsing |
| July 2027 | `2027-07` | Privacy in the Age of AI | Data Privacy + Responsible AI |
| August 2027 | `2027-08` | Keeping Work Secure Everywhere | Physical Security + Secure Remote Work |
| September 2027 | `2027-09` | Recognize and Respond to Threats | Phishing Awareness + Reporting Security Incidents |
| October 2027 | `2027-10` | Cybersecurity Awareness Challenge | All seven courses |

## Settings and design

- **80% to pass, 3 attempts.**
- **Open for the whole UTC month**: from 00:00 UTC on the 1st to 00:00 UTC on the 1st of the next month (03:00 to 03:00 Bahrain time).
- Each quiz has 4–5 practical "what would you do" questions; the rest are beginner level.
- Correct answers appear in different positions, and every quiz uses both True and False.
- No question is repeated across months or copied from a course quiz.
- Each question has a topic tag (such as `PHISHING`, `MFA`, `USB_SECURITY`) for awareness analytics. Remote-work and AI questions use `OTHER`.
- Explanations are shown to employees only after they submit.

The questions live in `backend/src/training/content/monthly-quizzes-mq1.js`
(November–April) and `monthly-quizzes-mq2.js` (May–October), combined in
`monthly-quizzes.js`.

## Creating the drafts

```bash
npm run monthly:provision -- --period all --admin-email <administrator email>
npm run monthly:provision -- --period 2027-03 --admin-email <administrator email>
```

The command refuses to run in production, needs an active administrator with MFA,
skips any month that already has a quiz, and **only creates drafts**: it never
approves, publishes or assigns.

## Publishing each month (manual)

There is **no automatic publishing**. For each month:

1. Sign in with MFA and open **Monthly Quizzes** (`/admin/monthly-quizzes`).
2. Open the month and check the questions, topics and answer-key preview. Drafts can still be edited.
3. Click **Approve**, then **Publish**, **before the month ends** (ideally on or before the 1st). Publishing is refused after the closing time.
4. Optionally **Archive** after the month to stop new attempts. Submitted results stay.

A future month can be published early; employees then see it as **Upcoming**
until it opens.

## What employees see

- Published quizzes are available to all active employees. **Upcoming** before the window, **Open** during it, **Closed** after.
- Questions are shown without answers; the server scores the submission.
- After submitting, employees see the correct options and explanations.
- History shows their best score each month and the change from their previous recorded month.
- Monthly quizzes never change course progress or issue certificates.

## Check before publishing

The questions use general wording such as "approved channel", "approved tools"
and "your organization's policy". Confirm that:

- staff know the approved reporting channels;
- answers about approved storage, collaboration, AI and remote-access tools match current policy;
- any answer about Ask EWAGuard AI's external processing still matches its privacy notice.

## Limitations

- Publishing is manual and must happen before each month closes.
- The availability window follows UTC.
- The course and difficulty metadata in the source files is not stored in the database.
- Because the drafts already occupy their months, a different quiz for one of those months means editing that draft (while it is still a draft).

## Tests

`backend/tests/monthly-quiz-content.integration.test.js` checks the calendar,
question counts and types, single correct answers, varied answer positions, no
duplicates, no invented contacts or legal details, administrator-only provisioning,
answer secrecy, scoring (73.33% fails, 80% passes), history and analytics. It works
on copies in unused 2094 months, so it never touches the real drafts.

## Questions and answer key

### November 2026 — Spot the Phishing Attempt

Based on: Phishing Awareness. Period `2026-11`.

**1. What is phishing?**

- A. A software update that fixes security problems
- B. A fake message that pretends to come from someone you trust
- C. A tool that blocks spam automatically
- D. A type of strong password

*Multiple choice · Beginner · topic `PHISHING` · Phishing Awareness*

Answer: **B. A fake message that pretends to come from someone you trust**. Phishing is a fake message designed to trick you into clicking, signing in, opening a file, paying or sharing information.

**2. Which of these is a common phishing warning sign?**

- A. The email arrives during working hours
- B. It is a meeting agenda you asked for
- C. It comes from a colleague you emailed yesterday
- D. It pressures you to act within a very short time

*Multiple choice · Beginner · topic `PHISHING` · Phishing Awareness*

Answer: **D. It pressures you to act within a very short time**. Urgency and threats are designed to stop you from thinking. When a message rushes you, slow down and check.

**3. Where should you look to see who really sent an email?**

- A. The actual sender email address
- B. The display name only
- C. The logo in the email
- D. The email signature

*Multiple choice · Beginner · topic `PHISHING` · Phishing Awareness*

Answer: **A. The actual sender email address**. Display names, logos and signatures are easy to copy. Check the real sender address, and judge what the message is asking you to do.

**4. On a computer, how can you check where a link really goes without opening it?**

- A. Click it, then close the page quickly
- B. Reply and ask the sender
- C. Rest the mouse pointer over it and read the address that appears
- D. Copy it into a new email to yourself

*Multiple choice · Beginner · topic `SAFE_BROWSING` · Phishing Awareness*

Answer: **C. Rest the mouse pointer over it and read the address that appears**. Hovering shows the real destination, usually near the bottom of the window, without opening the page.

**5. An email link points to https://hr.example.com.pay-update.example/form. What is the real website?**

- A. hr.example.com
- B. example.com
- C. pay-update.example
- D. It cannot be known without opening it

*Multiple choice · Practical application · topic `PHISHING` · Phishing Awareness*

Answer: **C. pay-update.example**. The real website name is the part just before the first single "/". Here it is pay-update.example; the familiar words in front are decoration.

**6. Someone claiming to be from IT emails you asking you to reply with your password to "fix your mailbox". What should you do?**

- A. Do not reply, and report the email through the approved channel
- B. Reply with your password, because IT needs it
- C. Send only part of your password
- D. Change your password and send them the new one

*Multiple choice · Beginner · topic `PASSWORD_SECURITY` · Phishing Awareness*

Answer: **A. Do not reply, and report the email through the approved channel**. A genuine service desk will not ask you to send your password. Report the request instead.

**7. Which attachment is the biggest warning sign?**

- A. A PDF agenda you asked a colleague to send
- B. A calendar invite for your regular team meeting
- C. A photo a colleague said they would share
- D. An unexpected invoice that asks you to enable content before you can read it

*Multiple choice · Beginner · topic `MALWARE` · Phishing Awareness*

Answer: **D. An unexpected invoice that asks you to enable content before you can read it**. Unexpected files that ask you to enable editing, content or macros are a common way to run harmful software.

**8. You receive a "password reset" email, but you did not ask to reset your password. What is the safest action?**

- A. Click the reset link to cancel the request
- B. Do not use the link; check your account the usual way and report the email
- C. Forward it to all colleagues as a warning
- D. Reply and ask whether it is genuine

*Multiple choice · Practical application · topic `PHISHING` · Phishing Awareness*

Answer: **B. Do not use the link; check your account the usual way and report the email**. An unrequested reset is a warning sign. Go to the service the way you normally do, and report the message.

**9. Why do phishing messages often include tight deadlines?**

- A. To stop you from taking time to think and check
- B. Because genuine services always set deadlines
- C. To help you plan your work
- D. To make the message shorter

*Multiple choice · Beginner · topic `PHISHING` · Phishing Awareness*

Answer: **A. To stop you from taking time to think and check**. Pressure is a trick. A real request can always be checked without hurrying.

**10. A message from a colleague's account urgently asks you to buy gift cards and send the codes. What should you do?**

- A. Buy them quickly, because it sounds urgent
- B. Reply to the message to confirm
- C. Verify with the colleague using a contact method you already know, and report the message
- D. Send one gift card first to test

*Multiple choice · Practical application · topic `SOCIAL_ENGINEERING` · Phishing Awareness*

Answer: **C. Verify with the colleague using a contact method you already know, and report the message**. Unusual money requests from a familiar name are a common trick, and the account may have been taken over. Verify independently and report.

**11. A phishing email can have perfect spelling, correct logos and a professional design.**


*True/False · Beginner · topic `PHISHING` · Phishing Awareness*

Answer: **True**. True. Criminals copy branding easily. Judge the request, not the design.

**12. Phishing only happens through email.**


*True/False · Beginner · topic `PHISHING` · Phishing Awareness*

Answer: **False**. False. The same trick appears in text messages, phone calls, chat apps and social media.

**13. It is acceptable to share a verification code with someone who says they are from the IT service desk.**


*True/False · Beginner · topic `MFA` · Phishing Awareness*

Answer: **False**. False. Never share passwords or MFA verification codes with anyone.

**14. If you realize you typed your password on a fake sign-in page, it is best to wait a day and see whether anything unusual happens before reporting.**


*True/False · Practical application · topic `INCIDENT_REPORTING` · Phishing Awareness*

Answer: **False**. False. Report immediately. Attackers can use a stolen password quickly and quietly.

**15. Any employee can be targeted by phishing, not only IT or finance staff.**


*True/False · Beginner · topic `PHISHING` · Phishing Awareness*

Answer: **True**. True. Attackers send the same message to many people and wait for one person to respond.

### December 2026 — Browse Safely Online

Based on: Safe Browsing. Period `2026-12`.

**1. What does the padlock (HTTPS) next to a website address tell you?**

- A. The website is owned by a trusted organization
- B. The website has been checked for viruses
- C. The connection to the website is encrypted
- D. The website cannot ask for your password

*Multiple choice · Beginner · topic `SAFE_BROWSING` · Safe Browsing*

Answer: **C. The connection to the website is encrypted**. HTTPS means the connection is encrypted. It does not tell you who runs the website; fake sites can have a padlock too.

**2. Your browser shows a full-page warning: "Deceptive site ahead". What should you do?**

- A. Go back and do not continue to the site
- B. Click "Continue anyway" if the page looks normal
- C. Turn off the browser warning in settings
- D. Ask a colleague to open it on their computer

*Multiple choice · Beginner · topic `SAFE_BROWSING` · Safe Browsing*

Answer: **A. Go back and do not continue to the site**. Browser warnings are there to protect you. The safe choice is to go back.

**3. Which address is most likely a lookalike rather than the real example.com website?**

- A. www.example.com
- B. mail.example.com
- C. example.com
- D. example-com-secure.example

*Multiple choice · Beginner · topic `SAFE_BROWSING` · Safe Browsing*

Answer: **D. example-com-secure.example**. The real website name is the part just before the first "/". example-com-secure.example is a different website that only contains familiar words.

**4. A full-screen alert says your computer is infected and tells you to call a phone number now. What is this most likely to be?**

- A. A genuine warning from your antivirus software
- B. A fake security alert designed to scare you
- C. A routine message from the website owner
- D. An automatic system update

*Multiple choice · Beginner · topic `MALWARE` · Safe Browsing*

Answer: **B. A fake security alert designed to scare you**. Genuine security tools do not ask you to call a number shown in a browser pop-up. Close the tab, and report it if you followed its instructions.

**5. You click a link to a news article but land on a page asking you to sign in to your work account. What should you do?**

- A. Sign in, because some news sites need it
- B. Enter your email address but not your password
- C. Close the page; the unexpected redirect and request for work credentials are warning signs
- D. Refresh the page until the article appears

*Multiple choice · Practical application · topic `SAFE_BROWSING` · Safe Browsing*

Answer: **C. Close the page; the unexpected redirect and request for work credentials are warning signs**. A surprise redirect followed by a credential request is a classic fake sign-in trick.

**6. Where should software and updates for your work computer come from?**

- A. Your organization's approved IT process
- B. Any website that offers a free download
- C. A pop-up saying your software is out of date
- D. A link in an email from a supplier

*Multiple choice · Beginner · topic `MALWARE` · Safe Browsing*

Answer: **A. Your organization's approved IT process**. Install software and updates only through approved channels. Website pop-ups offering updates are a common trick.

**7. A browser extension promises free coupons but asks to "read and change all your data on all websites". What is the safest choice?**

- A. Install it, because many extensions ask for that
- B. Install it and remove it later
- C. Install it only in a separate browser window
- D. Do not install it; use only approved extensions

*Multiple choice · Beginner · topic `SAFE_BROWSING` · Safe Browsing*

Answer: **D. Do not install it; use only approved extensions**. Extensions with wide permissions can see everything you do online. Use only approved extensions.

**8. A shortened link such as https://short.example/a8Kx arrives in a chat from someone you do not know. What is true?**

- A. Short links are always safe because they are short
- B. You cannot tell where it leads just by looking, so treat it with care
- C. It must lead to an official website
- D. It can only open a picture

*Multiple choice · Practical application · topic `SAFE_BROWSING` · Safe Browsing*

Answer: **B. You cannot tell where it leads just by looking, so treat it with care**. Shortened links hide their real destination, just like QR codes.

**9. You need to visit a supplier portal you use regularly. Which approach is safest?**

- A. Type the address you know or use a saved bookmark
- B. Click the first advert in the search results
- C. Use a link in an unexpected text message
- D. Scan a QR code from a flyer left on your desk

*Multiple choice · Practical application · topic `SAFE_BROWSING` · Safe Browsing*

Answer: **A. Type the address you know or use a saved bookmark**. Navigating to a site yourself avoids lookalike pages, fake adverts and hidden QR destinations.

**10. A pop-up says "Congratulations, you have won a prize! Click Allow to continue." What should you do?**

- A. Click Allow to claim the prize
- B. Enter your email address to check whether it is real
- C. Close the tab without clicking anything in the pop-up
- D. Share it with colleagues

*Multiple choice · Beginner · topic `SAFE_BROWSING` · Safe Browsing*

Answer: **C. Close the tab without clicking anything in the pop-up**. Prize pop-ups and "Click Allow" requests are misleading tricks. Close the tab instead of interacting with them.

**11. Real software updates for your work computer usually arrive through pop-ups on websites you are reading.**


*True/False · Beginner · topic `MALWARE` · Safe Browsing*

Answer: **False**. False. Updates come through your device's normal update process or approved IT channels.

**12. It is safe to visit a known malicious website once, just to see what it looks like.**


*True/False · Beginner · topic `SAFE_BROWSING` · Safe Browsing*

Answer: **False**. False. Never visit malicious websites for practice or curiosity.

**13. Even if a page looks exactly like a familiar sign-in page, you should still check the website name before entering your password.**


*True/False · Beginner · topic `SAFE_BROWSING` · Safe Browsing*

Answer: **True**. True. Fake pages are copied from real ones. The website name is what tells you where you are.

**14. A QR code you were not expecting can hide the address of a fake sign-in page.**


*True/False · Practical application · topic `SAFE_BROWSING` · Safe Browsing*

Answer: **True**. True. You cannot read a QR code's destination by looking at it, so check the address your phone shows before opening it.

**15. Browser warnings about unsafe websites can be ignored when you are in a hurry.**


*True/False · Beginner · topic `SAFE_BROWSING` · Safe Browsing*

Answer: **False**. False. Follow browser warnings and go back, especially when you feel rushed.

### January 2027 — Protecting Personal Information

Based on: Data Privacy. Period `2027-01`.

**1. Which item identifies a specific person?**

- A. The number of meters installed in a region
- B. A customer's name together with their mobile number
- C. The organization's published opening hours
- D. A weather forecast

*Multiple choice · Beginner · topic `INFORMATION_HANDLING` · Data Privacy*

Answer: **B. A customer's name together with their mobile number**. Personal information is any information about an identifiable person, such as a name with contact details.

**2. What does sharing on a "need to know" basis mean?**

- A. Sharing with anyone who asks politely
- B. Sharing with your whole department to save time
- C. Sharing only with people outside the organization
- D. Sharing only with people who need the information for their work

*Multiple choice · Beginner · topic `INFORMATION_HANDLING` · Data Privacy*

Answer: **D. Sharing only with people who need the information for their work**. Share information only with authorized people who need it for their work.

**3. Before pressing Send on an email that contains customer details, what should you check?**

- A. That every recipient is correct and authorized
- B. That the email has a professional signature
- C. That the subject line is in capital letters
- D. That the attachment is as detailed as possible

*Multiple choice · Beginner · topic `INFORMATION_HANDLING` · Data Privacy*

Answer: **A. That every recipient is correct and authorized**. Auto-filled recipients cause many privacy mistakes. Check every address before you send.

**4. A colleague asks you to look up a neighbour's water bill "just out of curiosity". What should you do?**

- A. Look it up, because you have system access
- B. Look it up but do not tell anyone
- C. Decline; access must serve an authorized work purpose
- D. Print the bill and give it to them

*Multiple choice · Practical application · topic `INFORMATION_HANDLING` · Data Privacy*

Answer: **C. Decline; access must serve an authorized work purpose**. Having system access does not make every use acceptable. Curiosity is not a work purpose.

**5. Which is the safest place to keep work documents that contain personal data?**

- A. Your personal cloud storage account
- B. Approved organizational storage systems
- C. Your personal email inbox
- D. A USB drive kept in your bag

*Multiple choice · Beginner · topic `INFORMATION_HANDLING` · Data Privacy*

Answer: **B. Approved organizational storage systems**. Use approved storage and sharing systems so the information stays protected.

**6. You receive an email with a spreadsheet clearly meant for someone else. What should you do?**

- A. Forward it to the person you think should have it
- B. Open it fully to find out who it belongs to
- C. Leave it in your inbox and say nothing
- D. Tell the sender, do not forward it, and report it if it contains personal data

*Multiple choice · Practical application · topic `INFORMATION_HANDLING` · Data Privacy*

Answer: **D. Tell the sender, do not forward it, and report it if it contains personal data**. Do not spread a mistake further. Let the sender know and report it when personal or confidential data is involved.

**7. Why should you remove columns a recipient does not need before sharing a file?**

- A. It reduces the personal information that could be exposed
- B. It makes the file look more professional
- C. It is needed for the file to open
- D. It makes the file open faster on phones

*Multiple choice · Beginner · topic `INFORMATION_HANDLING` · Data Privacy*

Answer: **A. It reduces the personal information that could be exposed**. Sharing the minimum limits the harm if a file is lost, forwarded or misused.

**8. Which of these should usually be treated as sensitive?**

- A. A public news article
- B. The organization's public website address
- C. An employee's medical leave record
- D. A published brochure

*Multiple choice · Beginner · topic `INFORMATION_HANDLING` · Data Privacy*

Answer: **C. An employee's medical leave record**. Employee records such as medical or leave information need protection.

**9. You must share a report with an external contractor, but it includes customer phone numbers they do not need. What is the best approach?**

- A. Send the full report so they have everything
- B. Remove the phone numbers and share only what they need through an approved method
- C. Send it to their personal email address
- D. Post it in a group chat they belong to

*Multiple choice · Practical application · topic `INFORMATION_HANDLING` · Data Privacy*

Answer: **B. Remove the phone numbers and share only what they need through an approved method**. Share the minimum, with authorized people, through approved systems.

**10. What should you do with printed documents containing customer details once you no longer need them?**

- A. Put them in a household recycling bin
- B. Leave them on the printer for collection later
- C. Keep them on your desk just in case
- D. Dispose of them using your organization's approved method

*Multiple choice · Beginner · topic `INFORMATION_HANDLING` · Data Privacy*

Answer: **D. Dispose of them using your organization's approved method**. Printed personal data must be disposed of using approved methods.

**11. Information can be sensitive even if it is not labelled "confidential".**


*True/False · Beginner · topic `INFORMATION_HANDLING` · Data Privacy*

Answer: **True**. True. Sensitive information is not always labelled, so learn to recognize it.

**12. If your system access lets you see a customer record, you may view it for any reason.**


*True/False · Beginner · topic `INFORMATION_HANDLING` · Data Privacy*

Answer: **False**. False. Access should serve an authorized work purpose.

**13. Asking the wrong recipient to delete a misdirected customer record means you no longer need to report it.**


*True/False · Practical application · topic `INFORMATION_HANDLING` · Data Privacy*

Answer: **False**. False. Report it promptly through the approved channel even if you have asked the recipient to delete it.

**14. Passwords and verification codes should never be shared, even with colleagues.**


*True/False · Beginner · topic `PASSWORD_SECURITY` · Data Privacy*

Answer: **True**. True. Sign-in details belong to you alone.

**15. Different types of information may require different handling under your organization's approved policies.**


*True/False · Beginner · topic `INFORMATION_HANDLING` · Data Privacy*

Answer: **True**. True. Follow approved data-handling policies, and ask when you are unsure.

### February 2027 — Security Starts at the Workplace

Based on: Physical Security. Period `2027-02`.

**1. What is tailgating?**

- A. Parking too close to another car
- B. Replying to an email after a colleague
- C. Following an authorized person through a controlled door without using your own access
- D. Signing in after someone else signs out

*Multiple choice · Beginner · topic `PHYSICAL_SECURITY` · Physical Security*

Answer: **C. Following an authorized person through a controlled door without using your own access**. Tailgating relies on politeness to get people through controlled doors without their own access.

**2. What is a quick way to lock a Windows computer?**

- A. Press the Windows key + L
- B. Turn down the monitor brightness
- C. Close the email program
- D. Press Ctrl + S

*Multiple choice · Beginner · topic `PHYSICAL_SECURITY` · Physical Security*

Answer: **A. Press the Windows key + L**. Windows key + L locks a Windows device instantly. Other devices have their own lock shortcut.

**3. Which habit puts your account at risk?**

- A. Locking your screen when you leave your desk
- B. Collecting printouts promptly
- C. Using your own badge at doors
- D. Keeping your password on a sticky note under the keyboard

*Multiple choice · Beginner · topic `PASSWORD_SECURITY` · Physical Security*

Answer: **D. Keeping your password on a sticky note under the keyboard**. Never write passwords on sticky notes or leave them on your desk.

**4. A person in a delivery uniform you do not recognize is walking alone in a restricted office area. What is the best response?**

- A. Confront them and demand that they leave
- B. Do not confront them; note what you saw and report it promptly through the approved channel
- C. Ignore it, because the uniform looks genuine
- D. Lead them around until they find who they need

*Multiple choice · Practical application · topic `PHYSICAL_SECURITY` · Physical Security*

Answer: **B. Do not confront them; note what you saw and report it promptly through the approved channel**. Your role is to notice and report, not to confront. Uniforms can be bought or borrowed.

**5. Why should you never plug an unknown USB drive into a work computer?**

- A. It may contain harmful software that runs when connected
- B. It may transfer files slowly
- C. It might erase the USB drive
- D. It may use too much power

*Multiple choice · Beginner · topic `USB_SECURITY` · Physical Security*

Answer: **A. It may contain harmful software that runs when connected**. Unknown devices are a well-known way to deliver harmful software. Hand them over or report them instead.

**6. Who is responsible for physical security in the workplace?**

- A. Only security guards
- B. Only the IT department
- C. Every employee
- D. Only managers

*Multiple choice · Beginner · topic `PHYSICAL_SECURITY` · Physical Security*

Answer: **C. Every employee**. Small habits from every employee close physical security gaps.

**7. You notice a colleague's unlocked computer showing customer records while they are away. What should you do?**

- A. Use it to finish their task for them
- B. Read the records to check they are correct
- C. Take a photo of the screen to show them later
- D. Do not use or read it; let them know, or report it if it keeps happening

*Multiple choice · Practical application · topic `PHYSICAL_SECURITY` · Physical Security*

Answer: **D. Do not use or read it; let them know, or report it if it keeps happening**. Never use someone else's session. Let them know so they can lock it.

**8. Which is the safest way to leave your desk at the end of the day?**

- A. Leave printed reports out for the morning
- B. Lock away sensitive papers and lock or shut down your computer
- C. Leave your badge on the desk
- D. Leave the computer unlocked so updates can run

*Multiple choice · Beginner · topic `PHYSICAL_SECURITY` · Physical Security*

Answer: **B. Lock away sensitive papers and lock or shut down your computer**. Put sensitive papers away and protect your computer whenever you leave.

**9. You are hosting a visitor in the office. What is your responsibility?**

- A. Follow the approved visitor procedure and stay responsible for them while they are on site
- B. Lend them your badge so they can move around freely
- C. Leave them alone in a meeting room for the afternoon
- D. Let them follow other staff through controlled doors

*Multiple choice · Practical application · topic `PHYSICAL_SECURITY` · Physical Security*

Answer: **A. Follow the approved visitor procedure and stay responsible for them while they are on site**. Follow your organization's approved visitor procedures and stay responsible for your visitor.

**10. A side door is propped open with a box. Why is this a security risk?**

- A. It wastes air conditioning
- B. It makes the corridor untidy
- C. It lets people enter without using controlled access
- D. It is only a risk at night

*Multiple choice · Beginner · topic `PHYSICAL_SECURITY` · Physical Security*

Answer: **C. It lets people enter without using controlled access**. A propped door bypasses access control and lets anyone walk in.

**11. Wearing a uniform or carrying a box proves that someone is allowed into a restricted area.**


*True/False · Beginner · topic `PHYSICAL_SECURITY` · Physical Security*

Answer: **False**. False. You cannot tell from appearance whether someone is authorized.

**12. Locking your computer is only necessary if you will be away for more than an hour.**


*True/False · Beginner · topic `PHYSICAL_SECURITY` · Physical Security*

Answer: **False**. False. Lock it every time you step away, even for a minute.

**13. If someone insists on following you through a controlled door, you should physically block them.**


*True/False · Practical application · topic `PHYSICAL_SECURITY` · Physical Security*

Answer: **False**. False. Stay safe. Politely decline, do not confront, and report it through the approved channel.

**14. Confidential papers left on a meeting-room table can be read, photographed or taken.**


*True/False · Beginner · topic `PHYSICAL_SECURITY` · Physical Security*

Answer: **True**. True. Collect and secure confidential papers promptly.

**15. A USB drive with a tempting label such as "Salary review" is a known trick to get people to plug it in.**


*True/False · Beginner · topic `USB_SECURITY` · Physical Security*

Answer: **True**. True. Curiosity is the trap. Report found devices instead of testing them.

### March 2027 — Recognize It, Report It

Based on: Reporting Security Incidents. Period `2027-03`.

**1. Which of these is a possible security incident that should be reported?**

- A. You find an unknown device plugged into a work computer
- B. A colleague is on annual leave
- C. A scheduled meeting is moved
- D. You receive a newsletter you subscribed to

*Multiple choice · Beginner · topic `INCIDENT_REPORTING` · Reporting Security Incidents*

Answer: **A. You find an unknown device plugged into a work computer**. An unknown device connected to work equipment may put information or systems at risk.

**2. Who is responsible for confirming whether a security breach has happened?**

- A. The employee who noticed it
- B. Any colleague nearby
- C. The person who sent the suspicious email
- D. The authorized security team

*Multiple choice · Beginner · topic `INCIDENT_REPORTING` · Reporting Security Incidents*

Answer: **D. The authorized security team**. Your job is to notice and report. Confirming a breach is the security team's job.

**3. You clicked a link in a suspicious message and a strange page opened, but you typed nothing. What should you do first?**

- A. Nothing, because you did not type anything
- B. Close the page and report what happened, including roughly when
- C. Restart the office server
- D. Click other links in the message to see where they lead

*Multiple choice · Practical application · topic `INCIDENT_REPORTING` · Reporting Security Incidents*

Answer: **B. Close the page and report what happened, including roughly when**. Close the page without entering anything and report it promptly.

**4. Why does reporting quickly matter?**

- A. It guarantees nothing bad will happen
- B. It means you will not be asked any questions
- C. It gives the security team the best chance to limit harm
- D. It means you can skip the usual procedures

*Multiple choice · Beginner · topic `INCIDENT_REPORTING` · Reporting Security Incidents*

Answer: **C. It gives the security team the best chance to limit harm**. Early reports let the team act before damage spreads. No report can guarantee an outcome.

**5. You opened an unexpected attachment and it asked you to enable content. What should you do?**

- A. Close it without enabling anything, report it, and follow the instructions you receive
- B. Enable content to see what it contains
- C. Forward it to a colleague to test it
- D. Delete it and say nothing

*Multiple choice · Practical application · topic `MALWARE` · Reporting Security Incidents*

Answer: **A. Close it without enabling anything, report it, and follow the instructions you receive**. Do not enable editing, content or macros. Report it and follow the security team's instructions.

**6. What should you NOT include in a security report?**

- A. The approximate time it happened
- B. What you clicked or opened
- C. Any warning messages you saw
- D. Your password or verification codes

*Multiple choice · Beginner · topic `INCIDENT_REPORTING` · Reporting Security Incidents*

Answer: **D. Your password or verification codes**. Never put passwords or codes in a report. If sensitive evidence is needed, the security team will explain how to provide it.

**7. After you report an incident, a colleague asks you for all the details. What should you do?**

- A. Share everything so they can help investigate
- B. Keep details on a need-to-know basis and follow the security team's directions
- C. Post the details in a team chat
- D. Forward them the suspicious email so they can see it

*Multiple choice · Practical application · topic `INCIDENT_REPORTING` · Reporting Security Incidents*

Answer: **B. Keep details on a need-to-know basis and follow the security team's directions**. Avoid sharing incident details with people who do not need to know.

**8. Which action could make an incident worse?**

- A. Reporting it promptly
- B. Describing what you did
- C. Deleting evidence or running cleaning tools on your own
- D. Following the security team's instructions

*Multiple choice · Beginner · topic `INCIDENT_REPORTING` · Reporting Security Incidents*

Answer: **C. Deleting evidence or running cleaning tools on your own**. Well-meant actions can destroy information the team needs or disrupt operations.

**9. You lose a work phone on the way home. What should you do?**

- A. Report it immediately, with when and where you last had it
- B. Wait a week in case someone returns it
- C. Buy a replacement and say nothing
- D. Post about it on social media

*Multiple choice · Beginner · topic `INCIDENT_REPORTING` · Reporting Security Incidents*

Answer: **A. Report it immediately, with when and where you last had it**. Lost devices should be reported straight away so they can be dealt with.

**10. The day after you reported a phishing email, you receive a similar one. What should you do?**

- A. Ignore it, since you already reported one
- B. Reply and tell the sender to stop
- C. Forward it to all staff
- D. Report the new message as well

*Multiple choice · Practical application · topic `PHISHING` · Reporting Security Incidents*

Answer: **D. Report the new message as well**. Keep reporting new observations. Repeated messages can show a wider campaign.

**11. Noticing something suspicious is enough reason to report it.**


*True/False · Beginner · topic `INCIDENT_REPORTING` · Reporting Security Incidents*

Answer: **True**. True. You do not need proof. If something seems wrong, report it.

**12. Hiding a security mistake helps only the attacker.**


*True/False · Beginner · topic `INCIDENT_REPORTING` · Reporting Security Incidents*

Answer: **True**. True. Reporting quickly is the responsible, professional choice.

**13. You should switch off or unplug workplace systems yourself whenever you suspect an incident.**


*True/False · Beginner · topic `INCIDENT_REPORTING` · Reporting Security Incidents*

Answer: **False**. False. Do not switch off, unplug or restart systems unless the IT or security team tells you to.

**14. If you approved an unexpected MFA sign-in request after visiting a suspicious page, you should tell the security team.**


*True/False · Practical application · topic `MFA` · Reporting Security Incidents*

Answer: **True**. True. Approving a request you did not start may give an attacker access. Report exactly what you did.

**15. EWAGuard AI's analysis tools replace the need to report through official channels.**


*True/False · Beginner · topic `INCIDENT_REPORTING` · Reporting Security Incidents*

Answer: **False**. False. Automated analysis can miss threats and does not replace official incident reporting.

### April 2027 — Working Securely Anywhere

Based on: Secure Remote Work. Period `2027-04`.

**1. Why does security still matter when you work outside the office?**

- A. It does not; office rules only apply inside the building
- B. Information is just as valuable, and there are fewer controls around you
- C. Only because your manager might check
- D. Because public places have faster internet

*Multiple choice · Beginner · topic `OTHER` · Secure Remote Work*

Answer: **B. Information is just as valuable, and there are fewer controls around you**. The information you work with needs the same protection wherever you are.

**2. You need to take a confidential call while working in a café. What is best?**

- A. Take it on speakerphone at your table
- B. Lower your voice and carry on
- C. Ask the people nearby to stop listening
- D. Move somewhere private where you cannot be overheard

*Multiple choice · Beginner · topic `INFORMATION_HANDLING` · Secure Remote Work*

Answer: **D. Move somewhere private where you cannot be overheard**. Avoid discussing confidential matters where others can overhear.

**3. A family member asks to borrow your work laptop for a few minutes. What should you do?**

- A. Politely refuse; the work device is for your work only
- B. Allow it if they promise not to download anything
- C. Allow it while you stay signed in
- D. Allow it at weekends only

*Multiple choice · Beginner · topic `PHYSICAL_SECURITY` · Secure Remote Work*

Answer: **A. Politely refuse; the work device is for your work only**. Anything someone else does on your work device is linked to your account and could affect work systems.

**4. At an airport you see an open network called "Airport Free WiFi Fast". What is the safest approach before connecting to work systems?**

- A. Join it, because airports always provide free Wi-Fi
- B. Join it and turn off your security software for speed
- C. Confirm the official network with a trusted source, or use an approved alternative
- D. Ask another traveller which network they use

*Multiple choice · Practical application · topic `OTHER` · Secure Remote Work*

Answer: **C. Confirm the official network with a trusted source, or use an approved alternative**. Anyone can create a network with a convincing name. Confirm it with a trusted source, and use your organization's approved remote-access method.

**5. What does an approved VPN or secure connection protect?**

- A. Your device from all harmful software
- B. Data travelling between your device and work systems
- C. You from entering your password on fake websites
- D. Your screen from people looking at it

*Multiple choice · Beginner · topic `OTHER` · Secure Remote Work*

Answer: **B. Data travelling between your device and work systems**. A secure connection protects data in transit. It does not make a fake website safe or clean an infected device.

**6. Why should you keep MFA turned on for your work account?**

- A. It makes a stolen password much harder to use
- B. It makes your password unnecessary
- C. It speeds up your computer
- D. It stops all phishing emails

*Multiple choice · Beginner · topic `MFA` · Secure Remote Work*

Answer: **A. It makes a stolen password much harder to use**. MFA adds a second check. It helps a lot, but it does not stop phishing on its own.

**7. A message says: "IT here, please send your remote-access username, password and the code on your phone so we can fix your connection." What should you do?**

- A. Send the details, because remote access is important
- B. Send the username only
- C. Reply asking which IT person they are
- D. Do not reply or send anything, and report it

*Multiple choice · Practical application · topic `PHISHING` · Secure Remote Work*

Answer: **D. Do not reply or send anything, and report it**. Genuine IT teams will not ask for your password or codes. Report the request.

**8. A security control on your work laptop is slowing you down. What should you do?**

- A. Turn it off temporarily
- B. Search online for a way around it
- C. Leave it on and ask IT for help through approved channels
- D. Switch to your personal laptop

*Multiple choice · Beginner · topic `OTHER` · Secure Remote Work*

Answer: **C. Leave it on and ask IT for help through approved channels**. Never bypass or switch off security controls on a work device.

**9. You are about to join a video call from home. What should you check first?**

- A. That your camera is set to the highest quality
- B. What can be seen and heard behind you, such as documents or whiteboards
- C. That everyone else in the house is online
- D. That your phone is on loud

*Multiple choice · Practical application · topic `INFORMATION_HANDLING` · Secure Remote Work*

Answer: **B. What can be seen and heard behind you, such as documents or whiteboards**. Check your surroundings before sensitive calls, including what is visible behind you.

**10. Which option keeps a work file inside protected systems?**

- A. Your organization's approved collaboration or file-sharing application
- B. Your personal email account
- C. A personal cloud storage folder
- D. A messaging app on your personal phone

*Multiple choice · Beginner · topic `INFORMATION_HANDLING` · Secure Remote Work*

Answer: **A. Your organization's approved collaboration or file-sharing application**. Approved applications keep work information protected. Personal accounts are not shortcuts unless your organization's policy allows them.

**11. A convincing Wi-Fi network name proves that the network is genuine.**


*True/False · Beginner · topic `OTHER` · Secure Remote Work*

Answer: **False**. False. Confirm the network with a trusted source, such as venue staff or an official sign.

**12. Printed work documents taken home should be kept secure and disposed of using approved methods, not a household bin.**


*True/False · Beginner · topic `INFORMATION_HANDLING` · Secure Remote Work*

Answer: **True**. True. Paper needs the same protection outside the office.

**13. An unusual sign-in alert you notice while working from home can wait until you are back in the office.**


*True/False · Practical application · topic `INCIDENT_REPORTING` · Secure Remote Work*

Answer: **False**. False. Report it promptly, wherever you are. Delays give attackers more time.

**14. Leaving a work laptop visible on the seat of a parked car is a theft risk.**


*True/False · Beginner · topic `PHYSICAL_SECURITY` · Secure Remote Work*

Answer: **True**. True. Never leave devices unattended or visible in a car.

**15. Saving work files to personal cloud storage is fine as long as the account has a strong password.**


*True/False · Beginner · topic `INFORMATION_HANDLING` · Secure Remote Work*

Answer: **False**. False. A strong password does not make personal storage an approved place for work files. Follow your organization's policy.

### May 2027 — Using AI Responsibly

Based on: Responsible AI. Period `2027-05`.

**1. Which task is generally suitable for an AI assistant, using only non-confidential information?**

- A. Storing customer passwords
- B. Approving payments automatically
- C. Explaining an unfamiliar cybersecurity term
- D. Deciding whether to report an incident

*Multiple choice · Beginner · topic `OTHER` · Responsible AI*

Answer: **C. Explaining an unfamiliar cybersecurity term**. AI can help explain ideas and improve writing. It should not hold secrets or make important decisions for you.

**2. Which of these should never be pasted into an unapproved AI tool?**

- A. An API key or other secret key
- B. A general question about strong passwords
- C. A request to explain what MFA means
- D. A public news headline

*Multiple choice · Beginner · topic `INFORMATION_HANDLING` · Responsible AI*

Answer: **A. An API key or other secret key**. Secrets such as API keys, passwords and codes must never be entered into unapproved AI tools.

**3. An AI answer refers to a document that does not exist. What does this show?**

- A. AI always checks its sources
- B. The document must be secret
- C. AI never makes mistakes about references
- D. AI can invent details and references, so important answers need checking

*Multiple choice · Beginner · topic `OTHER` · Responsible AI*

Answer: **D. AI can invent details and references, so important answers need checking**. AI can produce convincing but invented details. Verify important answers with trusted sources.

**4. You want an AI tool to improve an email that includes a customer's account number. What is the safest approach?**

- A. Paste the full email into any free AI tool
- B. Use only an approved tool, follow data-handling rules, and remove the account number if you are allowed to use AI for this
- C. Ask the AI to keep the account number secret
- D. Send the email to the AI provider's support team

*Multiple choice · Practical application · topic `INFORMATION_HANDLING` · Responsible AI*

Answer: **B. Use only an approved tool, follow data-handling rules, and remove the account number if you are allowed to use AI for this**. Use approved tools only, and share the minimum. Asking an AI to keep something secret does not protect it.

**5. How can attackers use AI in scams?**

- A. They cannot; AI only helps defenders
- B. Only to create spam that is easy to spot
- C. To create convincing messages, voices and images that impersonate people
- D. Only to translate websites

*Multiple choice · Beginner · topic `SOCIAL_ENGINEERING` · Responsible AI*

Answer: **C. To create convincing messages, voices and images that impersonate people**. AI helps attackers create polished, convincing impersonations quickly and in many languages.

**6. An AI answer sounds very confident. What does that tell you about its accuracy?**

- A. Nothing; confident wording does not guarantee accuracy
- B. It is definitely correct
- C. It has been checked by your IT team
- D. It comes from an approved policy

*Multiple choice · Beginner · topic `OTHER` · Responsible AI*

Answer: **A. Nothing; confident wording does not guarantee accuracy**. Confident is not the same as correct.

**7. On a video call, a senior manager's face and voice ask you to transfer money urgently. Something feels off. What should you do?**

- A. Transfer the money because you can see their face
- B. Ask them to turn their camera off and on again to prove it is real
- C. Transfer a small amount first
- D. End the call and verify the request through a known, independent channel before acting

*Multiple choice · Practical application · topic `SOCIAL_ENGINEERING` · Responsible AI*

Answer: **D. End the call and verify the request through a known, independent channel before acting**. Faces and voices can be imitated, and you may not be able to spot it. Verify the request, not the voice or face.

**8. Which statement about Ask EWAGuard AI is accurate?**

- A. It is guaranteed to give correct answers
- B. It processes your messages only on your own computer
- C. It sends your messages and recent conversation context to an external AI provider to generate answers
- D. It replaces official incident reporting

*Multiple choice · Beginner · topic `OTHER` · Responsible AI*

Answer: **C. It sends your messages and recent conversation context to an external AI provider to generate answers**. As its notice explains, messages are sent to an external AI provider (OpenAI). Answers can be inaccurate, and official reporting comes first.

**9. An AI chatbot tells you it is fine to disable your antivirus to install a tool faster. What should you do?**

- A. Follow the advice, since the AI explained it clearly
- B. Do not follow it; check with your IT or security team and approved policies
- C. Disable antivirus for just a few minutes
- D. Ask the AI again until it agrees

*Multiple choice · Practical application · topic `OTHER` · Responsible AI*

Answer: **B. Do not follow it; check with your IT or security team and approved policies**. Important security decisions need independent verification through trusted organizational resources.

**10. Which is part of using AI responsibly at work?**

- A. Using only AI tools your organization has approved
- B. Sharing confidential documents to get better answers
- C. Trusting any answer that includes references
- D. Letting AI decide how to handle security incidents

*Multiple choice · Beginner · topic `OTHER` · Responsible AI*

Answer: **A. Using only AI tools your organization has approved**. Use approved tools, protect information, verify answers and keep a human in charge.

**11. Information you type into an AI service may be processed and kept by the provider, depending on the service.**


*True/False · Beginner · topic `INFORMATION_HANDLING` · Responsible AI*

Answer: **True**. True. Depending on the service and its setup, the provider may keep what you enter.

**12. You can always tell an AI-generated voice by listening carefully.**


*True/False · Beginner · topic `SOCIAL_ENGINEERING` · Responsible AI*

Answer: **False**. False. AI voices can be very convincing. Focus on verifying the request.

**13. AI can misunderstand your question or leave out important context.**


*True/False · Beginner · topic `OTHER` · Responsible AI*

Answer: **True**. True. Check that the answer actually fits your situation.

**14. Security incident evidence, such as a suspicious email containing customer data, can be pasted into any AI chatbot to get a quick summary.**


*True/False · Practical application · topic `INFORMATION_HANDLING` · Responsible AI*

Answer: **False**. False. Incident evidence and customer data must not go into unapproved tools. Report through the approved channel.

**15. EWAGuard AI should support your judgment, not replace it.**


*True/False · Beginner · topic `OTHER` · Responsible AI*

Answer: **True**. True. Automated analysis and AI answers can be wrong; keep a human in charge of the decision.

### June 2027 — Phishing, Links & Online Scams

Based on: Phishing Awareness, Safe Browsing. Period `2027-06`.

**1. A text message says your parcel is held and asks you to pay a small fee through a link. What is this most likely to be?**

- A. A normal delivery update
- B. A message from your IT team
- C. A request from your manager
- D. A phishing attempt using a delivery theme

*Multiple choice · Beginner · topic `PHISHING` · Phishing Awareness*

Answer: **D. A phishing attempt using a delivery theme**. Phishing also arrives by text message. Unexpected payment requests through links are a common trick.

**2. Why can a link that starts with "login.example.com" still be fake?**

- A. Because the real website name is the part just before the first single "/", which may be a different site
- B. Because every link starting with "login" is fake
- C. Because links using https are never genuine
- D. Because example.com is not a real company

*Multiple choice · Beginner · topic `SAFE_BROWSING` · Safe Browsing*

Answer: **A. Because the real website name is the part just before the first single "/", which may be a different site**. Attackers put familiar words at the start of an address. Read the website name just before the first single "/".

**3. An email from a "supplier" says their bank details have changed and asks you to update them before paying the next invoice. What should you do?**

- A. Update the details straight away
- B. Reply to the email to confirm
- C. Verify the change using contact details you already have, following the approved process
- D. Forward it to a colleague and delete it

*Multiple choice · Practical application · topic `SOCIAL_ENGINEERING` · Phishing Awareness*

Answer: **C. Verify the change using contact details you already have, following the approved process**. Verify unusual requests through a contact method you already know, never through details in the message itself.

**4. A search advert at the top of the results looks like your usual webmail sign-in page. What is the safest way to sign in?**

- A. Click the advert because it is at the top
- B. Click the advert but check for a padlock
- C. Ask the search engine for help
- D. Type the address you know or use a saved bookmark

*Multiple choice · Beginner · topic `SAFE_BROWSING` · Safe Browsing*

Answer: **D. Type the address you know or use a saved bookmark**. Fake portals can appear in search results. Navigate to important sites yourself.

**5. Which request should make you most suspicious?**

- A. An unexpected message asking you to confirm your password
- B. A colleague asking for a convenient meeting time
- C. A reminder about a training course assigned to you
- D. A newsletter you subscribed to

*Multiple choice · Beginner · topic `PHISHING` · Phishing Awareness*

Answer: **A. An unexpected message asking you to confirm your password**. Unexpected requests for passwords or codes are a key phishing sign.

**6. While you are downloading a document, your browser warns that the file may be harmful. What should you do?**

- A. Keep the file and open it to check
- B. Discard the download and do not open it
- C. Rename the file and open it
- D. Send it to a colleague to open

*Multiple choice · Practical application · topic `MALWARE` · Safe Browsing*

Answer: **B. Discard the download and do not open it**. Respect browser warnings. If you did not expect a download, do not open it.

**7. Why do phishing messages often copy the logos and layouts of real companies?**

- A. Because they were sent by those companies
- B. To make the message load faster
- C. To look trustworthy so you act without checking
- D. Because logos are always required

*Multiple choice · Beginner · topic `PHISHING` · Phishing Awareness*

Answer: **C. To look trustworthy so you act without checking**. Professional design is easy to copy and proves nothing.

**8. A website asks you to "Allow notifications" before you can keep reading. What is the safest choice?**

- A. Block or ignore the request; you do not need to allow it
- B. Allow it, because all websites need it
- C. Allow it and enter your email address
- D. Allow it for one day only

*Multiple choice · Beginner · topic `SAFE_BROWSING` · Safe Browsing*

Answer: **A. Block or ignore the request; you do not need to allow it**. "Click Allow to continue" requests are a common misleading pop-up trick.

**9. You receive a convincing email from "HR" with a link to "view your updated salary". You were not expecting it. What should you do?**

- A. Click it, because salary information is important
- B. Enter your credentials only if the page has a padlock
- C. Forward it to colleagues to see if they received it
- D. Open the HR system the usual way instead of using the link, and report the email

*Multiple choice · Practical application · topic `PHISHING` · Phishing Awareness*

Answer: **D. Open the HR system the usual way instead of using the link, and report the email**. Go to the service the way you normally do. A genuine message will be waiting there.

**10. Which of these is a sign of a fake website?**

- A. The address is the one you always use
- B. You opened it from your own saved bookmark
- C. The website name is slightly different from the real one
- D. It loads quickly

*Multiple choice · Beginner · topic `SAFE_BROWSING` · Safe Browsing*

Answer: **C. The website name is slightly different from the real one**. Lookalike names swap, add or remove letters or words.

**11. Attackers sometimes create fake search adverts that lead to lookalike sign-in pages.**


*True/False · Beginner · topic `SAFE_BROWSING` · Safe Browsing*

Answer: **True**. True. Check the real website name, or navigate to the site yourself.

**12. If an email is addressed to you by name, it must be genuine.**


*True/False · Beginner · topic `PHISHING` · Phishing Awareness*

Answer: **False**. False. Attackers can easily find and use names.

**13. Clicking "Continue anyway" on a "Your connection is not private" warning is safe if the site looks normal.**


*True/False · Beginner · topic `SAFE_BROWSING` · Safe Browsing*

Answer: **False**. False. The browser could not confirm the site's identity. Go back instead.

**14. Replying to a suspicious email to ask whether it is genuine can put you in contact with the attacker.**


*True/False · Practical application · topic `PHISHING` · Phishing Awareness*

Answer: **True**. True. Verify through a separate, known contact method instead of replying.

**15. A free copy of paid software from an unofficial website may contain harmful software.**


*True/False · Beginner · topic `MALWARE` · Safe Browsing*

Answer: **True**. True. Get software only through approved channels.

### July 2027 — Privacy in the Age of AI

Based on: Data Privacy, Responsible AI. Period `2027-07`.

**1. Why is putting customer data into an unapproved AI tool risky?**

- A. It makes the AI tool slower
- B. The data leaves protected systems and may be stored by an external provider
- C. AI tools cannot read customer data
- D. It is only risky outside working hours

*Multiple choice · Beginner · topic `INFORMATION_HANDLING` · Responsible AI*

Answer: **B. The data leaves protected systems and may be stored by an external provider**. Once pasted, information is outside the organization's control.

**2. Which request is safest to give an AI writing tool?**

- A. Rewrite this complaint from Ahmed, account 4471, about his unpaid bill
- B. Summarize this file of customer phone numbers
- C. Check this list of staff salaries
- D. Make this general reminder about meter-reading days sound more friendly

*Multiple choice · Beginner · topic `INFORMATION_HANDLING` · Responsible AI*

Answer: **D. Make this general reminder about meter-reading days sound more friendly**. General, non-confidential text is the safest kind of input. The other options contain personal or confidential data.

**3. A colleague posts an AI-generated summary containing a customer's full name and address in a team chat that many people can see. What should you do?**

- A. Raise the concern and report it if personal data was shared inappropriately
- B. Forward it to more people
- C. Copy it into your personal notes
- D. Ignore it because an AI created it

*Multiple choice · Practical application · topic `INFORMATION_HANDLING` · Data Privacy*

Answer: **A. Raise the concern and report it if personal data was shared inappropriately**. Personal data should only reach people who need it. Who or what created the text does not change that.

**4. Before relying on an AI answer about handling personal data, what should you do?**

- A. Ask the AI whether it is sure
- B. Share the answer with the customer
- C. Check it against approved policies or ask the responsible team
- D. Assume it is correct if it sounds professional

*Multiple choice · Beginner · topic `OTHER` · Responsible AI*

Answer: **C. Check it against approved policies or ask the responsible team**. Verify important guidance with trusted organizational resources.

**5. What does anonymizing information mean?**

- A. Protecting a file with a password
- B. Removing details that identify a person, such as names and account numbers
- C. Sending information without your email signature
- D. Deleting the whole file

*Multiple choice · Beginner · topic `INFORMATION_HANDLING` · Data Privacy*

Answer: **B. Removing details that identify a person, such as names and account numbers**. Anonymized information no longer points to a specific person.

**6. A message that sounds like your manager asks you to send a list of customer contacts to a new personal email address "for a quick project". What should you do?**

- A. Send it, because your manager asked
- B. Send only half of the list
- C. Reply asking for the project name
- D. Verify the request through a known channel; personal email is not an approved channel for customer data

*Multiple choice · Practical application · topic `SOCIAL_ENGINEERING` · Data Privacy*

Answer: **D. Verify the request through a known channel; personal email is not an approved channel for customer data**. Urgency, a personal address and a request for personal data are warning signs. Verify independently.

**7. Which of these is confidential operational information?**

- A. Details about how facilities, networks or systems are set up
- B. The public customer service phone number
- C. A published press release
- D. Office opening hours

*Multiple choice · Beginner · topic `INFORMATION_HANDLING` · Data Privacy*

Answer: **A. Details about how facilities, networks or systems are set up**. Operational details could help someone cause harm, so they need protection.

**8. What does "use only approved AI tools" mean for you?**

- A. Use any AI tool that looks professional
- B. Use AI tools your friends recommend
- C. Use AI tools your organization has authorized for work, following their guidance
- D. Use AI only on your personal phone

*Multiple choice · Beginner · topic `OTHER` · Responsible AI*

Answer: **C. Use AI tools your organization has authorized for work, following their guidance**. Approval is set by your organization, not by how a tool looks.

**9. You realize you pasted a document with customer details into an unapproved AI chatbot. What should you do?**

- A. Delete the chat and say nothing
- B. Report it promptly through the approved channel
- C. Ask the chatbot to forget it and consider the matter closed
- D. Paste more documents to compare

*Multiple choice · Practical application · topic `INCIDENT_REPORTING` · Responsible AI*

Answer: **B. Report it promptly through the approved channel**. Deleting the chat does not undo the disclosure. Prompt reporting helps limit harm.

**10. Why must access to personal data serve an authorized work purpose?**

- A. To make systems run faster
- B. Because only managers may view data
- C. So that data can be shared freely
- D. To protect people's privacy and the trust they place in the organization

*Multiple choice · Beginner · topic `INFORMATION_HANDLING` · Data Privacy*

Answer: **D. To protect people's privacy and the trust they place in the organization**. Customers and colleagues trust the organization with their information.

**11. Asking an AI chatbot to "keep this confidential" guarantees that the information is protected.**


*True/False · Beginner · topic `INFORMATION_HANDLING` · Responsible AI*

Answer: **False**. False. An instruction in a chat does not control how the provider processes or keeps data.

**12. Bahrain has a Personal Data Protection Law (PDPL) that sets rules for how organizations handle personal data.**


*True/False · Beginner · topic `INFORMATION_HANDLING` · Data Privacy*

Answer: **True**. True. For how it applies to a specific situation, ask your Data Protection Officer, legal or compliance team.

**13. If an AI tool is not approved, removing customer names makes it acceptable to paste a full customer spreadsheet into it.**


*True/False · Practical application · topic `INFORMATION_HANDLING` · Responsible AI*

Answer: **False**. False. Use only approved tools. Anonymizing helps only when you are allowed to use AI for the task.

**14. AI answers about legal or privacy questions should be checked with your Data Protection Officer, legal team or approved policies before you rely on them.**


*True/False · Beginner · topic `OTHER` · Responsible AI*

Answer: **True**. True. AI answers are not legal advice and can be wrong.

**15. A privacy mistake should be reported even if you are not sure whether harm was caused.**


*True/False · Beginner · topic `INCIDENT_REPORTING` · Data Privacy*

Answer: **True**. True. Report promptly; the responsible team will assess it.

### August 2027 — Keeping Work Secure Everywhere

Based on: Physical Security, Secure Remote Work. Period `2027-08`.

**1. Which habit protects your work both in the office and at home?**

- A. Locking your screen whenever you step away
- B. Leaving your laptop open for quick access
- C. Writing your password inside your notebook
- D. Sharing your badge with trusted colleagues

*Multiple choice · Beginner · topic `PHYSICAL_SECURITY` · Physical Security*

Answer: **A. Locking your screen whenever you step away**. Lock it when you leave it, wherever you work.

**2. After lunch you notice your access badge is missing. What should you do?**

- A. Wait until tomorrow in case it turns up
- B. Borrow a colleague's badge for the day
- C. Report it promptly so it can be dealt with
- D. Follow others through doors until you find it

*Multiple choice · Practical application · topic `PHYSICAL_SECURITY` · Physical Security*

Answer: **C. Report it promptly so it can be dealt with**. Prompt reporting stops a lost badge from being misused.

**3. While working on a train, how can you reduce the risk of someone reading your screen?**

- A. Increase the screen brightness
- B. Sit where others cannot easily see your screen, and avoid opening sensitive files
- C. Use a larger font
- D. Work faster

*Multiple choice · Beginner · topic `INFORMATION_HANDLING` · Secure Remote Work*

Answer: **B. Sit where others cannot easily see your screen, and avoid opening sensitive files**. Be aware of who can see your screen, and save sensitive work for a private space.

**4. A stranger at a conference offers you a free USB drive "with useful slides". What should you do?**

- A. Plug it into your work laptop at the hotel
- B. Plug it into a colleague's laptop
- C. Copy the slides into your personal cloud storage
- D. Do not connect it to work devices

*Multiple choice · Beginner · topic `USB_SECURITY` · Physical Security*

Answer: **D. Do not connect it to work devices**. Never connect unknown devices to work equipment.

**5. You are staying in a hotel on a work trip. Where should your work laptop be when you go to dinner?**

- A. With you, or locked away securely
- B. On the hotel room desk, unlocked
- C. With reception staff, unlocked
- D. Visible on the seat of your car

*Multiple choice · Practical application · topic `PHYSICAL_SECURITY` · Secure Remote Work*

Answer: **A. With you, or locked away securely**. Never leave work devices unattended or easy to take.

**6. What is the right way to connect to work systems from outside the office?**

- A. Over any public Wi-Fi without extra steps
- B. From a friend's computer
- C. Through your organization's approved remote-access method
- D. After disabling your device's security controls

*Multiple choice · Beginner · topic `OTHER` · Secure Remote Work*

Answer: **C. Through your organization's approved remote-access method**. Approved remote-access procedures are designed to protect information wherever you are.

**7. Why should you collect printouts from a shared printer promptly?**

- A. The printer may run out of paper
- B. Others could read or take confidential pages
- C. It helps the printer cool down
- D. Printouts fade after an hour

*Multiple choice · Beginner · topic `PHYSICAL_SECURITY` · Physical Security*

Answer: **B. Others could read or take confidential pages**. Unattended printouts can expose confidential information.

**8. Soon after working from a café, you get an alert about a sign-in to your work account that you did not make. What should you do?**

- A. Ignore it, because you used your account earlier
- B. Turn your laptop off and on again
- C. Wait until you are back in the office
- D. Report it promptly and follow the instructions you receive

*Multiple choice · Practical application · topic `INCIDENT_REPORTING` · Secure Remote Work*

Answer: **D. Report it promptly and follow the instructions you receive**. Unexpected sign-ins may mean someone else has your access. Report it wherever you are.

**9. What should you do with confidential documents when working from home?**

- A. Keep them secure and out of sight, and dispose of them using approved methods
- B. Leave them on the kitchen table
- C. Put them in the household bin
- D. Let family members use the backs of the pages

*Multiple choice · Beginner · topic `INFORMATION_HANDLING` · Secure Remote Work*

Answer: **A. Keep them secure and out of sight, and dispose of them using approved methods**. Paper needs the same protection at home as in the office.

**10. Someone in the car park asks you to hold the staff entrance door because their hands are full. What is the best response?**

- A. Hold the door, because it is polite
- B. Hold the door if they look like staff
- C. Politely explain that everyone must use their own access, and offer to direct them to reception
- D. Give them your badge

*Multiple choice · Beginner · topic `PHYSICAL_SECURITY` · Physical Security*

Answer: **C. Politely explain that everyone must use their own access, and offer to direct them to reception**. One badge, one person. Stay polite, and do not confront.

**11. Letting family members use your work device is acceptable if they are careful.**


*True/False · Beginner · topic `PHYSICAL_SECURITY` · Secure Remote Work*

Answer: **False**. False. Your work device and account are for your work only.

**12. Physical security only matters inside the office building.**


*True/False · Beginner · topic `PHYSICAL_SECURITY` · Physical Security*

Answer: **False**. False. Devices, papers and conversations need protecting wherever you work.

**13. If you cannot confirm whether a public Wi-Fi network is genuine, it is safer to wait or use an approved alternative than to guess.**


*True/False · Practical application · topic `OTHER` · Secure Remote Work*

Answer: **True**. True. Do not guess which network is real.

**14. Confidential conversations on speakerphone in public places can be overheard by others.**


*True/False · Beginner · topic `INFORMATION_HANDLING` · Secure Remote Work*

Answer: **True**. True. Take sensitive calls somewhere private.

**15. Security controls on a work laptop may be turned off while working from home.**


*True/False · Beginner · topic `OTHER` · Secure Remote Work*

Answer: **False**. False. Never bypass or switch off security controls, wherever you work.

### September 2027 — Recognize and Respond to Threats

Based on: Phishing Awareness, Reporting Security Incidents. Period `2027-09`.

**1. What is the safest first reaction to a suspicious email?**

- A. Click the link to check it
- B. Reply to the sender
- C. Forward it to colleagues
- D. Do not click or reply, and report it through the approved channel

*Multiple choice · Beginner · topic `PHISHING` · Phishing Awareness*

Answer: **D. Do not click or reply, and report it through the approved channel**. Do not interact with the message. Report it.

**2. You entered your password on a fake page and also approved an MFA prompt. What should you tell the security team?**

- A. Only that you clicked a link
- B. That you entered your password and approved a sign-in request
- C. Nothing, because MFA protects you
- D. Only the name of the website

*Multiple choice · Practical application · topic `INCIDENT_REPORTING` · Reporting Security Incidents*

Answer: **B. That you entered your password and approved a sign-in request**. Tell the team exactly what you did, so they can act on your account.

**3. What is the main goal of most phishing messages?**

- A. To get you to click, sign in, open a file, pay or share information
- B. To inform you about real system changes
- C. To test your typing speed
- D. To advertise genuine products

*Multiple choice · Beginner · topic `PHISHING` · Phishing Awareness*

Answer: **A. To get you to click, sign in, open a file, pay or share information**. Phishing tries to make you do something that helps the attacker.

**4. Which detail helps the security team most when you report a suspicious link you clicked?**

- A. The colour of the email
- B. Your opinion of the sender
- C. When you clicked it and whether you entered any information
- D. How many emails are in your inbox

*Multiple choice · Beginner · topic `INCIDENT_REPORTING` · Reporting Security Incidents*

Answer: **C. When you clicked it and whether you entered any information**. Say what happened, when, what was involved and what you did.

**5. Your phone keeps showing sign-in approval requests that you did not start. What should you do?**

- A. Approve one to make them stop
- B. Turn off your phone for the day
- C. Ignore them
- D. Deny the requests and report it promptly

*Multiple choice · Practical application · topic `MFA` · Reporting Security Incidents*

Answer: **D. Deny the requests and report it promptly**. Repeated requests may mean someone has your password and hopes you will tap "Approve".

**6. A message says: "Your account will be closed in 1 hour unless you verify now." Which warning sign is this?**

- A. A personalized greeting
- B. Urgency and threats
- C. A known sender
- D. A clear subject line

*Multiple choice · Beginner · topic `PHISHING` · Phishing Awareness*

Answer: **B. Urgency and threats**. Tight deadlines and threats are designed to rush you.

**7. Why should employees avoid investigating suspicious systems themselves?**

- A. They could disrupt operations or destroy information the security team needs
- B. Investigations take too long
- C. Systems cannot be investigated
- D. Only managers may look at computers

*Multiple choice · Beginner · topic `INCIDENT_REPORTING` · Reporting Security Incidents*

Answer: **A. They could disrupt operations or destroy information the security team needs**. Leave investigation to the authorized security team and follow their instructions.

**8. A colleague clicked a link in a suspicious email yesterday but was too embarrassed to report it. What should you encourage them to do?**

- A. Keep quiet, since it was yesterday
- B. Delete the email and forget about it
- C. Report it now through the approved channel; a late report is better than none
- D. Wait to see whether anything happens

*Multiple choice · Practical application · topic `INCIDENT_REPORTING` · Reporting Security Incidents*

Answer: **C. Report it now through the approved channel; a late report is better than none**. Reporting late is far better than not reporting at all.

**9. Where should security concerns be reported?**

- A. In a public social media post
- B. Through your organization's approved reporting channel
- C. Only to friends outside work
- D. By replying to the suspicious email

*Multiple choice · Beginner · topic `INCIDENT_REPORTING` · Reporting Security Incidents*

Answer: **B. Through your organization's approved reporting channel**. Approved channels make sure the right people receive the information.

**10. An email has a familiar logo and perfect grammar, but asks you to sign in through a link to keep your mailbox. What should you judge it by?**

- A. Its logo
- B. Its grammar
- C. Its colours
- D. The request it makes and whether you expected it

*Multiple choice · Beginner · topic `PHISHING` · Phishing Awareness*

Answer: **D. The request it makes and whether you expected it**. Judge the request, not the design.

**11. Several small reports from different employees can help reveal a wider attack.**


*True/False · Beginner · topic `INCIDENT_REPORTING` · Reporting Security Incidents*

Answer: **True**. True. Small warning signs matter.

**12. A message from a colleague's real email account is always safe, because their account cannot be misused.**


*True/False · Beginner · topic `PHISHING` · Phishing Awareness*

Answer: **False**. False. Accounts can be taken over and used to send convincing messages.

**13. If you deleted a suspicious email before reporting it, you should still report what happened.**


*True/False · Practical application · topic `INCIDENT_REPORTING` · Reporting Security Incidents*

Answer: **True**. True. Describe what you saw and did; the security team can still act.

**14. After reporting an incident, you should follow directions from the authorized security team.**


*True/False · Beginner · topic `INCIDENT_REPORTING` · Reporting Security Incidents*

Answer: **True**. True. Follow their instructions and answer follow-up questions through approved channels.

**15. Clicking "unsubscribe" in a suspicious email is a safe way to stop phishing messages.**


*True/False · Beginner · topic `PHISHING` · Phishing Awareness*

Answer: **False**. False. The unsubscribe link is still a link in a suspicious message. Report the email instead.

### October 2027 — Cybersecurity Awareness Challenge

Based on: Phishing Awareness, Safe Browsing, Data Privacy, Physical Security, Reporting Security Incidents, Secure Remote Work, Responsible AI. Period `2027-10`.

**1. Which situation is the strongest sign of phishing?**

- A. A known colleague sharing an agenda you asked for
- B. A newsletter you subscribed to
- C. An unexpected message urging you to sign in through a link within an hour
- D. A reminder of a meeting already in your calendar

*Multiple choice · Beginner · topic `PHISHING` · Phishing Awareness*

Answer: **C. An unexpected message urging you to sign in through a link within an hour**. Unexpected, urgent requests to sign in through a link combine several warning signs.

**2. What does HTTPS NOT tell you about a website?**

- A. Who owns or runs the website
- B. That the connection is encrypted
- C. That others on the network cannot easily read the traffic
- D. That the address begins with https

*Multiple choice · Beginner · topic `SAFE_BROWSING` · Safe Browsing*

Answer: **A. Who owns or runs the website**. HTTPS protects the connection but says nothing about who is behind the site.

**3. The QR code on a car park payment machine looks like a sticker placed over another code. What should you do?**

- A. Scan it and pay quickly
- B. Scan it and enter your card details only if the page has a padlock
- C. Peel it off and scan the code underneath
- D. Do not scan it; pay another trusted way and report it

*Multiple choice · Practical application · topic `SAFE_BROWSING` · Safe Browsing*

Answer: **D. Do not scan it; pay another trusted way and report it**. Stickers covering genuine codes are a common QR phishing trick.

**4. Which is the best example of sharing the minimum?**

- A. Sending the whole customer database so the recipient has everything
- B. Sending only the summary figures the recipient needs
- C. Copying the file to several USB drives
- D. Sharing your sign-in so they can find it themselves

*Multiple choice · Beginner · topic `INFORMATION_HANDLING` · Data Privacy*

Answer: **B. Sending only the summary figures the recipient needs**. Share only what the recipient needs for their work.

**5. Your email program auto-filled the wrong "Ahmed" as the recipient of customer details. You notice just before sending. What should you do?**

- A. Send it anyway; it is probably fine
- B. Send it and apologize later
- C. Correct the recipient before sending, checking every address
- D. Add both people to be safe

*Multiple choice · Practical application · topic `INFORMATION_HANDLING` · Data Privacy*

Answer: **C. Correct the recipient before sending, checking every address**. Check every recipient before you press Send.

**6. What is the correct general response to tailgating?**

- A. Politely decline to let others follow you through controlled doors, and report suspicious attempts
- B. Hold the door for anyone who is friendly
- C. Physically stop the person
- D. Ignore it if they are wearing a uniform

*Multiple choice · Beginner · topic `PHYSICAL_SECURITY` · Physical Security*

Answer: **A. Politely decline to let others follow you through controlled doors, and report suspicious attempts**. One badge, one person. Stay polite and safe, and report.

**7. Which item should you keep secure and never lend to anyone?**

- A. A pen
- B. A printed public brochure
- C. A meeting room booking
- D. Your access badge

*Multiple choice · Beginner · topic `PHYSICAL_SECURITY` · Physical Security*

Answer: **D. Your access badge**. Access badges show who is allowed where. Each person must use their own.

**8. You opened an unexpected attachment and your computer started behaving strangely. What should you do?**

- A. Run a cleaning tool you found online
- B. Stop, report it promptly, and follow the security team's instructions
- C. Restart it repeatedly
- D. Keep working and hope it stops

*Multiple choice · Practical application · topic `MALWARE` · Reporting Security Incidents*

Answer: **B. Stop, report it promptly, and follow the security team's instructions**. Do not try to fix it yourself. Report it and follow instructions.

**9. What does "Spot it. Report it. Protect everyone." mean?**

- A. Only security staff should report
- B. Report only confirmed attacks
- C. Notice suspicious things and report them promptly so harm can be limited
- D. Investigate before reporting

*Multiple choice · Beginner · topic `INCIDENT_REPORTING` · Reporting Security Incidents*

Answer: **C. Notice suspicious things and report them promptly so harm can be limited**. You do not need proof. Prompt reporting protects everyone.

**10. Which practice keeps information safe when working remotely?**

- A. Using approved remote-access and collaboration tools
- B. Emailing files to your personal account
- C. Saving files on a family computer
- D. Using unknown public Wi-Fi without checking

*Multiple choice · Beginner · topic `OTHER` · Secure Remote Work*

Answer: **A. Using approved remote-access and collaboration tools**. Keep work in approved systems wherever you are.

**11. You should report a lost work laptop only after checking every place you visited that week.**


*True/False · Beginner · topic `INCIDENT_REPORTING` · Secure Remote Work*

Answer: **False**. False. Report it immediately with when and where you last had it.

**12. If an AI answer includes a confident step-by-step explanation, you can skip checking it for important decisions.**


*True/False · Beginner · topic `OTHER` · Responsible AI*

Answer: **False**. False. Confident, detailed answers can still be wrong. Verify important decisions.

**13. A request that looks and sounds authentic on a video call can still be fake.**


*True/False · Practical application · topic `SOCIAL_ENGINEERING` · Responsible AI*

Answer: **True**. True. Verify unusual requests through a known, independent channel.

**14. Locking your screen and securing printed documents are part of protecting personal data.**


*True/False · Beginner · topic `INFORMATION_HANDLING` · Data Privacy*

Answer: **True**. True. Everyday habits prevent many privacy problems.

**15. EWAGuard AI's analysis can raise false alarms and can also miss real threats.**


*True/False · Beginner · topic `OTHER` · Responsible AI*

Answer: **True**. True. A LOW result does not guarantee safety, and official reporting still comes first.
