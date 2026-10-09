# Phase 4A — Employee portal

This phase adds frontend structure only. Existing cookie authentication, server-side
RBAC and administrator MFA are preserved; there are no database or backend changes.

## Routes and real data

All employee pages are nested beneath the existing EMPLOYEE route guard:

| Route | Page |
| --- | --- |
| `/` | Home; `/home` redirects here |
| `/assistant` | Ask EWAGuard AI |
| `/analyze/email` | Analyze Email |
| `/analyze/url` | Analyze URL |
| `/analyze/file` | Analyze File |
| `/password-security` | Password Security |
| `/incidents` | My Incidents |
| `/training` | My Training |
| `/monthly-quiz` | Monthly Quiz |
| `/certificates` | Certificates |
| `/community` | Security Community |
| `/profile` | Profile |

Home and Profile read the safe authenticated user held by AuthProvider, restored
from `/api/auth/me` or returned by login. Displayed fields are name, email, employee
identifier, department name, and a readable role label. No raw user object, internal
UUID, credentials, or MFA data are rendered. Home's API connection badge uses the
existing health endpoint; it is not a security posture or scanner status.

Administrators retain their separate navigation and `/admin` workspace. Frontend
guards are a usability layer, not a substitute for backend role and ownership checks.

## Preview boundaries

Shared components in `PortalPreview.jsx` provide preview notices, navigation cards,
feature outlines, a disabled upload area, and a sensitive-information reminder.
The reminder is explicitly a preview; active acknowledgement belongs to Phase 5B.

Email, URL and password entry controls are disabled. Upload previews have no file
input or upload handler. There are no scan requests, generated passwords, AI responses,
incident records, assigned courses, scores, certificates or published posts. The old
representative home-page percentage has been removed. Training progress is unavailable,
not zero. The community submission button opens an explanatory modal only.

Phase 8C replaces the Phase 4B assistant demonstration with authenticated backend
chat, PostgreSQL history, privacy acknowledgement, private analysis handoff and
human approvals. Synthetic chat layouts remain only in the design-system showcase.
See [chat interface](chat-interface.md) for workflow, security and verification limits.

## Accessibility and validation

The existing design system supplies labeled fields, badges, buttons, modal semantics
and reduced-motion styles. Portal cards retain visible keyboard focus. Native dialog
behavior traps focus in mobile navigation, supports Escape, and makes the background
inert. Desktop resizing closes the mobile menu. Route changes update the document
title, scroll to the top, and move focus to the main region. Profile values wrap on
narrow screens; responsive grids stack instead of forcing fixed-width columns.

`npm run test:portal` renders the actual route tree through Vite and React with
isolated session fixtures. It checks all twelve pages, navigation, anonymous/loading
states, employee/admin separation, disabled preview inputs and safe profile fields.
This is server rendering, not browser interaction or screenshot validation.

Phase validation also ran lint, build, backend syntax checks, all foundation/auth/
RBAC/MFA tests, database tests, vector tests, and diff checks. Live HTTP checks verify
employee login, session restoration, employee API access, admin API denial, logout,
and SPA entry URLs. Browser automation was unavailable in this session, so visual
layout, responsive interaction, focus behavior and browser-console checks still
need a browser pass.
