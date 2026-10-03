BEGIN;
-- Requires pgvector server files installed for the PostgreSQL major version.
-- Fail explicitly if unavailable; do not substitute arrays or fabricated vectors.
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE "document_chunks" ADD COLUMN "embedding" vector(1536);
ALTER TABLE "document_chunks" ADD CONSTRAINT "embedding_model_required"
  CHECK (embedding IS NULL OR "embeddingModel" IS NOT NULL);
-- Cosine search. Retrieval must ALSO filter parent approval/activity/indexing state.
CREATE INDEX "document_chunks_embedding_hnsw" ON "document_chunks"
  USING hnsw (embedding vector_cosine_ops);
COMMIT;
