-- Comments no longer require a separate sensitive-information acknowledgement.
-- Existing acknowledgement metadata remains available for historical records.
ALTER TABLE "community_comments"
  ALTER COLUMN "acknowledgementVersion" DROP NOT NULL,
  ALTER COLUMN "acknowledgedAt" DROP NOT NULL;
