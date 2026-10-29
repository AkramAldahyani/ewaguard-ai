-- Additive lifecycle metadata. Existing identities and historical relations remain intact.
ALTER TABLE "users"
  ADD COLUMN "deletedAt" TIMESTAMPTZ(3),
  ADD COLUMN "lastLoginAt" TIMESTAMPTZ(3),
  ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "setupTokenHash" VARCHAR(64),
  ADD COLUMN "setupTokenExpiresAt" TIMESTAMPTZ(3);
CREATE UNIQUE INDEX "users_setupTokenHash_key" ON "users"("setupTokenHash");
CREATE INDEX "users_deletedAt_createdAt_idx" ON "users"("deletedAt", "createdAt");
CREATE INDEX "users_lastName_firstName_idx" ON "users"("lastName", "firstName");
CREATE INDEX "users_lastLoginAt_idx" ON "users"("lastLoginAt");
-- Enforce normalized identity uniqueness even for callers outside the admin service.
-- If legacy case-only duplicates exist, fail for review instead of merging accounts.
CREATE UNIQUE INDEX "users_email_case_insensitive_key" ON "users" (lower("email"));
CREATE UNIQUE INDEX "users_employeeIdentifier_case_insensitive_key" ON "users" (upper("employeeIdentifier"));
