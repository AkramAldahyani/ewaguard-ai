# Security Community B1: protected images

B1 adds JPG/JPEG, PNG and WebP photos to the existing moderated community. Videos are deliberately disabled until B2. No likes, comments or bookmarks are included.

## Storage and security

Uploads require authenticated employee access, trusted origin and a current, owned COMMUNITY_POST acknowledgement before multipart parsing. The active consent covers attachments and local scanning; the submission transaction records the existing separate COMMUNITY_ATTACHMENT and FILE_ANALYSIS acknowledgement contexts. Database ownership/context constraints remain intact.

The server checks extensions, MIME and signatures, then runs the existing local ClamAV and YARA adapters. Both must complete without known detections. Unavailable, inconclusive and failed scans reject the upload; administrators cannot override this. Sharp fully decodes bounded, single-frame images, removes metadata, normalizes orientation and emits a bounded PNG. The output is scanned again. No media is sent to external services.

Original bytes are not persisted. Normalized images use random storage keys outside the repository. Authenticated endpoints verify ownership/publication status, expiry, scan evidence and SHA-256 integrity on every read. Pending/rejected images are available only to the author and authorized administrators. Responses are private/no-store. Approval requires explicit attachment review and rechecks stored bytes. Existing unverified attachments cannot be approved through this flow.

## Deployment

Configure COMMUNITY_MEDIA_ROOT as a dedicated persistent directory outside the repository and any web/static root. On Windows, restrict its ACL to the service identity and authorized operators; POSIX directories/files use 0700/0600. The development fallback is an OS temporary directory, not durable production storage. Do not serve this directory through a web server. Use a single application instance for the in-process upload concurrency limit, or add shared admission controls before scaling horizontally.

The COMMUNITY_IMAGE_* variables and COMMUNITY_MAX_IMAGES in .env.example configure limits. Defaults: four images, 5 MiB input each, 16 megapixels, 8 MiB normalized output each, 100 MiB per author and 1 GiB total. Quota admission is serialized in PostgreSQL. Upload parsing is time-bounded and only two uploads process concurrently per instance.

Install/configure the existing ClamAV and YARA local controls with maintained signatures/rules. Text posts remain usable when scanners are unavailable. A no-detection result is not a guarantee of safety; administrators also review sensitive information and suitability.

## Retention

Default binary retention is 90 days, shortened to at most seven days on rejection/removal. Expired media becomes inaccessible even if cleanup is paused. Posts and moderation history remain. Incident-linked evidence is excluded from deletion.

Preview: `node backend/scripts/community-media-cleanup.js --preview`

Apply: `node backend/scripts/community-media-cleanup.js --apply`

Apply and the server worker honor existing retention enable/pause controls. Cleanup removes expired objects in batches, audits deletion and also streams the private directory for unreferenced objects older than 24 hours. Failed deletion keeps its database key for retry. Do not run apply against organizational data without an approved retention policy.

## Database and verification

The existing attachment, file-analysis and acknowledgement tables are reused; B1 requires no new migration. Integration tests use real PostgreSQL, decoding and private filesystem storage, with explicitly injected scanner fixtures. They do not certify a production scanner deployment. A real scanner smoke check and browser review remain separate deployment checks.
