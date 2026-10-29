CREATE TYPE "FileAnalysisKind" AS ENUM ('UPLOAD', 'HASH_LOOKUP');
ALTER TABLE "file_analyses"
  ADD COLUMN "kind" "FileAnalysisKind" NOT NULL DEFAULT 'UPLOAD',
  ALTER COLUMN "sizeBytes" DROP NOT NULL,
  ALTER COLUMN "detectedMime" DROP NOT NULL,
  ALTER COLUMN "extension" DROP NOT NULL;
-- Unknown file properties stay NULL for hash lookups; uploaded files retain
-- the existing requirement for validated size/type metadata.
ALTER TABLE "file_analyses" ADD CONSTRAINT "file_analysis_kind_metadata"
  CHECK (
    ("kind" = 'UPLOAD' AND "sizeBytes" IS NOT NULL AND "detectedMime" IS NOT NULL AND "extension" IS NOT NULL)
    OR
    ("kind" = 'HASH_LOOKUP' AND "sizeBytes" IS NULL AND "detectedMime" IS NULL AND "extension" IS NULL
      AND "storageKey" IS NULL AND "clamavStatus" = 'NOT_SCANNED' AND "yaraStatus" = 'NOT_SCANNED')
  );
