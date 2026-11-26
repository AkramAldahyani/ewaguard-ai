# File analyzer

## In short

**Analyze File** (`/analyze/file`) has two separate tools:

1. **Upload a file.** The server validates it, computes its SHA-256 fingerprint, scans it locally with **ClamAV** and **YARA**, looks up the fingerprint on **VirusTotal**, and the [risk engine](risk-engine.md) scores everything.
2. **Check a SHA-256 hash.** Paste a 64-character fingerprint. Only VirusTotal reputation is checked; nothing is uploaded or scanned.

**The file itself is never sent to VirusTotal or any other outside service.**
Only its SHA-256 fingerprint is looked up. Uploaded content is never executed,
opened or previewed.

## Uploading a file, step by step

```text
signed in / employee / trusted origin / rate limit
  → receive one file (max 10 MiB)
  → check extension, claimed type and real content signature; inspect ZIP structure
  → compute SHA-256
  → write a private temporary copy
  → ClamAV scan → YARA scan → delete the temporary copy (always)
  → VirusTotal lookup of the SHA-256 (GET only)
  → risk engine → save minimized record → incident if HIGH/CRITICAL
```

## Allowed file types

Defined once in `shared/file-policy.js` (used by both frontend and backend):

- Documents: PDF, DOC/XLS/PPT, DOCX/XLSX/PPTX, TXT, CSV
- Images: PNG, JPG/JPEG, GIF, WEBP, BMP
- Archives: ZIP
- Programs and scripts (inspection only): EXE, DLL, PS1, JS, VBS, BAT, CMD, SH, PY

Everything else is rejected, including disk images, other archive formats,
HTML/SVG, shortcuts and macro-enabled Office formats like DOCM.

## Validation

- The extension and the claimed type are compared with the file's actual **byte signature**. A mismatch (for example a Windows program renamed `invoice.pdf`) is accepted for scanning and recorded as strong evidence.
- Text files must really be text. Empty files and unknown binary formats are rejected.
- Double extensions and odd filename characters are recorded.
- The original filename is **not** kept; results show "Submitted file.pdf".
- ZIP files are inspected **without extracting**: up to 200 entries, 50 MiB declared size, 100:1 compression ratio, 1 second. It records encryption, unsafe paths, executables, nested archives and macro entries.

## The temporary copy

- Stored under the system temp folder in `ewaguard-ai-file-analysis`, outside the project.
- Each analysis gets its own random-named folder and file, with private permissions.
- The folder is **always deleted** when scanning ends, successfully or not. If deletion fails, the result is not saved.
- On startup, leftover folders older than 24 hours (for example after a crash) are removed.

## ClamAV

- Set `CLAMAV_PATH` to the full path of the ClamAV scanner program.
- Run safely: no shell, a minimal environment (no secrets), 60-second limit, limited output.
- Container limits: 10 MiB per file, 50 MiB total, 200 files, 8 levels deep, 30 seconds.
- Results: `CLEAN` (no known detection, **not** "safe"), `DETECTED`, `ERROR`, `TIMEOUT`, `UNAVAILABLE`.
- Keeping virus signatures up to date is the operator's job.

## YARA

- Set `YARA_PATH` (program) and optionally `YARA_RULES_PATH`. In development the rules default to the project's own folder `backend/security/yara/`.
- The five project rules look for: encoded PowerShell chains, credential-theft markers, auto-run macros that launch programs, archive-then-launch patterns, and a **harmless demo rule** for safe demonstrations. See [`backend/security/yara/README.md`](../backend/security/yara/README.md).
- 15-second limit. Matched strings are never printed. Descriptions and strength (STRONG / WARNING / DEMO) come from the project catalog.
- Results: `MATCH`, `NO_MATCH`, `ERROR`, `TIMEOUT`, `UNAVAILABLE`. NO_MATCH only means the small rule set did not match.

If ClamAV or YARA are not installed, they show `UNAVAILABLE`. A clean result is
never invented. (Community image uploads, however, are **refused** unless both
scanners are available; see [community](community.md).)

## VirusTotal hash lookup

- `GET /api/v3/files/{sha256}` only. No upload, no "rescan", no request body.
- A missing report returns `NO_REPORT` and never triggers an upload.
- Shares limits and cache with the URL analyzer (4 lookups per minute, 10-minute cache).
- The hash itself is shared with VirusTotal; the page explains this.

## Check a SHA-256 hash (no upload)

`POST /api/analysis/file/hash` with `{ "sha256": "..." }` (uppercase and spaces are tidied).

| Result | Meaning |
| --- | --- |
| `DETECTIONS_REPORTED` | One or more engines flagged the file. The risk engine decides how serious that is. |
| `NO_KNOWN_DETECTION` | A report exists with no detections. This is **not** proof of safety. |
| `UNKNOWN` | No usable report (not found, not configured, rate limited, ...). |

Each lookup is saved in `file_analyses` with kind `HASH_LOOKUP` (size and type
empty, ClamAV and YARA `NOT_SCANNED`). Hash checks **never create incidents**,
because only reputation was checked. In analytics they appear as **"SHA-256 check"**.

## Provisional finding

- **Highly Suspicious**: ClamAV detection, a STRONG YARA match, or 5+ VirusTotal malicious votes.
- **Suspicious**: type/extension/filename/archive warnings, any YARA match, or 2+ provider votes.
- **No Strong Indicators**: otherwise.
- Scanner failures add **Partial evidence**.

The final level always comes from the risk engine.

## What is saved

Owner, SHA-256, size, extension, normalized type, scanner statuses, minimized
evidence and the risk result. **Not saved:** filename, file bytes, document text,
matched strings or raw scanner/provider output. Records expire after 30 days by default.

## Limits and concurrency

10 MiB per file, 5 submissions per employee per minute, 2 analyses at once per
server, 30-second upload deadline, one active process per scanner.

## Safe demonstration

- **YARA:** upload a text file containing both markers of the `EWAGuard_Harmless_Demo` rule to show a live MATCH without real malware.
- **ClamAV:** the standard harmless EICAR test file triggers a detection.

## Code and tests

- `backend/src/analyzers/file/`, `backend/src/routes/file-analysis.js`, `shared/file-policy.js`
- `frontend/src/features/file/`
- Tests (scanners and provider mocked; no malware used): `npm run test:file`, `npm run test:file:api`, `npm run test:file:ui`, `frontend/tests/hash.test.mjs`, `backend/tests/hash-analysis.test.js`
- Optional live checks: `node backend/scripts/validate-file-local.js` (local scanners) and, with the app running, `node backend/scripts/validate-file-runtime.js`

## Production advice

Run patched scanners under a dedicated low-privilege account with operating-system
resource limits, and protect the temporary folder.
