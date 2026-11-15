// Training Content Phase TC3: human-authored Physical Security course.
// Plain text using the lesson conventions described in phishing-awareness.js.
// All people and places are fictional. No organization-specific access-control, badge,
// visitor, disposal or emergency procedure or contact is assumed.

export const physicalSecurityCourse = {
  title: 'Physical Security',
  description:
    'Protecting our workplace and information. Learn why physical security matters, how to protect your desk and computer, how to handle badges, visitors and tailgating, how to look after devices and documents, and what to do when something looks wrong.',
  topic: 'PHYSICAL_SECURITY',
  learningObjectives: [
    'Explain why physical security matters for cybersecurity.',
    'Protect your workspace and computer when you step away.',
    'Recognize unauthorized-access risks such as tailgating.',
    'Handle documents, devices and removable media safely.',
    'Report suspicious physical-security situations through approved channels.',
  ],
  estimatedMinutes: 9,
  requiresQuiz: true,
  content: {
    version: 1,
    sections: [
      {
        key: 'why-physical-security-matters',
        title: 'Lesson 1: Why physical security matters',
        body: `Cybersecurity is not only about computers and the internet. If someone can walk up to an unlocked computer, pick up a printed report or carry away a laptop, they may not need to hack anything at all.

Physical security means protecting the places, equipment and paper where information lives:
- offices, meeting rooms and restricted areas
- computers, laptops, phones and storage devices
- printed documents, notebooks and whiteboards
- access badges and keys

Example: Five quiet minutes
At a fictional regional office, a cleaner's trolley props open a side door during lunch. A stranger walks in, finds an empty desk with an unlocked computer and a printed staff list, takes a photo of both, and leaves. Nobody notices. No firewall or antivirus could have stopped it.

Small habits close these gaps. Locking a screen, challenging a propped door through the right channel, or putting papers away takes seconds, and every employee can do it.

Key takeaway: Physical access can be just as dangerous as a cyberattack. Everyone shares responsibility for protecting the workplace.`,
      },
      {
        key: 'lock-screen-protect-desk',
        title: 'Lesson 2: Lock your screen and protect your desk',
        body: `An unlocked computer gives anyone who sits down your access: your email, your files and the systems you can use. Anything they do will look like it was done by you.

Protect your workspace:
- Lock your computer every time you step away, even for a minute. On Windows, press the Windows key + L.
- Never write passwords on sticky notes, under keyboards or in notebooks left on your desk.
- Put printed documents away when you leave your desk, and collect printouts promptly.
- Do not leave sensitive information visible in shared or public areas, including screens, whiteboards and meeting rooms.
- Store and dispose of documents using your organization's approved methods.

Example: The meeting that ran long
Hassan, a fictional employee, rushes to a meeting and leaves his computer unlocked with a customer report open. The meeting runs for an hour. During that time, anyone passing his desk could read the report or send an email from his account.
The safer alternative: before standing up, Hassan presses Windows + L. His work stays exactly where he left it, and nobody else can use it.

Tip: Make it automatic
Lock your screen whenever you stand up, the same way you would lock your car. After a few days it becomes a habit you do without thinking.

Key takeaway: Lock it when you leave it. Keep passwords off your desk and sensitive papers out of sight.`,
      },
      {
        key: 'badges-visitors-tailgating',
        title: 'Lesson 3: Badges, visitors and tailgating',
        body: `Access badges show who is allowed where. Controlled doors only work if each person uses their own badge.

Tailgating is when someone follows an authorized person through a controlled door without using their own access. It is one of the simplest ways to get into a building, and it usually relies on politeness: most people do not want to seem rude by letting a door close on someone.

Why friendly is not the same as authorized:
- A uniform, a lanyard, a hi-vis vest or a box of supplies can be bought or borrowed.
- Confidence and a good story ("I'm from the contractor, I'm running late") are common tricks.
- You cannot tell from appearance whether someone is allowed in a restricted area.

Example: The forgotten badge
Noor, a fictional employee, reaches a controlled-access door with her coffee. A friendly man in a contractor jacket smiles and says: "Morning! I left my badge in the car, can I just follow you in? My meeting starts now."
It feels rude to say no. But Noor does not know who he is or whether he is allowed in.
The safer response: Noor stays polite and calm. She says she cannot let anyone in without their own access, and directs him to reception or the visitor process to get help. She does not argue or try to stop him physically. If he insists, follows anyway or something feels wrong, she reports it straight away through the approved security channel, noting the time, place and a short description.

Watch out: Stay safe
Your job is to notice and report, not to confront. Never put yourself at risk to stop someone.

Tip: Visitors
Follow your organization's approved visitor procedures. If you are hosting a visitor, stay responsible for them while they are on site.

Key takeaway: One badge, one person. Politely decline to let others follow you through controlled doors, and report suspicious access attempts.`,
      },
      {
        key: 'devices-and-documents',
        title: 'Lesson 4: Protecting devices and documents',
        body: `Laptops, phones, USB drives and paper documents can all carry sensitive information. If they are lost, stolen or tampered with, that information can be exposed.

Look after devices and documents:
- Never leave a work laptop or phone unattended in a car, café or public space. Lock it away when you are not using it.
- Do not plug unknown USB drives, chargers or other devices into work equipment.
- Use only approved storage devices, and keep them secure.
- Do not leave confidential papers unattended on desks, printers or meeting tables.
- Store and dispose of devices and documents using your organization's approved methods.
- If you lose an access badge, laptop, phone or storage device, report it immediately, even if you think it might turn up later.

Example: The USB drive in the corridor
Fatima, a fictional employee, finds a USB drive labelled "Salary review - confidential" on the floor near the lifts. She is curious and wants to find out who it belongs to.
Why it is risky: a found USB drive is a well-known trick. It may contain harmful software that runs as soon as it is connected, and the tempting label is designed to make people plug it in.
The safer response: Fatima does not plug it into any computer, not even to look for the owner's name. She hands it over or reports it through the approved IT or security channel and lets them deal with it.

Watch out: Curiosity is the trap
Never test an unknown device yourself to see what is on it. Reporting it is the helpful thing to do.

Key takeaway: Keep devices and papers secure, never connect unknown devices, and report anything lost or found straight away.`,
      },
      {
        key: 'when-something-looks-suspicious',
        title: 'Lesson 5: What to do when something looks suspicious',
        body: `You do not need to be sure something is wrong before you speak up. Take safe, reasonable action and report your concern through your organization's approved security channels.

Common situations:
- An unfamiliar person in a restricted area: do not confront them. Note what you saw and report it promptly.
- You have lost your access badge: report it straight away so it can be dealt with.
- A colleague's workstation is unlocked and showing information: do not use it or read it. Let them know, or report it if it keeps happening.
- A work laptop or phone is lost or stolen: report it immediately and say when and where you last had it.
- Confidential documents are left unattended: do not read them. Return them to the owner or secure them as your procedures allow, and report it if needed.

In an emergency where people are in danger, follow your organization's emergency procedures first.

Your physical security checklist:
- Lock your screen whenever you step away.
- Keep passwords off your desk and papers out of sight.
- Use your own badge, and do not let others follow you through controlled doors.
- Never connect unknown USB drives or devices.
- Keep laptops, phones and documents secure, on site and away.
- Report anything lost, found or suspicious promptly.

Key takeaway: Notice, stay safe, and report. Quick reports help protect people, equipment and information.

Next, complete the short five-question quiz below to finish the course.`,
      },
    ],
  },
};

export const physicalSecurityQuiz = {
  title: 'Physical Security quiz',
  passingPercent: 80,
  maxAttempts: 3,
  questions: [
    {
      type: 'MULTIPLE_CHOICE',
      points: 1,
      text: 'You need to step away from your desk for a quick five-minute conversation down the corridor. What should you do with your computer?',
      explanation:
        'Lock it every time you step away, even briefly. On Windows, press the Windows key + L. An unlocked computer lets anyone act as you.',
      options: [
        { text: 'Leave it unlocked, because you will only be gone for five minutes.', isCorrect: false },
        { text: 'Lock it before you leave, for example with Windows key + L.', isCorrect: true },
        { text: 'Turn the monitor off but leave the computer unlocked.', isCorrect: false },
        { text: 'Ask the person at the next desk to keep an eye on it.', isCorrect: false },
      ],
    },
    {
      type: 'MULTIPLE_CHOICE',
      points: 1,
      text: 'At a controlled-access door, a friendly person you do not recognize says they forgot their badge and asks to follow you in. What is the best response?',
      explanation:
        'Politely decline and direct them to reception or the approved visitor process. Do not confront them. Report it through the approved channel if they persist or something seems wrong.',
      options: [
        { text: 'Let them in, because they seem friendly and are wearing a work jacket.', isCorrect: false },
        { text: 'Physically block the door until they leave.', isCorrect: false },
        {
          text: 'Politely decline, direct them to reception or the visitor process, and report it if they persist or something seems wrong.',
          isCorrect: true,
        },
        { text: 'Lend them your badge so they can get in on their own.', isCorrect: false },
      ],
    },
    {
      type: 'MULTIPLE_CHOICE',
      points: 1,
      text: 'You find an unlabelled USB drive in the office car park. What should you do?',
      explanation:
        'Unknown devices can carry harmful software that runs when connected. Do not plug it in anywhere. Hand it over or report it through the approved IT or security channel.',
      options: [
        { text: 'Plug it into your work computer to find out who owns it.', isCorrect: false },
        { text: 'Plug it into a home computer instead, to protect the work network.', isCorrect: false },
        { text: 'Keep it as a spare storage device.', isCorrect: false },
        {
          text: 'Do not connect it to anything; hand it over or report it through the approved channel.',
          isCorrect: true,
        },
      ],
    },
    {
      type: 'TRUE_FALSE',
      points: 1,
      text: 'True or false: It is acceptable to leave confidential printed documents on a shared printer or meeting-room table if you plan to come back for them later.',
      explanation:
        'False. Unattended papers can be read, photographed or taken. Collect printouts promptly and keep confidential documents secured.',
      options: [
        { text: 'True', isCorrect: false },
        { text: 'False', isCorrect: true },
      ],
    },
    {
      type: 'TRUE_FALSE',
      points: 1,
      text: 'True or false: If you lose your access badge or work laptop, you should report it immediately, even if you think it might turn up later.',
      explanation: 'True. Prompt reporting lets the responsible team act before a lost badge or device can be misused.',
      options: [
        { text: 'True', isCorrect: true },
        { text: 'False', isCorrect: false },
      ],
    },
  ],
};
