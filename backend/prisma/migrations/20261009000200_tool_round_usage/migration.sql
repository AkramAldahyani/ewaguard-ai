ALTER TABLE "ai_usage" ADD COLUMN "parentRequestId" UUID;
ALTER TABLE "ai_usage" ADD COLUMN "toolMetadata" JSONB NOT NULL DEFAULT '{}';
