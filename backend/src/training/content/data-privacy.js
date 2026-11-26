// Training Content Phase TC2: human-authored Data Privacy course.
// Plain text using the lesson conventions described in phishing-awareness.js.
// All people, accounts and domains are fictional. Lesson 4 is deliberately high-level awareness:
// it states no PDPL obligations, deadlines, penalties, consent rules or exceptions, and no
// EWA data-classification scheme or procedure. See docs/training-courses.md.

export const dataPrivacyCourse = {
  title: 'Data Privacy',
  description:
    "Protecting personal and confidential information. Learn what personal and confidential information looks like at work, how to handle and share it safely, why Bahrain's Personal Data Protection Law matters, and what to do when a privacy mistake happens.",
  topic: 'INFORMATION_HANDLING',
  learningObjectives: [
    'Explain what personal information is and why organizations must protect it.',
    'Recognize personal and confidential information in everyday work.',
    'Handle, store and share information safely using approved systems.',
    "Describe at a high level why Bahrain's Personal Data Protection Law (PDPL) matters at work.",
    'Respond safely to everyday privacy mistakes and report suspected privacy incidents promptly.',
  ],
  estimatedMinutes: 9,
  requiresQuiz: true,
  content: {
    version: 1,
    sections: [
      {
        key: 'what-is-data-privacy',
        title: 'Lesson 1: What is data privacy?',
        body: `Personal information is any information about an identifiable person. That includes obvious details such as a name, phone number or ID number, and also details that point to someone when combined, such as an address together with a meter reading history.

Data privacy means handling that information carefully: collecting only what is needed, using it only for the right purpose, sharing it only with the right people, and keeping it secure.

Example: Information you might see at work
- A customer's name, address and phone number on a service request.
- A household's account number, billing history or payment status.
- A colleague's leave record or contact details in an HR file.
- A contractor's copy of an identity document for site access.
All of these examples use fictional people, but real versions of them pass through a utility organization every day.

Why it matters:
- For customers and colleagues: misused information can lead to fraud, embarrassment, unwanted contact or loss of trust.
- For the organization: privacy mistakes can damage its reputation and may have legal and regulatory consequences.
- For you: careful handling protects the people who rely on you and shows professional integrity.

Key takeaway: Personal information belongs to the people it describes. Use it only for the job in front of you, and protect it as you would want your own information protected.`,
      },
      {
        key: 'recognizing-sensitive-information',
        title: 'Lesson 2: Recognizing sensitive information',
        body: `You cannot protect information if you do not notice it. Sensitive information is not always labelled, so learn to recognize it.

Examples of information that usually needs protection:
- Customer names, addresses, phone numbers and email addresses.
- Customer account details, such as account numbers, consumption history, billing and payment information.
- Employee records, such as salaries, performance notes, medical or leave information, and personal contact details.
- Identity documents, such as ID cards, passports and residence permits.
- Internal organizational documents that are not meant for the public.
- Passwords, verification codes and other sign-in details, which should never be shared with anyone.
- Confidential operational information, such as details about facilities, networks and systems that could help someone cause harm.

Example: Hidden in plain sight
A fictional spreadsheet named "Visit list - Tuesday" looks harmless. Inside it are 40 customer names, home addresses, phone numbers and notes such as "elderly, lives alone". That is a lot of sensitive personal information in one file.

Watch out: Different information, different rules
Not all information is handled the same way. Some may be shared widely, while some must be restricted to specific people or systems. Follow your organization's approved data-handling and classification policies. If you are not sure how something should be handled, ask your line manager or the responsible team before sharing it.

Key takeaway: If information identifies a person, could help someone cause harm, or is not meant for the public, treat it as sensitive and handle it according to approved policies.`,
      },
      {
        key: 'handling-information-safely',
        title: 'Lesson 3: Handling information safely',
        body: `Most privacy problems are not caused by hackers. They come from everyday shortcuts, such as a rushed email, a file saved in the wrong place or a document left on a printer.

Everyday safe-handling habits:
- Share information only with people who are authorized and need it for their work.
- Check every recipient before you press Send, especially when your email program fills in names automatically.
- Share only what is needed. Remove columns, pages or attachments the recipient does not need.
- Avoid unnecessary copies and downloads, including copies on your desktop or a USB drive.
- Use approved storage and sharing systems, not personal email or personal cloud accounts.
- Lock your screen whenever you step away from your computer.
- Collect printed documents promptly, keep them out of sight, and dispose of them using approved methods.

Example: The customer report
Mariam, a fictional employee, is preparing a report on overdue water bills for a meeting with an external contractor. Her draft spreadsheet includes customer names, phone numbers, account numbers and payment histories. She is about to email the whole file to the contractor's personal email address because it is quicker.
Why it is risky: the contractor only needs the number of overdue accounts by area, not personal details. A personal email account is not an approved channel, and the full file could be forwarded, lost or misused.
The safer decision: Mariam removes all personal details and shares a summary by area. If the contractor genuinely needs personal data for their work, she checks with her line manager that the sharing is authorized and uses the organization's approved sharing method.

Tip: Before you share, ask
1. Does this person need this information for their work?
2. Am I sharing only what they need?
3. Am I using an approved channel?

Key takeaway: Share the minimum, with the right people, through approved systems. When in doubt, ask before you send.`,
      },
      {
        key: 'data-privacy-in-bahrain',
        title: 'Lesson 4: Data privacy in Bahrain',
        body: `Bahrain has a Personal Data Protection Law, often called the PDPL. It sets rules for how organizations collect, use, store and share personal data, with the aim of protecting the privacy of individuals.

You do not need to be a legal expert to do your part. At an awareness level, a few principles matter in everyday work.

What this means for you:
- Personal data deserves protection. Customers and colleagues trust the organization with their information.
- Access should serve an authorized work purpose. Looking up a neighbour's account, a relative's bill or a colleague's file out of curiosity is not a work purpose, even if your system access allows it.
- Follow your organization's approved data-handling policies. They explain how the organization applies its legal obligations in practice.
- Escalate suspected privacy incidents promptly. Organizations may have legal and regulatory responsibilities when personal data is lost, exposed or misused, so the right people need to know quickly.

Watch out: This lesson is not legal advice
This course gives general awareness only. It does not set out the law's detailed requirements. For questions about how the PDPL applies to a specific situation, contact your organization's Data Protection Officer, legal team or compliance team through approved channels.

Tip: Learning more
EWAGuard AI's PDPL assistant can help explain general provisions with references to its source material. Its answers are guidance only and do not replace advice from your Data Protection Officer or legal team.

Key takeaway: Use personal data only for authorized work purposes, follow approved policies, and escalate privacy concerns quickly.`,
      },
      {
        key: 'everyday-privacy-decisions',
        title: 'Lesson 5: Everyday privacy decisions',
        body: `Here are five common situations and the safe general response to each. Always follow your organization's approved procedures where they give more detail.

Example: You receive a document meant for someone else
Do not open more than you need to recognize the mistake, and do not forward it. Let the sender know, delete it if they ask you to, and report it if it contains personal or confidential information.

Example: You sent a customer record to the wrong person
Act straight away. Report it promptly through your organization's approved reporting channel, even if you have already asked the recipient to delete it. Do not try to hide the mistake. Early reporting helps limit harm.

Example: Confidential papers are visible on a desk
Do not read them. If they are yours, put them away or lock them up. If they belong to someone else, let them or your line manager know so they can be secured.

Example: You want to use an AI tool to summarize a work document
Do not upload work documents, customer data or internal information into AI tools or websites that your organization has not approved. Information you enter may be stored or used outside the organization's control. Use only approved tools, and follow their guidance on what can be shared.

Example: A colleague asks you to send a file through a personal messaging app
Use the organization's approved sharing systems instead. If the approved system is not working, ask IT or your line manager for an approved alternative.

Your privacy checklist:
- Recognize personal and confidential information.
- Access only what you need for your work.
- Share the minimum, with authorized people, through approved systems.
- Never put work data into unapproved apps, cloud storage or AI tools.
- Lock your screen and secure printed documents.
- Report privacy mistakes and suspected incidents promptly.

Key takeaway: Mistakes can happen to anyone. Hiding them makes them worse, and reporting them quickly makes them smaller.

Next, complete the short five-question quiz below to finish the course.`,
      },
    ],
  },
};

export const dataPrivacyQuiz = {
  title: 'Data Privacy quiz',
  passingPercent: 80,
  maxAttempts: 3,
  questions: [
    {
      type: 'MULTIPLE_CHOICE',
      points: 1,
      text: 'Which of the following is personal information?',
      explanation:
        "A customer's name together with their account number and home address identifies a specific person. Aggregated statistics and published public information do not identify an individual.",
      options: [
        { text: 'The total number of service requests received last month.', isCorrect: false },
        { text: "A customer's name, account number and home address.", isCorrect: true },
        { text: "The organization's published office opening hours.", isCorrect: false },
        { text: 'The average water consumption for a whole region.', isCorrect: false },
      ],
    },
    {
      type: 'MULTIPLE_CHOICE',
      points: 1,
      text: 'An external contractor asks you to email a spreadsheet of customer contact details to their personal email address because it is faster. What should you do?',
      explanation:
        'Share only what is needed, only with authorized people, and only through approved systems. Check that the sharing is authorized, and never use personal email for work data.',
      options: [
        { text: 'Send it, because the contractor is working for the organization.', isCorrect: false },
        { text: 'Send it, but add a password to the file.', isCorrect: false },
        {
          text: 'Confirm what they actually need and that sharing is authorized, then share only the minimum through an approved system.',
          isCorrect: true,
        },
        { text: 'Upload it to your personal cloud storage and send them the link.', isCorrect: false },
      ],
    },
    {
      type: 'MULTIPLE_CHOICE',
      points: 1,
      text: "You realize you have just emailed a customer's account details to the wrong external recipient. What is the best next step?",
      explanation:
        'Report it promptly through the approved reporting channel, even if you have also asked the recipient to delete it. Early reporting lets the right people assess and limit harm.',
      options: [
        {
          text: 'Report it promptly through the approved reporting channel, even if you also ask the recipient to delete it.',
          isCorrect: true,
        },
        { text: 'Do nothing, because the recipient will probably ignore it.', isCorrect: false },
        { text: 'Ask the recipient to delete it and keep the mistake to yourself.', isCorrect: false },
        { text: 'Delete the message from your Sent folder so there is no record.', isCorrect: false },
      ],
    },
    {
      type: 'TRUE_FALSE',
      points: 1,
      text: "True or false: It is fine to paste a customer complaint, including the customer's name and account number, into any public AI chatbot to help write a reply.",
      explanation:
        "False. Work documents and customer data should only be entered into tools your organization has approved. Information entered into unapproved tools may be stored or used outside the organization's control.",
      options: [
        { text: 'True', isCorrect: false },
        { text: 'False', isCorrect: true },
      ],
    },
    {
      type: 'TRUE_FALSE',
      points: 1,
      text: 'True or false: If you notice that customer information may have been exposed, you should report it promptly through approved channels, even if you are not sure it is a real incident.',
      explanation:
        'True. You do not need to be certain. Prompt reporting lets the responsible team assess the situation and act in time.',
      options: [
        { text: 'True', isCorrect: true },
        { text: 'False', isCorrect: false },
      ],
    },
  ],
};
