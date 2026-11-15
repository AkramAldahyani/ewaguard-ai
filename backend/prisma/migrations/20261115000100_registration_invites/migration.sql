-- Additive: administrator-issued self-registration links. Tokens are stored only as SHA-256 digests.
CREATE TABLE "registration_invites" (
  "id" UUID NOT NULL,
  "tokenHash" VARCHAR(64) NOT NULL,
  "label" VARCHAR(120) NOT NULL,
  "emailDomain" VARCHAR(253),
  "maxUses" INTEGER NOT NULL,
  "useCount" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "revokedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "departmentId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  CONSTRAINT "registration_invites_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "registration_invites_uses_check" CHECK ("maxUses" >= 1 AND "useCount" >= 0 AND "useCount" <= "maxUses")
);
CREATE UNIQUE INDEX "registration_invites_tokenHash_key" ON "registration_invites"("tokenHash");
CREATE INDEX "registration_invites_expiresAt_idx" ON "registration_invites"("expiresAt");
CREATE INDEX "registration_invites_createdAt_idx" ON "registration_invites"("createdAt");
CREATE INDEX "registration_invites_departmentId_idx" ON "registration_invites"("departmentId");
CREATE INDEX "registration_invites_createdById_idx" ON "registration_invites"("createdById");
ALTER TABLE "registration_invites"
  ADD CONSTRAINT "registration_invites_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "registration_invites_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
