DROP TRIGGER IF EXISTS "file_analyses_ack" ON "file_analyses";

ALTER TABLE "file_analyses"
ALTER COLUMN "acknowledgementId" DROP NOT NULL;
