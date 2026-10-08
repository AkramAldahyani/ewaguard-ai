# Phase 6C — File Analyzer

> Phase 7A integration: completed submissions now include server-computed
> `result.risk` and persist score, severity, model version and confidence/reasons.
> Analyzer-local findings below remain unchanged. See [Central Risk Engine](risk-engine.md).
> References to excluded final risk describe the original Phase 6 scope.


`/analyze/file` is operational for authenticated employees. This phase adds secure
file intake, validation, hashing, local scanners, hash reputation, minimized storage,
and evidence presentation. It does not add the Phase 7A central risk engine, final
severity, OpenAI, incidents, Socket.IO, RAG, or awareness functionality.

## Architecture and API

```text
Authentication / EMPLOYEE RBAC / trusted origin / rate limit
  -> current FILE_ANALYSIS acknowledgement
  -> bounded single-file multipart parsing
  -> extension / MIME / signature / archive metadata inspection
  -> SHA-256
  -> private random temporary copy
  -> ClamAV -> YARA -> finally: delete temporary directory
  -> VirusTotal SHA-256 GET lookup
  -> deterministic provisional evidence
  -> atomic minimized database insert -> employee response
```

`POST /api/analysis/file` accepts `multipart/form-data` with exactly one `file` part.
Unknown text fields, additional files, and differently named file parts are rejected.
No client-supplied user ID or acknowledgement ID is accepted. The backend queries
the current-version FILE_ANALYSIS acknowledgement owned by the authenticated employee;
it must be no more than 15 minutes old and not future-dated. Authentication, role,
origin and acknowledgement checks precede multipart buffering. Administrators cannot
use this route. All responses carry Cache-Control: no-store. There is no file
download, preview, or analysis-history endpoint.

The envelope is consistent with the email/URL analyzers:

```text
analysisId, createdAt, result:
  analyzer: FILE, version: 6C.1,
  file: displayName, extension, size, detectedType, mimeType, sha256,
  validation, clamav, yara, threatIntelligence,
  indicators, coverage, provisionalClassification, recommendations, limitations
```

## Supported types and bounded validation

The shared policy in `shared/file-policy.js` sets the maximum to **10 MiB** and
defines the frontend/backend extension list:

- PDF; legacy DOC/XLS/PPT (OLE container); DOCX/XLSX/PPTX (ZIP container).
- TXT/CSV, PNG/JPG/JPEG/GIF/WEBP/BMP, ZIP.
- EXE/DLL and PS1/JS/VBS/BAT/CMD/SH/PY, accepted for inspection only.

All other extensions are rejected, including disk images, unknown archives,
HTML/SVG, shortcuts, and macro-specific Office extensions such as DOCM. No uploaded
content is executed, passed to shell handlers, opened as a document, or previewed.

Original extension and untrusted MIME are compared with byte signatures. Text must
decode as UTF-8 or BOM-marked UTF-16 without binary controls. An octet-stream MIME
is treated as unspecified rather than an automatic mismatch. MIME mismatch is
evidence, not authority. Recognizable alternate content (for example, MZ/PE bytes
named invoice.pdf) is accepted for scanning and produces mismatch evidence.
Unknown binary formats and empty files are rejected. Double extensions and filename
path/control patterns are recorded as booleans. Original filenames are omitted from
server results and storage; display names are fixed `Submitted file.<extension>`.

Type recognition is intentionally not a full structural validator. PDF-like and
executable-like test headers can be recognized without being valid documents/programs.
Polyglot files and disguised content remain limitations.

ZIP metadata uses lazy central-directory inspection through `yauzl`, without
extracting or decompressing entries. It is limited to 200 entries, 50 MiB declared
expanded size, 100:1 per-entry declared compression ratio, and one second. It records
counts and flags for encryption, unsafe paths, launcher/executable extensions,
nested archives and macro-related entries. Raw entry names/comments are discarded.
DOCX/XLSX/PPTX are approximated from content-type and expected document entry names.
Invalid/over-limit metadata produces explicit incomplete-inspection evidence;
local scanners can still examine the uploaded container within their own limits.
Archive metadata is untrusted; declared sizes and names are not proof of actual content.

## Temporary-file lifecycle

Uploads are buffered only after authorization and acknowledgement, with two active
upload/analysis slots and a 10 MiB Multer limit (bounded to roughly 20 MiB upload
buffers, plus parser/scanner working memory). Disk copies are created only after
upload validation and metadata inspection succeed.

The dedicated root is `ewaguard-ai-file-analysis` under the operating system's
temporary directory, outside the repository/frontend dev-server serving scope.
Each analysis receives a UUID directory and separate UUID `.upload` filename.
Directories use mode 0700 and exclusive file creation uses mode 0600 where supported.
POSIX root ownership is checked. Windows inherits the service user's directory ACL;
deployment must restrict that account's temp directory appropriately. Original names
never influence paths, command arguments or directory choices.

The temp store rejects symlink roots and verifies the canonical root. Cleanup can
only remove direct UUID children of that root. ClamAV's own temporary output is
directed into the same per-analysis directory. A finally block removes the entire
job directory on success or failure, retrying transient filesystem errors. Buffers
are zeroed where retained by application code; garbage-collected copies cannot be
guaranteed erased. Copies are deleted before provider lookup and database insertion.

Cleanup failure emits a fixed metadata-only operational event, returns a sanitized
failure, and prevents persistence. It never silently claims cleanup succeeded.
On application startup, a best-effort sweep removes matching directories older than
24 hours; unrelated entries, fresh jobs and symlinks are left alone. Crashes/power
loss cannot execute finally blocks, so startup cleanup is a fallback, not immediate
secure erasure. Operational administrators must monitor cleanup failures. A disk
filesystem deletion does not guarantee physical erasure from backups or storage media.

## ClamAV

`CLAMAV_PATH` is a backend-only absolute executable path. The application uses
`execFile` with an argument array, shell disabled, hidden windows, a 60-second
process deadline, SIGKILL on timeout and 64 KiB maximum output per stream. Scanner
children receive a minimal environment, excluding API keys/JWT/database secrets.
Relative executable paths and script wrappers are not accepted.

The scan uses local signatures and limits container scanning to 10 MiB per file,
50 MiB total, 200 files, eight recursion levels and 30 seconds of engine scanning.
Symlink following is disabled. Limits/encryption alerts are enabled so skipped
contents do not silently become a clean finding. These alerts are coverage errors,
not malware names. A confirmed detection can coexist with limited coverage.

Exit 0 without a scan error maps to CLEAN; exit 1 with detections maps to DETECTED;
exit 2/invalid output maps to ERROR. Missing/inaccessible executables map to
UNAVAILABLE; the process deadline maps to TIMEOUT. Only bounded, validated detection
identifiers are returned. Raw stdout/stderr, command lines and system paths are
discarded. CLEAN means no known detection by that scan, never that a file is safe.
Signature installation, updates and freshness remain operator responsibilities.

[Official ClamAV scanning documentation](https://docs.clamav.net/manual/Usage/Scanning.html)

## YARA

`YARA_PATH` and `YARA_RULES_PATH` remain backend-only. Development defaults an empty
rules setting to the project-owned `backend/security/yara` directory; production
requires an explicit absolute file/directory. The application never downloads rule
packs. See [rules, ownership and review process](../backend/security/yara/README.md).

YARA has a 15-second process deadline, a ten-second engine timeout and a per-rule
string limit. It compiles configured source on every invocation. Invalid syntax
returns ERROR without crashing the server. No matched strings or arbitrary rule
metadata are printed: output consists only of names and the generated target path,
which is removed during normalization. Descriptions/strength come from a project
catalog. Statuses are NO_MATCH, MATCH, UNAVAILABLE, ERROR and TIMEOUT.

The curated rules cover combined PowerShell encoding markers, credential-store /
decryption / transfer markers, automatic macros with shell launch markers, archive
expansion/launch combinations, and an explicit harmless demo signature. They can
match legitimate scripts or discussions of techniques. YARA sees raw bytes only;
compressed/encoded/macro content may not be visible.

[Official YARA command-line documentation](https://yara.readthedocs.io/en/stable/commandline.html)

## VirusTotal hash-only lookup

**EWAGuard AI uses SHA-256 reputation lookup only. The uploaded file is not submitted
to VirusTotal by this analyzer.**

The Phase 6B adapter now exposes `lookupFileHash(sha256)`, validates exactly 64 hex
characters, and issues GET `/api/v3/files/{sha256}` to the fixed VirusTotal host.
There is no upload, submission, or rescan operation and no request body. A missing
report returns NO_REPORT; it never triggers upload. The file hash itself discloses
a fingerprint to the provider; the acknowledgement flow explains this.

Normalized counts, reputation, last-analysis date, provider/scope/status and cache
flag are retained. Names, file descriptions, raw provider JSON, analysis-engine
strings and API keys are excluded. The URL and file routes share one adapter/cache
and quota budget per application: two provider requests concurrently, four per
minute, ten-minute report/no-report cache, 30-second failure cache, 256 entries,
60-second 429 cooldown, 3.5-second request deadline and 512 KiB response limit.
Daily/plan quotas still apply; multiple deployment processes would need coordinated
quotas. NOT_CONFIGURED, NO_REPORT, RATE_LIMITED, TIMEOUT, UNAUTHORIZED, malformed
responses and outages preserve useful local evidence.

[Official VirusTotal file-report endpoint](https://docs.virustotal.com/reference/file-info)

## Classification and coverage

This is an analyzer-local rubric, not Phase 7A risk scoring:

- HIGHLY_SUSPICIOUS: ClamAV detection, a project-catalog STRONG YARA match, or five
  or more VirusTotal malicious detections.
- SUSPICIOUS: a type/double-extension/filename/archive warning, any YARA match
  (including explicitly labeled demo matches), or at least two combined provider
  malicious/suspicious detections.
- NO_STRONG_INDICATORS: otherwise. An executable/script type, unspecified or
  mismatched MIME, or one weak provider vote alone does not establish maliciousness.

Local scanner failures/coverage limits produce PARTIAL_EVIDENCE even if no strong
indicators exist. Missing external reputation is displayed separately. Unavailable
tools do not produce fabricated clean results. Recommendations are fixed application
guidance; no OpenAI request or automatic incident creation occurs.

## Persistence

The existing FileAnalysis table is reused without a migration. A single atomic insert
stores authenticated ownership, current acknowledgement relation, SHA-256, size,
extension, normalized MIME, normalized scanner statuses, fixed metadata and minimized
result JSON. `storageKey` is null and `deletedAt` records completed temporary cleanup.
Original filename, file bytes, document text, matching strings, raw scanner/provider
output and secrets are not stored. No content-extraction pipeline is introduced.

Existing ScanStatus enums map CLEAN/NO_MATCH to NO_KNOWN_DETECTION, MATCH/DETECTED
to DETECTED, TIMEOUT/ERROR to ERROR, and unavailable to UNAVAILABLE. Detailed states
remain in result JSON. Phase 7A fills `riskScore`, `severity`, and `riskRuleVersion`; `evidence.risk` includes confidence and reasons.
An expiresAt value marks 30-day evidence retention; an automated evidence-deletion
worker is not part of this phase. The pgvector schema and HNSW index are unchanged.

## Errors, concurrency, and UI

Five submissions per employee per minute and two application analysis slots bound
upload workload. Each scanner permits one active process and one waiter; slots
remain held until work finishes, even after client disconnect. Uploads have a
30-second deadline; expiry destroys the request connection. The frontend then shows
a safe retry error. Scanner processes have their own timeouts and no unbounded
waiting queue. Database and unexpected errors use the existing sanitized handler.

The employee sees an unchecked acknowledgement before a labeled keyboard-accessible
picker/drag-and-drop form, allowed extensions, 10 MiB guidance, selected name/size/
extension, remove and Analyze controls. A general scanning state describes implemented
work without inventing current-stage progress. Reset/unmount aborts the browser
request and ignores late results; server cleanup continues independently.

Nine result sections show summary, file information, validation, ClamAV, YARA,
hash reputation, indicators, recommendations, and limitations. React escapes text;
no object URL, document preview, iframe, image load or download action is created.

## Validation

Normal tests mock local scanner/provider responses; they never call VirusTotal or
require installed ClamAV/YARA. Small harmless Node child processes verify timeout
termination and output limits. Fixtures are synthetic text, PDF/PE-like headers and
small ZIP metadata structures; no malware or EICAR is used or committed.

```powershell
npm.cmd run test:file
npm.cmd run test:file:api
npm.cmd run test:file:ui
# Explicit live checks only:
node backend/scripts/validate-file-local.js
# Start npm run dev first; uses one benign hash lookup and disposable employee:
node backend/scripts/validate-file-runtime.js
```

On 2026-10-07, all requested regression suites, lint, build, backend checks, Prisma
validation, migration status and dependency audit passed. The backend suite includes
234 passing tests. Database/vector checks verify the HNSW index remains intact.
Live ClamAV returned CLEAN, benign YARA NO_MATCH, demo YARA MATCH and invalid rules
ERROR. Live employee login/acknowledgement/upload returned NO_REPORT for the harmless
file hash without uploading the file to VirusTotal; oversized rejection, minimized
storage, temporary cleanup and logout passed. Disposable records/files were removed.
React rendering/state tests passed. No browser was connected for visual/console QA.

Known operational limits: minimal rules, no full document validation, no forced
memory/process sandbox for native scanners, scanner signature freshness, encrypted
or nested content coverage, single-process quotas, and a frontend bundle-size warning.
Production should run patched scanners under a dedicated unprivileged account with
OS/container resource limits and controlled writable storage.
