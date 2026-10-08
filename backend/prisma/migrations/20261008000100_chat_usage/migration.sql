CREATE TYPE "AiUsageStatus" AS ENUM ('RESERVED', 'COMPLETED', 'FAILED', 'UNKNOWN');
CREATE TABLE "ai_usage" (
  "id" UUID NOT NULL PRIMARY KEY,
  "userId" UUID,
  "sessionId" UUID,
  "requestId" UUID NOT NULL,
  "status" "AiUsageStatus" NOT NULL DEFAULT 'RESERVED',
  "model" VARCHAR(100) NOT NULL,
  "pricingVersion" VARCHAR(80) NOT NULL,
  "instructionVersion" VARCHAR(80) NOT NULL,
  "privacyNoticeVersion" VARCHAR(80) NOT NULL,
  "inputTokens" INTEGER,
  "outputTokens" INTEGER,
  "reservedMicros" INTEGER NOT NULL CHECK ("reservedMicros" >= 0),
  "chargedMicros" INTEGER NOT NULL CHECK ("chargedMicros" >= 0),
  "inputTokenBound" INTEGER NOT NULL CHECK ("inputTokenBound" > 0),
  "outputTokenBound" INTEGER NOT NULL CHECK ("outputTokenBound" BETWEEN 1 AND 500),
  "userSequence" INTEGER,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ai_usage_tokens_check" CHECK (("inputTokens" IS NULL AND "outputTokens" IS NULL) OR ("inputTokens" >= 0 AND "outputTokens" >= 0)),
  CONSTRAINT "ai_usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ai_usage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "chat_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ai_usage_userId_requestId_key" ON "ai_usage"("userId", "requestId");
CREATE INDEX "ai_usage_userId_createdAt_idx" ON "ai_usage"("userId", "createdAt");
CREATE INDEX "ai_usage_status_createdAt_idx" ON "ai_usage"("status", "createdAt");
CREATE INDEX "ai_usage_sessionId_idx" ON "ai_usage"("sessionId");
