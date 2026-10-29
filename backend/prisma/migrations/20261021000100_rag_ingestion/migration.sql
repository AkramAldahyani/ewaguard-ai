ALTER TABLE "knowledge_documents"
  ADD COLUMN "filename" VARCHAR(255),
  ADD COLUMN "classification" VARCHAR(20) NOT NULL DEFAULT 'UNSPECIFIED',
  ADD COLUMN "ingestionMetadata" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_document_classification_check"
  CHECK ("classification" IN ('UNSPECIFIED', 'DEMONSTRATION', 'PRODUCTION'));
