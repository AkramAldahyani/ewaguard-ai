CREATE TABLE "community_reports" (
 "id" UUID PRIMARY KEY, "reporterId" UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 "postId" UUID REFERENCES community_posts(id) ON DELETE CASCADE,
 "commentId" UUID REFERENCES community_comments(id) ON DELETE CASCADE,
 "category" VARCHAR(40) NOT NULL, "details" VARCHAR(1000),
 "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING', "reason" VARCHAR(1000),
 "reviewerId" UUID REFERENCES users(id) ON DELETE RESTRICT, "reviewedAt" TIMESTAMPTZ(3),
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT report_target CHECK (("postId" IS NULL) <> ("commentId" IS NULL)),
 CONSTRAINT report_category CHECK (category IN ('INAPPROPRIATE','MISLEADING','SENSITIVE_INFORMATION','SPAM','OTHER')),
 CONSTRAINT report_resolution CHECK ((status = 'PENDING' AND reason IS NULL AND "reviewerId" IS NULL AND "reviewedAt" IS NULL) OR (status IN ('DISMISSED','ACTIONED') AND reason IS NOT NULL AND "reviewerId" IS NOT NULL AND "reviewedAt" IS NOT NULL))
);
CREATE UNIQUE INDEX "community_reports_reporterId_postId_key" ON community_reports("reporterId", "postId");
CREATE UNIQUE INDEX "community_reports_reporterId_commentId_key" ON community_reports("reporterId", "commentId");
CREATE INDEX "community_reports_status_createdAt_idx" ON community_reports(status, "createdAt");
CREATE INDEX "community_reports_postId_idx" ON community_reports("postId");
CREATE INDEX "community_reports_commentId_idx" ON community_reports("commentId");
CREATE INDEX "community_reports_reviewerId_idx" ON community_reports("reviewerId");
