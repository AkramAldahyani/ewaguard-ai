CREATE TABLE "community_comments" (
  "id" UUID NOT NULL,
  "postId" UUID NOT NULL,
  "authorId" UUID NOT NULL,
  "parentId" UUID,
  "body" VARCHAR(2000) NOT NULL,
  "status" "CommunityStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "moderationReason" VARCHAR(1000),
  "acknowledgementVersion" VARCHAR(40) NOT NULL,
  "acknowledgedAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "community_comments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "community_comments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "community_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "community_comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "community_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "community_comments_status_check" CHECK (status IN ('PENDING_REVIEW','APPROVED','REJECTED','REMOVED'))
);
CREATE INDEX "community_comments_postId_parentId_status_createdAt_idx" ON "community_comments"("postId", "parentId", "status", "createdAt");
CREATE INDEX "community_comments_status_createdAt_idx" ON "community_comments"("status", "createdAt");
CREATE INDEX "community_comments_authorId_idx" ON "community_comments"("authorId");
CREATE INDEX "community_comments_parentId_idx" ON "community_comments"("parentId");

-- Prevent cross-post replies and grandchildren, including direct database writes.
CREATE FUNCTION validate_community_comment_parent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."parentId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM community_comments WHERE id = NEW."parentId" AND "postId" = NEW."postId" AND "parentId" IS NULL AND id <> NEW.id
  ) THEN RAISE EXCEPTION 'Invalid comment parent' USING ERRCODE = '23514'; END IF;
  IF TG_OP = 'UPDATE' AND (NEW."parentId" IS DISTINCT FROM OLD."parentId" OR NEW."postId" <> OLD."postId" OR NEW."authorId" <> OLD."authorId") THEN
    RAISE EXCEPTION 'Comment ownership and thread are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER community_comments_parent BEFORE INSERT OR UPDATE ON community_comments FOR EACH ROW EXECUTE FUNCTION validate_community_comment_parent();

CREATE TABLE "comment_moderation_actions" (
  "id" UUID NOT NULL,
  "commentId" UUID NOT NULL,
  "moderatorId" UUID NOT NULL,
  "previousStatus" "CommunityStatus" NOT NULL,
  "decision" "ModerationDecision" NOT NULL,
  "reason" VARCHAR(1000) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "comment_moderation_actions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "comment_moderation_actions_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "community_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "comment_moderation_actions_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "comment_moderation_actions_commentId_createdAt_idx" ON "comment_moderation_actions"("commentId", "createdAt");
CREATE INDEX "comment_moderation_actions_moderatorId_idx" ON "comment_moderation_actions"("moderatorId");
