// Training Content Phase TC4: human-authored Responsible AI course.
// Plain text using the lesson conventions described in phishing-awareness.js.
// All people are fictional. No organization-approved AI tool list, data-classification rule or
// reporting contact is assumed. Lesson 5 describes EWAGuard AI as implemented and as stated in its
// own notices (backend/src/ai/chat-policy.js, shared/file-policy.js, docs/url-analyzer.md,
// docs/password-security.md, docs/incident-engine.md). It deliberately claims no PDPL or
// company-policy document retrieval and no confidentiality guarantee.

export const responsibleAiCourse = {
  title: 'Responsible AI',
  description:
    'Use AI wisely. Protect information. Learn what AI assistants can and cannot do, how to protect information when using AI, why AI answers must be checked, how attackers use AI in scams, and how to use EWAGuard AI within its limits.',
  topic: 'OTHER',
  learningObjectives: [
    'Explain what AI assistants can and cannot reliably do.',
    'Recognize the risks of sharing information with AI services.',
    'Verify AI-generated information before relying on it.',
    'Recognize AI-assisted scams and misleading content.',
    'Use EWAGuard AI within its documented limitations.',
  ],
  estimatedMinutes: 9,
  requiresQuiz: true,
  content: {
    version: 1,
    sections: [
      {
        key: 'what-is-ai',
        title: 'Lesson 1: What is AI and how can it help?',
        body: `AI assistants are computer programs trained on very large amounts of text. They predict useful-sounding answers to your questions. They can be fast and helpful, but they do not truly understand your situation, and they can be wrong.

AI can help you:
- explain an unfamiliar word or idea in simple language
- summarize information that is not confidential
- improve the wording of an email or short document
- understand cybersecurity terms
- get general security-awareness tips

Example: What does phishing mean?
Jassim, a fictional employee, keeps hearing the word "phishing" in meetings. He asks an AI assistant to explain it simply. It tells him that phishing is a fake message that tries to trick people into clicking links, opening attachments or sharing passwords. Jassim now understands the idea, and he knows to follow his organization's training and procedures for what to actually do.

Watch out: Helpful is not the same as correct
AI can produce answers that sound confident but contain mistakes. It is a helper, not an authority.

Key takeaway: AI is a useful assistant for general explanations and writing help. Treat its answers as a starting point, not the final word.`,
      },
      {
        key: 'protecting-data-with-ai',
        title: 'Lesson 2: Protecting data when using AI',
        body: `When you type or paste something into an AI service, it is usually sent to the provider's systems to be processed. Depending on the service and how it is set up, the provider may keep that information for a period of time. You may not control who can access it or how long it is stored.

Never enter these into AI tools unless your organization has explicitly approved that tool and that use:
- passwords or MFA verification codes
- API keys or other secret keys
- personal information about customers or colleagues
- customer records or account details
- confidential internal documents
- restricted operational information, such as details of facilities, networks or systems
- security incident evidence

Example: The customer spreadsheet
Latifa, a fictional employee, has a spreadsheet of customer names, account numbers and overdue balances. She wants to paste it into a free AI chatbot to get a quick summary for her manager.
Why it is risky: the spreadsheet contains personal and confidential information. Once pasted, it leaves the organization's protected systems and may be stored by an external provider.
The safer approach: Latifa uses only AI tools her organization has approved, and follows its data-handling rules. If she is allowed to use AI for this task, she removes names and account numbers first, or she writes the summary herself.

Tip: Ask before you paste
1. Is this tool approved for work use?
2. Does this text contain anything personal, confidential, secret or restricted?
3. Could I achieve the same result with general or anonymized information?

Key takeaway: If you would not post it on a public noticeboard, do not paste it into an unapproved AI tool.`,
      },
      {
        key: 'ai-not-always-correct',
        title: 'Lesson 3: AI is helpful, but not always correct',
        body: `AI assistants generate answers that sound right. They do not check facts the way a careful person would.

AI can:
- give incorrect information
- misunderstand your question or leave out important context
- invent details, rules, sources or references that do not exist
- sound completely confident while being wrong

Example: The confident wrong answer
Badr, a fictional employee, receives a document that asks him to "Enable content". He asks a general AI chatbot whether this is safe. It replies confidently: "Yes, this is standard for business documents. Enabling content is safe if the file came by email."
That advice is wrong for an unexpected document. Enabling content in an unexpected file is a common way harmful software runs. Badr remembers his training, does not enable anything, and reports the file through the approved channel.

Important decisions about security, privacy, money, legal matters or operations need independent verification. Check them against trusted organizational resources, such as approved policies, your IT or security team, or your line manager.

Tip: Before you rely on an AI answer
1. Is this decision important or hard to undo?
2. Does the answer match what I know from training and approved policies?
3. Can I confirm it with a trusted person or official source?
4. If the AI mentions a rule, policy or reference, does it actually exist?

Key takeaway: Confident is not the same as correct. Verify important AI answers before you act on them.`,
      },
      {
        key: 'ai-powered-scams',
        title: 'Lesson 4: AI-powered scams and social engineering',
        body: `Attackers use AI too. It helps them create convincing scams quickly, in good grammar and in many languages.

Attackers may use AI to create:
- polished phishing emails with no spelling mistakes
- fake chat or text messages in a familiar style
- impersonations of managers, colleagues or suppliers
- voice messages or calls that sound like a real person
- misleading images or videos
- urgent requests for money, data or access

A message that looks or sounds authentic is not proof that it is genuine. You may not be able to spot AI-generated voices, images or videos just by looking or listening. Focus on the request instead.

Example: The urgent voice message
Mona, a fictional employee, receives a voice message that sounds exactly like a senior manager. It says: "I'm about to go into a meeting with the minister. Send me the confidential contract figures on my personal number straight away. Don't tell anyone, it's sensitive."
Warning signs: urgency, secrecy, a personal number and a request for confidential information.
The safer response: Mona does not reply to that number. She verifies the request through a known, independent channel, such as the manager's official number from the directory, or by checking with the manager's office. She reports the message through the approved channel.

Key takeaway: Verify the request, not the voice. Use a known, independent channel before sending money, data or access.`,
      },
      {
        key: 'using-ewaguard-ai-responsibly',
        title: 'Lesson 5: Using EWAGuard AI responsibly',
        body: `EWAGuard AI is designed to help you make safer decisions. Like any tool, it has limits.

What EWAGuard AI can help with:
- Ask EWAGuard AI: answers general cybersecurity questions and can help explain analysis results.
- Analyze Email, Analyze URL and Analyze File: run the available security checks and show a risk level (LOW, MEDIUM, HIGH or CRITICAL), the reasons behind it and suggested next steps.
- Password Security: checks password strength and generates strong passwords in your browser. The password is not sent to EWAGuard AI's servers.
- When an analysis result is HIGH or CRITICAL, EWAGuard AI records an incident for review by the security team, and you can follow it under My Incidents.

How your information is handled:
- Ask EWAGuard AI sends your messages and recent conversation context to an external AI provider (OpenAI) to generate answers. As its notice explains, the provider may retain data for abuse prevention, and your conversations remain in your history under the retention policy.
- The URL analyzer does not visit the website you submit, but may check the link's reputation with an external service.
- The file analyzer looks up the file's fingerprint (a SHA-256 hash). The file itself is not uploaded to that external service.
- Read each notice and disclaimer before you submit, and acknowledge it only if your content is appropriate.

Know the limits:
- AI answers can be inaccurate.
- Automated analysis can raise false alarms and can miss real threats.
- A LOW-risk result does not guarantee that something is safe.
- Do not submit passwords, codes, confidential or restricted information, or anything the disclaimers tell you to keep out.
- The official incident-reporting process always comes first. EWAGuard AI does not replace it.
- EWAGuard AI supports your judgment. It does not replace it.

Your Responsible AI checklist:
1. Use only approved AI tools for work.
2. Keep passwords, codes, personal and confidential information out of AI tools.
3. Verify important AI answers with trusted sources.
4. Verify urgent requests through a known, independent channel.
5. Report concerns through the approved channel, even when a tool says the risk is low.

Key takeaway: Use AI wisely, protect information, and keep a human in charge of the decision.

Next, complete the short five-question quiz below to finish the course.`,
      },
    ],
  },
};

export const responsibleAiQuiz = {
  title: 'Responsible AI quiz',
  passingPercent: 80,
  maxAttempts: 3,
  questions: [
    {
      type: 'MULTIPLE_CHOICE',
      points: 1,
      text: 'Which of these is safe to enter into a public AI chatbot that your organization has not approved?',
      explanation:
        'Only general, non-confidential questions belong in unapproved AI tools. Never enter passwords, codes, customer data or confidential documents.',
      options: [
        { text: 'A spreadsheet of customer names and account numbers.', isCorrect: false },
        { text: 'Your password, so it can check whether it is strong.', isCorrect: false },
        { text: 'A general question such as "What is multi-factor authentication?"', isCorrect: true },
        { text: 'An internal incident report, so it can summarize it.', isCorrect: false },
      ],
    },
    {
      type: 'MULTIPLE_CHOICE',
      points: 1,
      text: 'An AI assistant confidently tells you a specific security rule and quotes a policy number you have never heard of. What should you do?',
      explanation:
        'AI can invent rules and references. Verify important guidance with trusted organizational resources before acting on it.',
      options: [
        { text: 'Follow it, because the answer sounds confident and detailed.', isCorrect: false },
        { text: 'Verify it with approved policies or your IT or security team before acting.', isCorrect: true },
        { text: 'Share it with colleagues so everyone follows the new rule.', isCorrect: false },
        { text: 'Ask the same AI again; if it repeats the answer, it must be correct.', isCorrect: false },
      ],
    },
    {
      type: 'MULTIPLE_CHOICE',
      points: 1,
      text: 'You receive a voice message that sounds exactly like your director, urgently asking you to send confidential figures to a personal number. What is the safest response?',
      explanation:
        'Voices can be imitated with AI. Verify the request through a known, independent channel and report it. Do not rely on how the voice sounds.',
      options: [
        { text: 'Send the figures, because you recognize the voice.', isCorrect: false },
        { text: 'Reply to the personal number to ask whether it is really them.', isCorrect: false },
        { text: 'Verify the request through a known, independent channel and report it.', isCorrect: true },
        { text: 'Send only part of the figures to be safe.', isCorrect: false },
      ],
    },
    {
      type: 'TRUE_FALSE',
      points: 1,
      text: 'True or false: If EWAGuard AI rates a link as LOW risk, the link is guaranteed to be safe.',
      explanation:
        'False. Automated analysis can miss real threats. A LOW result means the available checks found little evidence of risk, not that the link is guaranteed safe.',
      options: [
        { text: 'True', isCorrect: false },
        { text: 'False', isCorrect: true },
      ],
    },
    {
      type: 'TRUE_FALSE',
      points: 1,
      text: "True or false: Using EWAGuard AI to analyze a suspicious email does not replace reporting it through your organization's approved incident-reporting channel.",
      explanation:
        'True. EWAGuard AI supports your judgment, but the official incident-reporting process always comes first.',
      options: [
        { text: 'True', isCorrect: true },
        { text: 'False', isCorrect: false },
      ],
    },
  ],
};
