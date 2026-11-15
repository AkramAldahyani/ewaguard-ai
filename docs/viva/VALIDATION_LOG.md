# Investigation validation log

Date: 14 November 2026.

## Executed local tests

Command from repository root:

```text
node --test backend/tests/risk-engine.test.js
```

Observed exit code: 0. Tests: 13. Passed: 13. Failed: 0. Cancelled: 0. Skipped: 0. TODO: 0. Runner reported total duration approximately 889 ms.

Observed passing test names:

1. email matrix: benign, urgency, requests and independent phishing categories
2. email: forged header claims and repeated heuristics cannot produce CRITICAL
3. URL matrix: structural heuristics, reputation, critical corroboration and TLS
4. VirusTotal uses counts and ratio; overlapping URL/domain reports do not add
5. freshness: stale, absent and future dates limit confidence and critical eligibility, not erase detections
6. file matrix: scanner strength, consensus, coverage and contradictions
7. file: demo rules, duplicate scanner IDs, mismatches and limited archive coverage
8. all exact risk thresholds and invalid score inputs
9. general invariants, stable reason codes, recommendation policy, no mutation and order independence
10. malformed consumed evidence rejected safely; extra client risk fields ignored
11. audit-compatible minimized persistence and fixed explanation privacy
12. risk modules have only local pure imports: no network, AI, secrets, process, files or database access
13. confirmed credential exposure raises a stored email/URL risk to CRITICAL deterministically

The test file was read before execution. It uses controlled synthetic provider/scanner evidence; these passes are not live provider, malware-scanner, database, API, browser or Socket.IO results. One test invokes local email parsing. The purity test reads risk-module source. No application file was written by the documentation commands; policy-table generation imported the pure policy module and wrote only a Markdown file in docs/viva.

## Deliberately not executed

- Database resets, migrations, seed/provisioning or cleanup scripts.
- Server startup (it invokes cleanup and starts retention workers).
- Paid AI requests, live threat-intelligence queries or external security scans.
- Full integration suite, browser demonstrations, builds or schema formatting.
- Any remediation or source changes.

The repository had many pre-existing tracked modifications and two untracked Prettier configuration files. This investigation does not attribute those changes to itself and does not claim a clean repository. Only documentation files under docs/viva were intentionally created.

## Evidence scope

See the checklist for unreviewed areas. Function/line references in the report point into the current working tree, which may differ from committed documentation and can change after this checkpoint. No measured detection accuracy, EWA production result, user study, legal compliance certification or academic marking assessment was established.

## Documentation checks executed

A local Node read-only check inspected all five generated Markdown files: code-fence counts were balanced and all relative Markdown-file links resolved. Zero problems were reported. The main partial report contained approximately 6,500 whitespace-delimited words. `git status --short -- docs/viva` reported the new documentation directory as untracked. These checks do not validate Mermaid rendering or certify completeness of technical coverage.
