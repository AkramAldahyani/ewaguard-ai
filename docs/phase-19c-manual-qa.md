# Phase 19C manual visual QA — Chrome on Windows

Browser sign-off is pending. Use local, non-production employee and administrator accounts with non-sensitive test content. Open Chrome DevTools (F12), check Console for errors, and use responsive mode at 1440, 1024, 768, and 390 px. At each width, verify that all essential controls remain reachable without page-level horizontal scrolling. Mark each row after testing.

| Page or workflow | Widths (px) | Interactions to check | Expected visual and accessible behavior | Result |
| --- | --- | --- | --- | --- |
| Both portals: shell and navigation | 1440, 1024, 768, 390 | Tab from the address bar, use skip link, open/close mobile navigation with keyboard, change route, resize | Visible focus; one current navigation item; menu fits screen and restores focus; page heading and breadcrumbs remain readable | ☐ Pass ☐ Fail |
| Employee dashboard and AI assistant | 1440, 768, 390 | Open assistant, submit a harmless prompt, scroll messages, focus composer | Cards and chat messages wrap; composer remains usable; newest message is visible; loading/error feedback is clear | ☐ Pass ☐ Fail |
| Email, URL, file, concern, password | 1440, 768, 390 | Enter invalid/valid sample data, acknowledge disclaimer where required, upload a permitted dummy file, inspect results | Labels and errors are readable; no duplicate submission; severity, confidence, evidence, and actions are distinct; filenames and URLs wrap | ☐ Pass ☐ Fail |
| My Incidents, Training, course quiz, monthly quiz, certificates | 1440, 768, 390 | Filter/open records, move through quiz by keyboard, review submit confirmation, open certificate | Tables/cards remain reachable; quiz choices and feedback are clear; dialog traps focus and returns it on close | ☐ Pass ☐ Fail |
| Security Community | 1440, 768, 390 | Switch Feed/My posts/Create tabs, submit invalid draft, open/close dialog | Selected tab and panel correspond; errors are announced; post text wraps; no controls are clipped | ☐ Pass ☐ Fail |
| Admin dashboard, incidents and details | 1440, 1024, 768, 390 | Filter queue, open detail, inspect timeline/action panels, use confirmations | Metrics and status labels remain legible; table can scroll within its region; dialogs and actions stay reachable | ☐ Pass ☐ Fail |
| Security and awareness analytics | 1440, 1024, 768, 390 | Set invalid custom dates, apply valid filters, inspect charts and underlying tables | Date error is tied to inputs; charts have readable labels or data table; no chart or filter overflow | ☐ Pass ☐ Fail |
| Admin training, quizzes, certificates, incident awareness, community moderation | 1440, 1024, 768, 390 | Search/filter, open forms, review confirmation and success/error notices | Dense controls wrap or scroll locally; action state is clear; notices are readable; dialogs are keyboard operable | ☐ Pass ☐ Fail |
| Global accessibility preferences | 1440, 390 | Repeat key flows at 200% zoom and with Windows reduced motion enabled; navigate using Tab/Shift+Tab/Escape | Content remains operable; focus stays visible; motion is reduced; no essential information relies on color alone | ☐ Pass ☐ Fail |

Record the tested date, browser version, account role, console errors, and any failed row with route and viewport before visual sign-off.
