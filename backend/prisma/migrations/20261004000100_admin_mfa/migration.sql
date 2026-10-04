-- Additive migration: preserve SQL-managed vector column and HNSW index.
ALTER TABLE "users"
  ADD COLUMN "mfaSecretEncrypted" TEXT,
  ADD COLUMN "mfaEnabledAt" TIMESTAMPTZ(3),
  ADD COLUMN "mfaLastCounter" BIGINT,
  ADD COLUMN "mfaChallengeHash" VARCHAR(64),
  ADD COLUMN "mfaChallengeExpiresAt" TIMESTAMPTZ(3),
  ADD COLUMN "mfaChallengeAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "mfaPendingSecret" TEXT,
  ADD COLUMN "mfaChallengeCredential" VARCHAR(64),
  ADD CONSTRAINT "users_mfa_enrollment" CHECK (
    ("mfaEnabledAt" IS NULL AND "mfaSecretEncrypted" IS NULL AND "mfaLastCounter" IS NULL)
    OR ("mfaEnabledAt" IS NOT NULL AND "mfaSecretEncrypted" IS NOT NULL AND "mfaLastCounter" IS NOT NULL)
  ),
  ADD CONSTRAINT "users_mfa_attempts" CHECK ("mfaChallengeAttempts" BETWEEN 0 AND 5);
