# Stage 1: analysis analytics and retry protection

## SHA-256 checks

Hash lookups are now persisted in `file_analyses` with kind `HASH_LOOKUP` and
counted in totals, severity distributions, daily activity and recent analyses.
The API type `FILE_HASH` is displayed as **SHA-256 check** in the type breakdown
and recent table. Uploaded files remain `FILE`. Hash-only records retain unknown
file size/type as NULL and local scanners as NOT_SCANNED, enforced by migration
`20261020000100_file_hash_analysis_records`.

The existing retry key mechanism uses a separate FILE_HASH namespace and returns
the owned saved hash result without rerunning lookup or creating an incident.
Hash checks retain the original no-automatic-incident behavior. Existing upload,
URL and email escalation behavior is unchanged. Historical unsaved hash checks
cannot be backfilled. See `file-hash-lookup.md` for current validation and details.

## Original analysis recording behavior

Security Analytics aggregates existing `email_analyses`, `url_analyses`, and
`file_analyses` records, not incident counts. The existing administrator endpoint
adds an `analyses` object; its incident fields remain compatible. Authorization,
administrator MFA and trusted-origin checks remain on the existing route.

Completed records with an analysis timestamp and a stored severity contribute to
the four severity totals. SQL aggregation and the latest-20 preview run in one
repeatable-read transaction. Periods use inclusive UTC dates (7, 30, 90 days or
1–90 custom days). No source content, evidence JSON, employee identities or file
hashes are returned. Recent rows link to incidents using their unique source key.
Stored errors and completed unclassified records are counted separately, using
creation time if no analysis timestamp exists. Rejected requests and failures
that never persisted a record are not included in those counts.

Risk thresholds and escalation are unchanged: LOW/MEDIUM are recorded without
automatic incidents; HIGH/CRITICAL are recorded and escalated through the existing
deduplicated incident engine. A limited-confidence classification remains the
deterministic engine's classification; lack of detection is not proof of safety.
Ordinary chat and password operations are not analysis sources. Approved AI tools
continue to use their existing atomic approval receipts and persistence services.

## Direct request retries

The analyzer UI sends a random UUID v4 `Idempotency-Key`. A flow retains the key
for the same input after a network failure. Reset, successful completion or changed
input creates a new logical submission; identical deliberate rescans remain valid.
Keys and input fingerprints are kept only in memory, not browser storage.

The server derives an analysis UUID from the authenticated user, analyzer type and
key. The existing primary key prevents duplicate inserts across processes. A keyed
HMAC in minimized evidence detects reuse with different content (409 conflict).
Raw submissions and original responses are not cached. Successful repeats return
a minimized saved receipt with risk, score and the existing incident receipt.
Escalation recovery runs through the existing incident engine. Simultaneous
requests can perform duplicate scanner work, but only one analysis record commits.

Legacy clients without the header still work but cannot have logical retries
identified. They should send and reuse a key until they receive a response. Browser
reloads clear the in-memory flow; re-entering a submission starts a new scan.
The HMAC uses the configured JWT secret; secret rotation rejects replays signed
with the previous secret rather than accepting mismatched content.

## Retention and deployment

No schema migration, dependency or historical backfill is required. Counts use
only retained records; deleted or never-recorded history cannot be reconstructed.
The current default LOW/MEDIUM analysis retention is 30 days, subject to the
existing cleanup policy and investigation protections. A 90-day chart may therefore
have incomplete historical coverage. Deduplication lasts while the source record
is retained. The recent table is a bounded preview, not a full history export.

Refresh analytics or apply a period to fetch current database values. No new
LOW/MEDIUM notifications or socket events are introduced. Main dashboard redesign
is reserved for Stage 2.
