-- Additive queue indexes. Existing records, constraints and migrations are preserved.
CREATE INDEX "incidents_createdAt_id_idx" ON "incidents"("createdAt", "id");
CREATE INDEX "incidents_updatedAt_id_idx" ON "incidents"("updatedAt", "id");
CREATE INDEX "incidents_severity_createdAt_id_idx" ON "incidents"("severity", "createdAt", "id");
CREATE INDEX "incidents_detectionSource_createdAt_id_idx" ON "incidents"("detectionSource", "createdAt", "id");
