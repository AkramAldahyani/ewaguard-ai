ALTER TABLE "notifications"
  ADD COLUMN "eventKey" VARCHAR(120),
  ADD COLUMN "audience" "RoleName",
  ADD COLUMN "kind" VARCHAR(40),
  ADD COLUMN "severity" "Severity";
CREATE UNIQUE INDEX "notifications_recipientId_eventKey_key" ON "notifications"("recipientId", "eventKey");
CREATE INDEX "notifications_recipientId_createdAt_id_idx" ON "notifications"("recipientId", "createdAt", "id");
CREATE TABLE "revoked_sessions" (
  "id" UUID NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "revoked_sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "revoked_sessions_expiresAt_idx" ON "revoked_sessions"("expiresAt");
