BEGIN;
CREATE TYPE "ToolApprovalStatus" AS ENUM ('PENDING', 'REJECTED', 'EXPIRED', 'EXECUTING', 'COMPLETED', 'FAILED');
CREATE TABLE "tool_approvals" (
  "id" UUID PRIMARY KEY,
  "requestId" UUID NOT NULL,
  "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "conversationId" UUID NOT NULL REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "acknowledgementId" UUID NOT NULL REFERENCES "disclaimer_acknowledgements"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "toolName" VARCHAR(40) NOT NULL CHECK ("toolName" IN ('analyze_email', 'analyze_url')),
  "parameterDigest" VARCHAR(64) NOT NULL CHECK ("parameterDigest" ~ '^[a-f0-9]{64}$'),
  "encryptedParameters" TEXT,
  "status" "ToolApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "decidedAt" TIMESTAMPTZ(3),
  "completedAt" TIMESTAMPTZ(3),
  "emailAnalysisId" UUID REFERENCES "email_analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "urlAnalysisId" UUID REFERENCES "url_analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "tool_approval_ttl" CHECK ("expiresAt" > "createdAt" AND "expiresAt" <= "createdAt" + INTERVAL '5 minutes'),
  CONSTRAINT "tool_approval_payload" CHECK (("status" = 'PENDING') = ("encryptedParameters" IS NOT NULL)),
  CONSTRAINT "tool_approval_result_type" CHECK (
    ("emailAnalysisId" IS NULL OR ("toolName" = 'analyze_email' AND "status" = 'COMPLETED')) AND
    ("urlAnalysisId" IS NULL OR ("toolName" = 'analyze_url' AND "status" = 'COMPLETED')))
);
CREATE UNIQUE INDEX "tool_approvals_userId_requestId_key" ON "tool_approvals"("userId", "requestId");
CREATE INDEX "tool_approvals_conversationId_createdAt_idx" ON "tool_approvals"("conversationId", "createdAt");
CREATE INDEX "tool_approvals_status_expiresAt_idx" ON "tool_approvals"("status", "expiresAt");
CREATE INDEX "tool_approvals_userId_toolName_decidedAt_idx" ON "tool_approvals"("userId", "toolName", "decidedAt");
CREATE INDEX "tool_approvals_acknowledgementId_idx" ON "tool_approvals"("acknowledgementId");
CREATE INDEX "tool_approvals_emailAnalysisId_idx" ON "tool_approvals"("emailAnalysisId");
CREATE INDEX "tool_approvals_urlAnalysisId_idx" ON "tool_approvals"("urlAnalysisId");
COMMIT;
