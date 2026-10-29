# SHA-256 reputation lookup

The File Analysis page includes a separate **Check a SHA-256 hash** section.
Employees can paste a 64-character hexadecimal fingerprint without uploading
file contents. Uppercase and surrounding whitespace are normalized.

`POST /api/analysis/file/hash` accepts only `{ "sha256": "..." }`.
The route uses existing session authentication, employee authorization,
trusted-origin checks, shared file-analysis rate/concurrency limits, bounded
JSON parsing and no-store responses.

The existing VirusTotal adapter performs a GET for a previously known file
report. No file is uploaded, downloaded, opened, executed or locally scanned.
The shared adapter retains its timeouts, cache, quota and fixed-host/no-redirect
protections. The existing configured VirusTotal API key is required.

The response distinguishes:

- `DETECTIONS_REPORTED`: one or more malicious or suspicious provider votes.
  This is reputation evidence; vote strength is evaluated by the central risk
  engine, not inferred by the UI or an LLM.
- `NO_KNOWN_DETECTION`: a usable report has zero malicious/suspicious votes.
  This does not establish safety.
- `UNKNOWN`: absent, empty, unavailable or unusable report. Provider status
  explains missing configuration, rate limits and other coverage gaps.

The central FILE risk model receives reputation evidence only. ClamAV, YARA,
file type and contents remain unassessed. Provider counts and report date are
shown alongside explicit limitations.

Each completed lookup is saved in `file_analyses` with kind `HASH_LOOKUP`, the
authenticated employee, timestamp, hash, provider status and authoritative risk.
Unknown/unavailable reports remain explicitly marked UNKNOWN in the saved evidence;
their risk score is the central engine's limited-evidence assessment, not a safety verdict.
Size, MIME and extension are NULL; ClamAV and YARA remain NOT_SCANNED. Existing
uploads retain kind UPLOAD and their required metadata via a database constraint.

Admin totals, severity distributions, daily activity and recent analyses include
these records. The type breakdown and recent table label them **SHA-256 check**,
separately from uploaded files. Aggregation never returns the hash or provider
payload. The same existing administrator/MFA access controls apply.

The browser supplies an in-memory `Idempotency-Key`. Retries reuse the key after
ambiguous failures, returning the original owned result with no duplicate count.
Different deliberate checks are separate records. Hash receipts are replayed
without creating an incident; automatic incident behavior is unchanged.
The hash is disclosed to VirusTotal and can identify a file, as stated before
submission. Records follow existing file-analysis retention.

Migration `20261020000100_file_hash_analysis_records` adds the kind column and
permits unknown metadata only for hash checks. Past transient checks were never
stored and cannot be backfilled; new lookups are recorded after deployment.

## Implementation

- `backend/src/analyzers/file/hash-analysis.js`: validation and deterministic reputation projection.
- `backend/src/routes/file-analysis.js`: protected JSON endpoint alongside existing upload handling.
- `frontend/src/features/file/HashLookup.jsx`: accessible input, findings, counts and risk display.
- `frontend/src/features/file/hash-state.js`: API serialization, validation, cancellation and duplicate prevention.
- `frontend/src/features/file/FileAnalyzerPage.jsx`: section integration.

## Recording validation

- Backend hash recording, file API, analysis recording, dashboard and security analytics suites: **40 passed**.
- Frontend hash, file and security analytics suites: **25 passed**.
- Prisma format, validate, generate and migration deployment passed; `db:status` confirms the schema is up to date.
- Production frontend build and focused lint passed. The existing large-bundle build warning remains.

## Initial lookup validation

- `node --test --test-concurrency=1 backend/tests/hash-analysis.test.js backend/tests/file-api.integration.test.js`: 22 passed, including real local PostgreSQL/HTTP authorization and unchanged upload behavior.
- `node --test --test-concurrency=1 frontend/tests/hash.test.mjs frontend/tests/file.test.mjs`: 15 passed.
- `npm.cmd run build`: passed, with the existing large-bundle warning.
- Focused ESLint on all eight changed/new JavaScript and JSX files: passed.

Provider responses in tests are controlled fixtures; no live VirusTotal
availability or detection result is claimed. No dependency installation was needed.
