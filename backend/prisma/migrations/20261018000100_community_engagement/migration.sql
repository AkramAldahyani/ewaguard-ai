CREATE TABLE "community_post_likes" (
  "userId" UUID NOT NULL,
  "postId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "community_post_likes_pkey" PRIMARY KEY ("userId", "postId"),
  CONSTRAINT "community_post_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "community_post_likes_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "community_post_likes_postId_idx" ON "community_post_likes"("postId");

CREATE TABLE "community_post_saves" (
  "userId" UUID NOT NULL,
  "postId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "community_post_saves_pkey" PRIMARY KEY ("userId", "postId"),
  CONSTRAINT "community_post_saves_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "community_post_saves_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "community_post_saves_postId_idx" ON "community_post_saves"("postId");
CREATE INDEX "community_post_saves_userId_createdAt_idx" ON "community_post_saves"("userId", "createdAt");
