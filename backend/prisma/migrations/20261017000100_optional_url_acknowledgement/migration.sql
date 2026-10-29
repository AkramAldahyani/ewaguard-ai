DROP TRIGGER IF EXISTS "url_analyses_ack" ON "url_analyses";

ALTER TABLE "url_analyses"
ALTER COLUMN "acknowledgementId" DROP NOT NULL;
