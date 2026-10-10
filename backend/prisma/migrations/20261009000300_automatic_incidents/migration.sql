ALTER TABLE "incidents" ADD COLUMN "sourceKey" VARCHAR(80),
  ADD COLUMN "escalationMetadata" JSONB NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX "incidents_sourceKey_key" ON "incidents"("sourceKey");
