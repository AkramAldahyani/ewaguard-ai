// Training Content Phase TC4: human-authored Secure Remote Work course.
// Plain text using the lesson conventions described in phishing-awareness.js.
// All people and places are fictional. No specific VPN, remote-access product, device-management
// tool, permission rule, reporting contact or incident procedure is assumed.

export const secureRemoteWorkCourse = {
  title: 'Secure Remote Work',
  description: 'Stay secure wherever you work. Learn how to protect organizational information, devices and accounts when you work outside the office or connect to work systems remotely.',
  topic: 'OTHER',
  learningObjectives: [
    'Identify common remote-working risks.',
    'Secure laptops and mobile devices.',
    'Use networks and remote access safely.',
    'Protect confidential information outside the workplace.',
    'Respond appropriately to lost devices and suspicious activity.',
  ],
  estimatedMinutes: 9,
  requiresQuiz: true,
  content: { version: 1, sections: [
    { key: 'why-remote-security-matters', title: 'Lesson 1: Why remote work security matters', body: `Working from home, a site office, a hotel or a café can be convenient. But the information you work with is just as valuable outside the office, and there are fewer people and controls around to protect it.

Outside the office, common risks include:
- people nearby reading your screen or listening to your calls
- devices left unattended for "just a minute"
- unfamiliar networks you cannot fully trust
- the temptation to use shortcuts, such as personal email or unapproved apps

That is why your organization's approved remote-access procedures matter. They are designed to keep information protected wherever you are.

Example: The busy café
Salman, a fictional employee, opens a confidential project report on his laptop in a crowded café. The people at the next table can easily see his screen, and he takes a phone call about the project while sitting there.
The safer alternative: Salman works on non-sensitive tasks in the café and saves the confidential report for a private space. If he must open it, he sits with his back to a wall, keeps the document on screen only as long as needed, and takes the call somewhere he cannot be overheard. A privacy screen filter can also help, where one is provided.

Key takeaway: Information needs the same protection outside the office. Be aware of who can see, hear or reach your work.` },
    { key: 'protecting-work-devices', title: 'Lesson 2: Protecting your work devices', body: `Your work laptop and phone are the doorway to work systems. If someone else can use them, they can use your access.

Protect your devices:
- Lock your screen every time you step away. On Windows devices, Windows key + L locks it instantly. Other devices have their own lock shortcut or button, so learn yours.
- Never leave devices unattended in public places or visible in a parked car.
- Use strong sign-in protection and the multi-factor authentication (MFA) your organization has approved. Never share MFA codes.
- Keep software updated through your organization's approved processes.
- Do not install software, apps or browser extensions that have not been approved.
- Do not let family members, friends or colleagues use your work device or account.
- Report lost or stolen equipment promptly.

Example: The family laptop
Dana, a fictional employee, is asked by her teenage son to borrow her work laptop "just to check something online". It feels harmless, but anything he downloads or clicks could affect work systems, and everything he does would be linked to Dana's account.
The safer response: Dana politely says no. The work laptop is for her work only.

Tip: Quick device checklist
1. Is my screen locked when I step away?
2. Is my device with me or locked away?
3. Am I using only approved software and updates?
4. Is my device for my use only?

Key takeaway: Treat your work device like your office key. Lock it, keep it with you, and use it only for approved work.` },
    { key: 'wifi-and-networks', title: 'Lesson 3: Staying safe on Wi-Fi and networks', body: `Public Wi-Fi in cafés, hotels and airports is convenient, but you usually cannot tell who runs it or who else is connected. A criminal can create a network with a convincing name, such as "Airport Free WiFi" or "Hotel Guest", and watch or redirect the traffic of anyone who joins.

Network safety basics:
- A convincing network name does not prove a network is genuine.
- Confirm the network name and password with a trusted source, such as hotel staff or an official sign, before connecting.
- Use your organization's approved remote-access method when connecting to work systems. Where your organization requires a VPN or other secure connection, always use it.
- If you are unsure about a network, a trusted alternative, such as an approved mobile hotspot, may be safer where your organization allows it.
- Never try to bypass or switch off security controls on a work device, even if they slow you down.

Example: Two similar networks
In a hotel lobby, Yusuf, a fictional employee, sees two networks: "Grand_Hotel_Guest" and "Grand Hotel Guest Free". Both are open, and both look plausible.
The safer approach: Yusuf does not guess. He asks the front desk which network is the hotel's and how to sign in. If he cannot confirm it, he waits, or uses an approved alternative, before connecting to work systems.

Watch out: A secure connection has limits
An approved VPN or secure connection protects the data travelling between your device and work systems. It does not make a harmful website safe, stop you from entering your password on a fake page, or clean a device that already has harmful software.

Key takeaway: Do not trust a network by its name. Confirm it with a trusted source, use approved remote access, and never bypass security controls.` },
    { key: 'protecting-information-remotely', title: 'Lesson 4: Protecting confidential information', body: `Outside the office, information can leak through conversations, screens, paper and quick shortcuts.

Protect information wherever you work:
- Avoid discussing confidential matters in public places, on speakerphone or where others can overhear.
- Check your surroundings before opening sensitive files or joining video calls, including what is visible behind you.
- Keep printed documents with you or locked away, and dispose of them using approved methods, not a household bin.
- Do not save work files in personal cloud storage or on personal devices unless your organization's policy allows it.
- Use your organization's approved collaboration and file-sharing applications.
- Check recipients carefully before you share anything.

Example: Finishing it at home
Aisha, a fictional employee, wants to finish a report over the weekend. Her plan is to email it from her work account to her personal email address and work on it on her home computer.
Why this may be inappropriate: once the document is in a personal account, the organization can no longer protect it. Personal accounts and home computers may be shared, less secure, or compromised, and the report may contain information that should not leave approved systems.
The safer approach: Aisha checks what her organization's policy allows. She uses the approved remote-access method or approved collaboration application to work on the document, or asks her line manager or IT team for an approved option.

Key takeaway: Keep work information in approved systems. Personal email, personal cloud storage and personal devices are not shortcuts unless your organization's policy says so.` },
    { key: 'remote-work-checklist', title: 'Lesson 5: Remote work safety checklist', body: `Secure remote work comes down to a few habits, plus knowing what to do when something goes wrong.

If something goes wrong:
- A work laptop or phone is lost or stolen: report it immediately through your organization's approved channel, with when and where you last had it.
- You see an unusual sign-in alert or activity you did not do: report it promptly and follow the instructions you receive.
- A message asks for your remote-access credentials, VPN details or MFA codes: do not reply or enter anything. Report it. Genuine IT teams will not ask for your password or codes.
- You think organizational information may have been exposed, such as a document left on a train or sent to the wrong person: report it promptly, even if you are not sure.

Watch out: Do not wait until you are back in the office
Report problems as soon as you notice them, wherever you are. Delays give attackers more time.

Your remote work checklist:
- Secure your device: lock it, keep it with you, use it only for work.
- Use approved remote access: confirm networks and never bypass security controls.
- Protect your screen and surroundings: watch who can see and hear.
- Share only through approved channels: no personal email or unapproved cloud storage.
- Report suspicious activity promptly, through approved channels.

Key takeaway: Wherever you work, the same rules apply. Secure it, check it, share it safely, and report it fast.

Next, complete the short five-question quiz below to finish the course.` },
  ] },
};

export const secureRemoteWorkQuiz = {
  title: 'Secure Remote Work quiz',
  passingPercent: 80,
  maxAttempts: 3,
  questions: [
    { type: 'MULTIPLE_CHOICE', points: 1,
      text: 'You are working on your laptop in a busy café and need to collect your order from the counter. What should you do?',
      explanation: 'Never leave a work device unattended in a public place. Take it with you, and lock the screen whenever you step away.',
      options: [
        { text: 'Leave it on the table, because you will be back in a minute.', isCorrect: false },
        { text: 'Ask a stranger at the next table to watch it.', isCorrect: false },
        { text: 'Lock the screen and take the laptop with you.', isCorrect: true },
        { text: 'Close the lid but leave it on the table.', isCorrect: false },
      ] },
    { type: 'MULTIPLE_CHOICE', points: 1,
      text: 'At a hotel you see two open networks with almost identical names. You need to connect to work systems. What is the safer approach?',
      explanation: 'A convincing name does not prove a network is genuine. Confirm it with a trusted source, such as hotel staff, and use your organization\'s approved remote-access method.',
      options: [
        { text: 'Join the one with the stronger signal.', isCorrect: false },
        { text: 'Confirm the correct network with hotel staff, then connect using your organization\'s approved remote-access method.', isCorrect: true },
        { text: 'Try both and use whichever loads pages faster.', isCorrect: false },
        { text: 'Turn off your device\'s security settings so the connection is faster.', isCorrect: false },
      ] },
    { type: 'MULTIPLE_CHOICE', points: 1,
      text: 'You want to work on a confidential document at home over the weekend. Which option is most appropriate?',
      explanation: 'Keep work information in approved systems. Personal email and personal cloud storage take the document outside the organization\'s protection unless policy allows it.',
      options: [
        { text: 'Email it to your personal email address.', isCorrect: false },
        { text: 'Upload it to your personal cloud storage.', isCorrect: false },
        { text: 'Copy it to a personal USB drive.', isCorrect: false },
        { text: 'Use your organization\'s approved remote-access or collaboration tools, or ask IT for an approved option.', isCorrect: true },
      ] },
    { type: 'TRUE_FALSE', points: 1,
      text: 'True or false: When you are connected through an approved VPN, it is safe to enter your password on any website, because the VPN protects you.',
      explanation: 'False. A VPN protects data travelling between your device and work systems. It does not make a fake website genuine or stop you from giving your password away.',
      options: [{ text: 'True', isCorrect: false }, { text: 'False', isCorrect: true }] },
    { type: 'TRUE_FALSE', points: 1,
      text: 'True or false: If your work laptop is lost while you are travelling, you should report it immediately through your organization\'s approved channel rather than waiting until you are back in the office.',
      explanation: 'True. Prompt reporting lets the responsible team act before the device or its access can be misused.',
      options: [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }] },
  ],
};
