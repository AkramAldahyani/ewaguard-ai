BEGIN;
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('EMPLOYEE', 'IT_SECURITY_ADMIN');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'TOOL');

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('PENDING', 'COMPLETED', 'ERROR');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('NOT_SCANNED', 'UNAVAILABLE', 'ERROR', 'NO_KNOWN_DETECTION', 'DETECTED');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('NEW', 'UNDER_INVESTIGATION', 'CONTAINED', 'RESOLVED', 'FALSE_POSITIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('PHISHING', 'MALWARE', 'CREDENTIAL_COMPROMISE', 'DATA_EXPOSURE', 'SUSPICIOUS_ACTIVITY', 'OTHER');

-- CreateEnum
CREATE TYPE "DetectionSource" AS ENUM ('EMAIL_ANALYSIS', 'URL_ANALYSIS', 'FILE_ANALYSIS', 'INCIDENT_ASSISTANCE', 'MANUAL_REPORT');

-- CreateEnum
CREATE TYPE "IncidentEventType" AS ENUM ('CREATED', 'STATUS_CHANGED', 'ASSIGNED', 'SEVERITY_CHANGED', 'EVIDENCE_ADDED', 'RESOLUTION_UPDATED');

-- CreateEnum
CREATE TYPE "CommentVisibility" AS ENUM ('SECURITY_TEAM', 'REPORTER');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('INCIDENT_ALERT', 'INCIDENT_UPDATE', 'TRAINING_ASSIGNED', 'QUIZ_PUBLISHED', 'COMMUNITY_MODERATED');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('PDPL', 'COMPANY_POLICY');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "IndexingStatus" AS ENUM ('NOT_INDEXED', 'PENDING', 'INDEXED', 'ERROR');

-- CreateEnum
CREATE TYPE "TrainingStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProgressStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "QuizKind" AS ENUM ('COURSE', 'MONTHLY');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MULTIPLE_CHOICE', 'TRUE_FALSE');

-- CreateEnum
CREATE TYPE "ContentOrigin" AS ENUM ('HUMAN', 'AI_DRAFT');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "CommunityStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'REMOVED');

-- CreateEnum
CREATE TYPE "CommunityCategory" AS ENUM ('PHISHING', 'SUSPICIOUS_EMAIL', 'SUSPICIOUS_LINK', 'SUSPICIOUS_FILE', 'SECURITY_TIP', 'SECURITY_WARNING', 'EDUCATIONAL_CONTENT');

-- CreateEnum
CREATE TYPE "ModerationDecision" AS ENUM ('APPROVED', 'REJECTED', 'REMOVED');

-- CreateEnum
CREATE TYPE "DisclaimerContext" AS ENUM ('EMAIL_ANALYSIS', 'URL_ANALYSIS', 'FILE_ANALYSIS', 'CHAT', 'COMMUNITY_POST', 'COMMUNITY_ATTACHMENT');

-- CreateEnum
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCESS', 'FAILURE', 'DENIED');

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "name" "RoleName" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "employeeIdentifier" VARCHAR(80),
    "firstName" VARCHAR(100) NOT NULL,
    "lastName" VARCHAR(100) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "passwordHash" VARCHAR(255),
    "status" "AccountStatus" NOT NULL DEFAULT 'INVITED',
    "deactivatedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "roleId" UUID NOT NULL,
    "departmentId" UUID,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" UUID NOT NULL,
    "title" VARCHAR(160),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "closedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "ownerId" UUID NOT NULL,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionId" UUID NOT NULL,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disclaimer_acknowledgements" (
    "id" UUID NOT NULL,
    "version" VARCHAR(40) NOT NULL,
    "context" "DisclaimerContext" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID NOT NULL,

    CONSTRAINT "disclaimer_acknowledgements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_analyses" (
    "id" UUID NOT NULL,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "riskScore" INTEGER,
    "severity" "Severity",
    "riskRuleVersion" VARCHAR(40),
    "analyzedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "senderDomain" VARCHAR(253),
    "replyToDomain" VARCHAR(253),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "userId" UUID NOT NULL,
    "acknowledgementId" UUID NOT NULL,

    CONSTRAINT "email_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "url_analyses" (
    "id" UUID NOT NULL,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "riskScore" INTEGER,
    "severity" "Severity",
    "riskRuleVersion" VARCHAR(40),
    "analyzedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "hostname" VARCHAR(253) NOT NULL,
    "urlSha256" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "userId" UUID NOT NULL,
    "acknowledgementId" UUID NOT NULL,

    CONSTRAINT "url_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_analyses" (
    "id" UUID NOT NULL,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "riskScore" INTEGER,
    "severity" "Severity",
    "riskRuleVersion" VARCHAR(40),
    "analyzedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "detectedMime" VARCHAR(120) NOT NULL,
    "extension" VARCHAR(20) NOT NULL,
    "storageKey" VARCHAR(200),
    "clamavStatus" "ScanStatus" NOT NULL DEFAULT 'NOT_SCANNED',
    "yaraStatus" "ScanStatus" NOT NULL DEFAULT 'NOT_SCANNED',
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "userId" UUID NOT NULL,
    "acknowledgementId" UUID NOT NULL,

    CONSTRAINT "file_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "riskRuleVersion" VARCHAR(40) NOT NULL,
    "type" "IncidentType" NOT NULL,
    "detectionSource" "DetectionSource" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'NEW',
    "aiSummary" TEXT,
    "indicators" JSONB NOT NULL DEFAULT '[]',
    "recommendedActions" JSONB NOT NULL DEFAULT '[]',
    "mitreTechniqueIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "resolution" TEXT,
    "resolvedAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "retentionUntil" TIMESTAMPTZ(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "reporterId" UUID NOT NULL,
    "assigneeId" UUID,
    "departmentId" UUID,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_evidence" (
    "id" UUID NOT NULL,
    "summary" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "capturedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "incidentId" UUID NOT NULL,
    "emailAnalysisId" UUID,
    "urlAnalysisId" UUID,
    "fileAnalysisId" UUID,

    CONSTRAINT "incident_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_events" (
    "id" UUID NOT NULL,
    "type" "IncidentEventType" NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "incidentId" UUID NOT NULL,
    "actorId" UUID,

    CONSTRAINT "incident_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_comments" (
    "id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "visibility" "CommentVisibility" NOT NULL DEFAULT 'SECURITY_TEAM',
    "redactedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "incidentId" UUID NOT NULL,
    "authorId" UUID NOT NULL,

    CONSTRAINT "incident_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "readAt" TIMESTAMPTZ(3),
    "deliveredAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "recipientId" UUID NOT NULL,
    "incidentId" UUID,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_documents" (
    "id" UUID NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "documentKey" VARCHAR(100) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "title" VARCHAR(240) NOT NULL,
    "source" VARCHAR(1000) NOT NULL,
    "storageKey" VARCHAR(200),
    "contentSha256" CHAR(64),
    "status" "ApprovalStatus" NOT NULL DEFAULT 'DRAFT',
    "active" BOOLEAN NOT NULL DEFAULT false,
    "indexingStatus" "IndexingStatus" NOT NULL DEFAULT 'NOT_INDEXED',
    "approvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "uploadedById" UUID NOT NULL,
    "approvedById" UUID,

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_chunks" (
    "id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "embeddingModel" VARCHAR(100),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "documentId" UUID NOT NULL,

    CONSTRAINT "document_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_programs" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "topic" VARCHAR(100) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "learningObjectives" TEXT[],
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 6,
    "content" JSONB NOT NULL,
    "status" "TrainingStatus" NOT NULL DEFAULT 'DRAFT',
    "origin" "ContentOrigin" NOT NULL DEFAULT 'HUMAN',
    "reviewedAt" TIMESTAMPTZ(3),
    "publishedAt" TIMESTAMPTZ(3),
    "requiresQuiz" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "reviewedById" UUID,

    CONSTRAINT "training_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_assignments" (
    "id" UUID NOT NULL,
    "dueAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "trainingId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "assignedById" UUID NOT NULL,
    "departmentId" UUID,

    CONSTRAINT "training_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_progress" (
    "id" UUID NOT NULL,
    "status" "ProgressStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "completedSectionKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startedAt" TIMESTAMPTZ(3),
    "lastActivityAt" TIMESTAMPTZ(3),
    "materialCompletedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "assignmentId" UUID NOT NULL,
    "qualifyingAttemptId" UUID,

    CONSTRAINT "training_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quizzes" (
    "id" UUID NOT NULL,
    "kind" "QuizKind" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "origin" "ContentOrigin" NOT NULL DEFAULT 'HUMAN',
    "passingPercent" INTEGER NOT NULL DEFAULT 80,
    "maxAttempts" INTEGER,
    "approvedAt" TIMESTAMPTZ(3),
    "publishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "approvedById" UUID,

    CONSTRAINT "quizzes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_quizzes" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "trainingId" UUID NOT NULL,
    "quizId" UUID NOT NULL,

    CONSTRAINT "training_quizzes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_quizzes" (
    "id" UUID NOT NULL,
    "period" DATE NOT NULL,
    "opensAt" TIMESTAMPTZ(3) NOT NULL,
    "closesAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "quizId" UUID NOT NULL,

    CONSTRAINT "monthly_quizzes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_quiz_assignments" (
    "id" UUID NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "monthlyQuizId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "assignedById" UUID NOT NULL,
    "departmentId" UUID,

    CONSTRAINT "monthly_quiz_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_questions" (
    "id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "explanation" TEXT NOT NULL,
    "topic" VARCHAR(100) NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 1,
    "position" INTEGER NOT NULL,
    "origin" "ContentOrigin" NOT NULL DEFAULT 'HUMAN',
    "reviewedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "quizId" UUID NOT NULL,
    "reviewedById" UUID,

    CONSTRAINT "quiz_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_options" (
    "id" UUID NOT NULL,
    "text" VARCHAR(1000) NOT NULL,
    "position" INTEGER NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "questionId" UUID NOT NULL,

    CONSTRAINT "quiz_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_attempts" (
    "id" UUID NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMPTZ(3),
    "passingPercent" INTEGER NOT NULL,
    "earnedPoints" INTEGER,
    "possiblePoints" INTEGER,
    "scorePercent" DECIMAL(5,2),
    "passed" BOOLEAN,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "quizId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "trainingAssignmentId" UUID,
    "monthlyAssignmentId" UUID,

    CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_answers" (
    "id" UUID NOT NULL,
    "awardedPoints" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "attemptId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "selectedOptionId" UUID NOT NULL,

    CONSTRAINT "quiz_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificates" (
    "id" UUID NOT NULL,
    "certificateNumber" UUID NOT NULL,
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3) NOT NULL,
    "employeeName" VARCHAR(210) NOT NULL,
    "trainingTitle" VARCHAR(200) NOT NULL,
    "scorePercent" DECIMAL(5,2),
    "storageKey" VARCHAR(200),
    "revokedAt" TIMESTAMPTZ(3),
    "revocationReason" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "progressId" UUID NOT NULL,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_posts" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "category" "CommunityCategory" NOT NULL,
    "status" "CommunityStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "submittedAt" TIMESTAMPTZ(3),
    "approvedAt" TIMESTAMPTZ(3),
    "removedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "authorId" UUID NOT NULL,
    "acknowledgementId" UUID NOT NULL,
    "trainingId" UUID,

    CONSTRAINT "community_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_post_attachments" (
    "id" UUID NOT NULL,
    "caption" VARCHAR(200),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postId" UUID NOT NULL,
    "fileAnalysisId" UUID NOT NULL,
    "acknowledgementId" UUID NOT NULL,

    CONSTRAINT "community_post_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_moderation_actions" (
    "id" UUID NOT NULL,
    "decision" "ModerationDecision" NOT NULL,
    "previousStatus" "CommunityStatus" NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postId" UUID NOT NULL,
    "moderatorId" UUID NOT NULL,

    CONSTRAINT "post_moderation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "resourceType" VARCHAR(80) NOT NULL,
    "resourceId" VARCHAR(100),
    "outcome" "AuditOutcome" NOT NULL,
    "correlationId" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "retentionUntil" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" UUID,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_employeeIdentifier_key" ON "users"("employeeIdentifier");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_roleId_idx" ON "users"("roleId");

-- CreateIndex
CREATE INDEX "users_departmentId_idx" ON "users"("departmentId");

-- CreateIndex
CREATE INDEX "chat_sessions_expiresAt_idx" ON "chat_sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "chat_sessions_ownerId_idx" ON "chat_sessions"("ownerId");

-- CreateIndex
CREATE INDEX "chat_messages_expiresAt_idx" ON "chat_messages"("expiresAt");

-- CreateIndex
CREATE INDEX "chat_messages_sessionId_idx" ON "chat_messages"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "chat_messages_sessionId_sequence_key" ON "chat_messages"("sessionId", "sequence");

-- CreateIndex
CREATE INDEX "disclaimer_acknowledgements_userId_context_createdAt_idx" ON "disclaimer_acknowledgements"("userId", "context", "createdAt");

-- CreateIndex
CREATE INDEX "disclaimer_acknowledgements_userId_idx" ON "disclaimer_acknowledgements"("userId");

-- CreateIndex
CREATE INDEX "email_analyses_userId_createdAt_idx" ON "email_analyses"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "email_analyses_expiresAt_idx" ON "email_analyses"("expiresAt");

-- CreateIndex
CREATE INDEX "email_analyses_userId_idx" ON "email_analyses"("userId");

-- CreateIndex
CREATE INDEX "email_analyses_acknowledgementId_idx" ON "email_analyses"("acknowledgementId");

-- CreateIndex
CREATE INDEX "url_analyses_userId_createdAt_idx" ON "url_analyses"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "url_analyses_expiresAt_idx" ON "url_analyses"("expiresAt");

-- CreateIndex
CREATE INDEX "url_analyses_userId_idx" ON "url_analyses"("userId");

-- CreateIndex
CREATE INDEX "url_analyses_acknowledgementId_idx" ON "url_analyses"("acknowledgementId");

-- CreateIndex
CREATE UNIQUE INDEX "file_analyses_storageKey_key" ON "file_analyses"("storageKey");

-- CreateIndex
CREATE INDEX "file_analyses_userId_createdAt_idx" ON "file_analyses"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "file_analyses_sha256_idx" ON "file_analyses"("sha256");

-- CreateIndex
CREATE INDEX "file_analyses_expiresAt_idx" ON "file_analyses"("expiresAt");

-- CreateIndex
CREATE INDEX "file_analyses_userId_idx" ON "file_analyses"("userId");

-- CreateIndex
CREATE INDEX "file_analyses_acknowledgementId_idx" ON "file_analyses"("acknowledgementId");

-- CreateIndex
CREATE UNIQUE INDEX "incidents_number_key" ON "incidents"("number");

-- CreateIndex
CREATE INDEX "incidents_status_severity_createdAt_idx" ON "incidents"("status", "severity", "createdAt");

-- CreateIndex
CREATE INDEX "incidents_reporterId_createdAt_idx" ON "incidents"("reporterId", "createdAt");

-- CreateIndex
CREATE INDEX "incidents_departmentId_createdAt_idx" ON "incidents"("departmentId", "createdAt");

-- CreateIndex
CREATE INDEX "incidents_reporterId_idx" ON "incidents"("reporterId");

-- CreateIndex
CREATE INDEX "incidents_assigneeId_idx" ON "incidents"("assigneeId");

-- CreateIndex
CREATE INDEX "incidents_departmentId_idx" ON "incidents"("departmentId");

-- CreateIndex
CREATE INDEX "incident_evidence_incidentId_idx" ON "incident_evidence"("incidentId");

-- CreateIndex
CREATE INDEX "incident_evidence_emailAnalysisId_idx" ON "incident_evidence"("emailAnalysisId");

-- CreateIndex
CREATE INDEX "incident_evidence_urlAnalysisId_idx" ON "incident_evidence"("urlAnalysisId");

-- CreateIndex
CREATE INDEX "incident_evidence_fileAnalysisId_idx" ON "incident_evidence"("fileAnalysisId");

-- CreateIndex
CREATE INDEX "incident_events_incidentId_createdAt_idx" ON "incident_events"("incidentId", "createdAt");

-- CreateIndex
CREATE INDEX "incident_events_incidentId_idx" ON "incident_events"("incidentId");

-- CreateIndex
CREATE INDEX "incident_events_actorId_idx" ON "incident_events"("actorId");

-- CreateIndex
CREATE INDEX "incident_comments_incidentId_createdAt_idx" ON "incident_comments"("incidentId", "createdAt");

-- CreateIndex
CREATE INDEX "incident_comments_incidentId_idx" ON "incident_comments"("incidentId");

-- CreateIndex
CREATE INDEX "incident_comments_authorId_idx" ON "incident_comments"("authorId");

-- CreateIndex
CREATE INDEX "notifications_recipientId_readAt_createdAt_idx" ON "notifications"("recipientId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_expiresAt_idx" ON "notifications"("expiresAt");

-- CreateIndex
CREATE INDEX "notifications_recipientId_idx" ON "notifications"("recipientId");

-- CreateIndex
CREATE INDEX "notifications_incidentId_idx" ON "notifications"("incidentId");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_documents_storageKey_key" ON "knowledge_documents"("storageKey");

-- CreateIndex
CREATE INDEX "knowledge_documents_kind_status_active_indexingStatus_idx" ON "knowledge_documents"("kind", "status", "active", "indexingStatus");

-- CreateIndex
CREATE INDEX "knowledge_documents_uploadedById_idx" ON "knowledge_documents"("uploadedById");

-- CreateIndex
CREATE INDEX "knowledge_documents_approvedById_idx" ON "knowledge_documents"("approvedById");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_documents_kind_documentKey_version_key" ON "knowledge_documents"("kind", "documentKey", "version");

-- CreateIndex
CREATE INDEX "document_chunks_documentId_idx" ON "document_chunks"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "document_chunks_documentId_position_key" ON "document_chunks"("documentId", "position");

-- CreateIndex
CREATE INDEX "training_programs_status_topic_idx" ON "training_programs"("status", "topic");

-- CreateIndex
CREATE INDEX "training_programs_createdById_idx" ON "training_programs"("createdById");

-- CreateIndex
CREATE INDEX "training_programs_reviewedById_idx" ON "training_programs"("reviewedById");

-- CreateIndex
CREATE INDEX "training_assignments_employeeId_dueAt_idx" ON "training_assignments"("employeeId", "dueAt");

-- CreateIndex
CREATE INDEX "training_assignments_trainingId_idx" ON "training_assignments"("trainingId");

-- CreateIndex
CREATE INDEX "training_assignments_employeeId_idx" ON "training_assignments"("employeeId");

-- CreateIndex
CREATE INDEX "training_assignments_assignedById_idx" ON "training_assignments"("assignedById");

-- CreateIndex
CREATE INDEX "training_assignments_departmentId_idx" ON "training_assignments"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "training_assignments_trainingId_employeeId_key" ON "training_assignments"("trainingId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "training_progress_assignmentId_key" ON "training_progress"("assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "training_progress_qualifyingAttemptId_key" ON "training_progress"("qualifyingAttemptId");

-- CreateIndex
CREATE INDEX "quizzes_kind_status_idx" ON "quizzes"("kind", "status");

-- CreateIndex
CREATE INDEX "quizzes_createdById_idx" ON "quizzes"("createdById");

-- CreateIndex
CREATE INDEX "quizzes_approvedById_idx" ON "quizzes"("approvedById");

-- CreateIndex
CREATE UNIQUE INDEX "training_quizzes_trainingId_key" ON "training_quizzes"("trainingId");

-- CreateIndex
CREATE UNIQUE INDEX "training_quizzes_quizId_key" ON "training_quizzes"("quizId");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_quizzes_period_key" ON "monthly_quizzes"("period");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_quizzes_quizId_key" ON "monthly_quizzes"("quizId");

-- CreateIndex
CREATE INDEX "monthly_quiz_assignments_monthlyQuizId_idx" ON "monthly_quiz_assignments"("monthlyQuizId");

-- CreateIndex
CREATE INDEX "monthly_quiz_assignments_employeeId_idx" ON "monthly_quiz_assignments"("employeeId");

-- CreateIndex
CREATE INDEX "monthly_quiz_assignments_assignedById_idx" ON "monthly_quiz_assignments"("assignedById");

-- CreateIndex
CREATE INDEX "monthly_quiz_assignments_departmentId_idx" ON "monthly_quiz_assignments"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_quiz_assignments_monthlyQuizId_employeeId_key" ON "monthly_quiz_assignments"("monthlyQuizId", "employeeId");

-- CreateIndex
CREATE INDEX "quiz_questions_quizId_idx" ON "quiz_questions"("quizId");

-- CreateIndex
CREATE INDEX "quiz_questions_reviewedById_idx" ON "quiz_questions"("reviewedById");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_questions_quizId_position_key" ON "quiz_questions"("quizId", "position");

-- CreateIndex
CREATE INDEX "quiz_options_questionId_idx" ON "quiz_options"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_options_questionId_position_key" ON "quiz_options"("questionId", "position");

-- CreateIndex
CREATE INDEX "quiz_attempts_employeeId_submittedAt_idx" ON "quiz_attempts"("employeeId", "submittedAt");

-- CreateIndex
CREATE INDEX "quiz_attempts_quizId_idx" ON "quiz_attempts"("quizId");

-- CreateIndex
CREATE INDEX "quiz_attempts_employeeId_idx" ON "quiz_attempts"("employeeId");

-- CreateIndex
CREATE INDEX "quiz_attempts_trainingAssignmentId_idx" ON "quiz_attempts"("trainingAssignmentId");

-- CreateIndex
CREATE INDEX "quiz_attempts_monthlyAssignmentId_idx" ON "quiz_attempts"("monthlyAssignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_attempts_quizId_employeeId_attemptNumber_key" ON "quiz_attempts"("quizId", "employeeId", "attemptNumber");

-- CreateIndex
CREATE INDEX "quiz_answers_attemptId_idx" ON "quiz_answers"("attemptId");

-- CreateIndex
CREATE INDEX "quiz_answers_questionId_idx" ON "quiz_answers"("questionId");

-- CreateIndex
CREATE INDEX "quiz_answers_selectedOptionId_idx" ON "quiz_answers"("selectedOptionId");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_answers_attemptId_questionId_key" ON "quiz_answers"("attemptId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_certificateNumber_key" ON "certificates"("certificateNumber");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_storageKey_key" ON "certificates"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_progressId_key" ON "certificates"("progressId");

-- CreateIndex
CREATE INDEX "community_posts_status_category_createdAt_idx" ON "community_posts"("status", "category", "createdAt");

-- CreateIndex
CREATE INDEX "community_posts_authorId_createdAt_idx" ON "community_posts"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "community_posts_authorId_idx" ON "community_posts"("authorId");

-- CreateIndex
CREATE INDEX "community_posts_acknowledgementId_idx" ON "community_posts"("acknowledgementId");

-- CreateIndex
CREATE INDEX "community_posts_trainingId_idx" ON "community_posts"("trainingId");

-- CreateIndex
CREATE UNIQUE INDEX "community_post_attachments_fileAnalysisId_key" ON "community_post_attachments"("fileAnalysisId");

-- CreateIndex
CREATE INDEX "community_post_attachments_postId_idx" ON "community_post_attachments"("postId");

-- CreateIndex
CREATE INDEX "community_post_attachments_acknowledgementId_idx" ON "community_post_attachments"("acknowledgementId");

-- CreateIndex
CREATE INDEX "post_moderation_actions_postId_createdAt_idx" ON "post_moderation_actions"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "post_moderation_actions_postId_idx" ON "post_moderation_actions"("postId");

-- CreateIndex
CREATE INDEX "post_moderation_actions_moderatorId_idx" ON "post_moderation_actions"("moderatorId");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_resourceType_resourceId_createdAt_idx" ON "audit_logs"("resourceType", "resourceId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_retentionUntil_idx" ON "audit_logs"("retentionUntil");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disclaimer_acknowledgements" ADD CONSTRAINT "disclaimer_acknowledgements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_analyses" ADD CONSTRAINT "email_analyses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_analyses" ADD CONSTRAINT "email_analyses_acknowledgementId_fkey" FOREIGN KEY ("acknowledgementId") REFERENCES "disclaimer_acknowledgements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "url_analyses" ADD CONSTRAINT "url_analyses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "url_analyses" ADD CONSTRAINT "url_analyses_acknowledgementId_fkey" FOREIGN KEY ("acknowledgementId") REFERENCES "disclaimer_acknowledgements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_analyses" ADD CONSTRAINT "file_analyses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_analyses" ADD CONSTRAINT "file_analyses_acknowledgementId_fkey" FOREIGN KEY ("acknowledgementId") REFERENCES "disclaimer_acknowledgements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_evidence" ADD CONSTRAINT "incident_evidence_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_evidence" ADD CONSTRAINT "incident_evidence_emailAnalysisId_fkey" FOREIGN KEY ("emailAnalysisId") REFERENCES "email_analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_evidence" ADD CONSTRAINT "incident_evidence_urlAnalysisId_fkey" FOREIGN KEY ("urlAnalysisId") REFERENCES "url_analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_evidence" ADD CONSTRAINT "incident_evidence_fileAnalysisId_fkey" FOREIGN KEY ("fileAnalysisId") REFERENCES "file_analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_events" ADD CONSTRAINT "incident_events_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_events" ADD CONSTRAINT "incident_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_comments" ADD CONSTRAINT "incident_comments_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_comments" ADD CONSTRAINT "incident_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "knowledge_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_programs" ADD CONSTRAINT "training_programs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_programs" ADD CONSTRAINT "training_programs_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_assignments" ADD CONSTRAINT "training_assignments_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "training_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_assignments" ADD CONSTRAINT "training_assignments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_assignments" ADD CONSTRAINT "training_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_assignments" ADD CONSTRAINT "training_assignments_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_progress" ADD CONSTRAINT "training_progress_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "training_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_progress" ADD CONSTRAINT "training_progress_qualifyingAttemptId_fkey" FOREIGN KEY ("qualifyingAttemptId") REFERENCES "quiz_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_quizzes" ADD CONSTRAINT "training_quizzes_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "training_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_quizzes" ADD CONSTRAINT "training_quizzes_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "quizzes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_quizzes" ADD CONSTRAINT "monthly_quizzes_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "quizzes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_quiz_assignments" ADD CONSTRAINT "monthly_quiz_assignments_monthlyQuizId_fkey" FOREIGN KEY ("monthlyQuizId") REFERENCES "monthly_quizzes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_quiz_assignments" ADD CONSTRAINT "monthly_quiz_assignments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_quiz_assignments" ADD CONSTRAINT "monthly_quiz_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_quiz_assignments" ADD CONSTRAINT "monthly_quiz_assignments_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "quizzes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_options" ADD CONSTRAINT "quiz_options_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "quiz_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "quizzes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_trainingAssignmentId_fkey" FOREIGN KEY ("trainingAssignmentId") REFERENCES "training_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_monthlyAssignmentId_fkey" FOREIGN KEY ("monthlyAssignmentId") REFERENCES "monthly_quiz_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_answers" ADD CONSTRAINT "quiz_answers_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "quiz_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_answers" ADD CONSTRAINT "quiz_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "quiz_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_answers" ADD CONSTRAINT "quiz_answers_selectedOptionId_fkey" FOREIGN KEY ("selectedOptionId") REFERENCES "quiz_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_progressId_fkey" FOREIGN KEY ("progressId") REFERENCES "training_progress"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_acknowledgementId_fkey" FOREIGN KEY ("acknowledgementId") REFERENCES "disclaimer_acknowledgements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "training_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_post_attachments" ADD CONSTRAINT "community_post_attachments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_post_attachments" ADD CONSTRAINT "community_post_attachments_fileAnalysisId_fkey" FOREIGN KEY ("fileAnalysisId") REFERENCES "file_analyses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_post_attachments" ADD CONSTRAINT "community_post_attachments_acknowledgementId_fkey" FOREIGN KEY ("acknowledgementId") REFERENCES "disclaimer_acknowledgements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_moderation_actions" ADD CONSTRAINT "post_moderation_actions_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_moderation_actions" ADD CONSTRAINT "post_moderation_actions_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- Prisma cannot express CHECK constraints and these cross-table invariants.
ALTER TABLE users ADD CONSTRAINT users_email_normalized CHECK (email = lower(btrim(email)));
ALTER TABLE users ADD CONSTRAINT users_active_password CHECK (status <> 'ACTIVE' OR "passwordHash" IS NOT NULL);
ALTER TABLE incidents ADD CONSTRAINT incident_score CHECK ("riskScore" BETWEEN 0 AND 100);
ALTER TABLE incident_evidence ADD CONSTRAINT evidence_single_source CHECK (num_nonnulls("emailAnalysisId", "urlAnalysisId", "fileAnalysisId") <= 1);
ALTER TABLE file_analyses ADD CONSTRAINT file_size CHECK ("sizeBytes" >= 0);
ALTER TABLE file_analyses ADD CONSTRAINT file_sha256 CHECK (sha256 ~ '^[0-9a-f]{64}$');
ALTER TABLE url_analyses ADD CONSTRAINT url_sha256 CHECK ("urlSha256" ~ '^[0-9a-f]{64}$');
ALTER TABLE knowledge_documents ADD CONSTRAINT document_version CHECK (version > 0);
ALTER TABLE knowledge_documents ADD CONSTRAINT document_approval CHECK (
  (NOT active OR status = 'APPROVED') AND
  (status <> 'APPROVED' OR ("approvedById" IS NOT NULL AND "approvedAt" IS NOT NULL))
);
ALTER TABLE document_chunks ADD CONSTRAINT chunk_position CHECK (position >= 0);
ALTER TABLE training_programs ADD CONSTRAINT training_duration CHECK ("estimatedMinutes" > 0 AND version > 0);
ALTER TABLE training_programs ADD CONSTRAINT training_publication CHECK (
  status <> 'PUBLISHED' OR ("publishedAt" IS NOT NULL AND "reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL)
);
ALTER TABLE training_progress ADD CONSTRAINT training_progress_range CHECK ("progressPercent" BETWEEN 0 AND 100);
ALTER TABLE training_progress ADD CONSTRAINT training_completion CHECK (
  (status = 'COMPLETED') = ("completedAt" IS NOT NULL) AND
  (status <> 'COMPLETED' OR ("progressPercent" = 100 AND "materialCompletedAt" IS NOT NULL AND "startedAt" IS NOT NULL))
);
ALTER TABLE quizzes ADD CONSTRAINT quiz_policy CHECK ("passingPercent" BETWEEN 0 AND 100 AND version > 0 AND ("maxAttempts" IS NULL OR "maxAttempts" > 0));
ALTER TABLE quizzes ADD CONSTRAINT quiz_approval CHECK (
  (status NOT IN ('APPROVED','PUBLISHED') OR ("approvedById" IS NOT NULL AND "approvedAt" IS NOT NULL)) AND
  (status <> 'PUBLISHED' OR "publishedAt" IS NOT NULL)
);
ALTER TABLE monthly_quizzes ADD CONSTRAINT monthly_period CHECK (extract(day from period) = 1 AND "closesAt" > "opensAt");
ALTER TABLE quiz_questions ADD CONSTRAINT question_range CHECK (points > 0 AND position >= 0);
ALTER TABLE quiz_options ADD CONSTRAINT option_position CHECK (position >= 0);
ALTER TABLE quiz_attempts ADD CONSTRAINT attempt_assignment CHECK (num_nonnulls("trainingAssignmentId", "monthlyAssignmentId") = 1);
ALTER TABLE quiz_attempts ADD CONSTRAINT attempt_range CHECK (
  "attemptNumber" > 0 AND "passingPercent" BETWEEN 0 AND 100 AND
  ("scorePercent" IS NULL OR "scorePercent" BETWEEN 0 AND 100) AND
  ("earnedPoints" IS NULL OR "earnedPoints" >= 0) AND
  ("possiblePoints" IS NULL OR ("possiblePoints" > 0 AND "earnedPoints" <= "possiblePoints"))
);
ALTER TABLE quiz_attempts ADD CONSTRAINT submitted_result CHECK (
  status <> 'SUBMITTED' OR (
    "submittedAt" IS NOT NULL AND "earnedPoints" IS NOT NULL AND "possiblePoints" IS NOT NULL AND
    "scorePercent" IS NOT NULL AND passed IS NOT NULL AND
    "scorePercent" = round(100.0 * "earnedPoints" / "possiblePoints", 2) AND
    passed = (100.0 * "earnedPoints" >= "passingPercent" * "possiblePoints")
  )
);
ALTER TABLE quiz_answers ADD CONSTRAINT answer_points CHECK ("awardedPoints" IS NULL OR "awardedPoints" >= 0);
ALTER TABLE certificates ADD CONSTRAINT certificate_score CHECK ("scorePercent" IS NULL OR "scorePercent" BETWEEN 0 AND 100);
ALTER TABLE community_posts ADD CONSTRAINT post_approval CHECK (status <> 'APPROVED' OR "approvedAt" IS NOT NULL);

ALTER TABLE email_analyses ADD CONSTRAINT email_analyses_risk CHECK (
  ("riskScore" IS NULL AND severity IS NULL AND "riskRuleVersion" IS NULL) OR
  ("riskScore" IS NOT NULL AND "riskScore" BETWEEN 0 AND 100 AND severity IS NOT NULL AND "riskRuleVersion" IS NOT NULL)
);

ALTER TABLE url_analyses ADD CONSTRAINT url_analyses_risk CHECK (
  ("riskScore" IS NULL AND severity IS NULL AND "riskRuleVersion" IS NULL) OR
  ("riskScore" IS NOT NULL AND "riskScore" BETWEEN 0 AND 100 AND severity IS NOT NULL AND "riskRuleVersion" IS NOT NULL)
);

ALTER TABLE file_analyses ADD CONSTRAINT file_analyses_risk CHECK (
  ("riskScore" IS NULL AND severity IS NULL AND "riskRuleVersion" IS NULL) OR
  ("riskScore" IS NOT NULL AND "riskScore" BETWEEN 0 AND 100 AND severity IS NOT NULL AND "riskRuleVersion" IS NOT NULL)
);

-- Validate the owner/context of acknowledgement references, without storing submissions.
CREATE FUNCTION validate_acknowledgement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected_context "DisclaimerContext"; expected_user uuid;
BEGIN
  expected_context := TG_ARGV[0]::"DisclaimerContext";
  IF TG_TABLE_NAME = 'community_posts' THEN expected_user := NEW."authorId";
  ELSIF TG_TABLE_NAME = 'community_post_attachments' THEN
    SELECT "authorId" INTO expected_user FROM community_posts WHERE id = NEW."postId";
    IF NOT EXISTS (SELECT 1 FROM file_analyses WHERE id = NEW."fileAnalysisId" AND "userId" = expected_user) THEN
      RAISE EXCEPTION 'Attachment owner mismatch' USING ERRCODE = '23514';
    END IF;
  ELSE expected_user := NEW."userId";
  END IF;
  IF NOT EXISTS (SELECT 1 FROM disclaimer_acknowledgements
    WHERE id = NEW."acknowledgementId" AND "userId" = expected_user AND context = expected_context) THEN
    RAISE EXCEPTION 'Acknowledgement owner or context mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER email_analyses_ack BEFORE INSERT OR UPDATE ON email_analyses FOR EACH ROW EXECUTE FUNCTION validate_acknowledgement('EMAIL_ANALYSIS');
CREATE TRIGGER url_analyses_ack BEFORE INSERT OR UPDATE ON url_analyses FOR EACH ROW EXECUTE FUNCTION validate_acknowledgement('URL_ANALYSIS');
CREATE TRIGGER file_analyses_ack BEFORE INSERT OR UPDATE ON file_analyses FOR EACH ROW EXECUTE FUNCTION validate_acknowledgement('FILE_ANALYSIS');
CREATE TRIGGER community_posts_ack BEFORE INSERT OR UPDATE ON community_posts FOR EACH ROW EXECUTE FUNCTION validate_acknowledgement('COMMUNITY_POST');
CREATE TRIGGER community_post_attachments_ack BEFORE INSERT OR UPDATE ON community_post_attachments FOR EACH ROW EXECUTE FUNCTION validate_acknowledgement('COMMUNITY_ATTACHMENT');

-- Course and monthly bindings cannot point at the wrong quiz kind.
CREATE FUNCTION validate_quiz_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM quizzes WHERE id = NEW."quizId" AND kind = TG_ARGV[0]::"QuizKind") THEN
    RAISE EXCEPTION 'Quiz kind mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER course_binding BEFORE INSERT OR UPDATE ON training_quizzes FOR EACH ROW EXECUTE FUNCTION validate_quiz_binding('COURSE');
CREATE TRIGGER monthly_binding BEFORE INSERT OR UPDATE ON monthly_quizzes FOR EACH ROW EXECUTE FUNCTION validate_quiz_binding('MONTHLY');

CREATE FUNCTION validate_attempt_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."trainingAssignmentId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM training_assignments a JOIN training_quizzes q ON q."trainingId" = a."trainingId"
    WHERE a.id = NEW."trainingAssignmentId" AND a."employeeId" = NEW."employeeId" AND q."quizId" = NEW."quizId"
  ) THEN RAISE EXCEPTION 'Course attempt assignment mismatch' USING ERRCODE = '23514'; END IF;
  IF NEW."monthlyAssignmentId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM monthly_quiz_assignments a JOIN monthly_quizzes q ON q.id = a."monthlyQuizId"
    WHERE a.id = NEW."monthlyAssignmentId" AND a."employeeId" = NEW."employeeId" AND q."quizId" = NEW."quizId"
  ) THEN RAISE EXCEPTION 'Monthly attempt assignment mismatch' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER attempt_assignment BEFORE INSERT OR UPDATE ON quiz_attempts FOR EACH ROW EXECUTE FUNCTION validate_attempt_assignment();

CREATE FUNCTION validate_quiz_answer() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM quiz_attempts a JOIN quiz_questions q ON q."quizId" = a."quizId"
    JOIN quiz_options o ON o."questionId" = q.id
    WHERE a.id = NEW."attemptId" AND q.id = NEW."questionId" AND o.id = NEW."selectedOptionId"
      AND (NEW."awardedPoints" IS NULL OR NEW."awardedPoints" <= q.points)
  ) THEN RAISE EXCEPTION 'Answer does not belong to attempt/question' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER answer_relationship BEFORE INSERT OR UPDATE ON quiz_answers FOR EACH ROW EXECUTE FUNCTION validate_quiz_answer();

CREATE FUNCTION validate_training_completion() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE needs_quiz boolean;
BEGIN
  SELECT t."requiresQuiz" INTO needs_quiz FROM training_assignments a
    JOIN training_programs t ON t.id = a."trainingId" WHERE a.id = NEW."assignmentId";
  IF NEW."qualifyingAttemptId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM quiz_attempts WHERE id = NEW."qualifyingAttemptId"
      AND "trainingAssignmentId" = NEW."assignmentId" AND status = 'SUBMITTED' AND passed
  ) THEN RAISE EXCEPTION 'Qualifying result mismatch' USING ERRCODE = '23514'; END IF;
  IF NEW.status = 'COMPLETED' AND needs_quiz AND NEW."qualifyingAttemptId" IS NULL THEN
    RAISE EXCEPTION 'Passing result required for completion' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER progress_completion BEFORE INSERT OR UPDATE ON training_progress FOR EACH ROW EXECUTE FUNCTION validate_training_completion();

CREATE FUNCTION validate_certificate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM training_progress p LEFT JOIN quiz_attempts a ON a.id = p."qualifyingAttemptId"
    WHERE p.id = NEW."progressId" AND p.status = 'COMPLETED' AND p."completedAt" = NEW."completedAt"
      AND NEW."scorePercent" IS NOT DISTINCT FROM a."scorePercent") THEN
    RAISE EXCEPTION 'Certificate requires qualifying completed progress' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER certificate_eligibility BEFORE INSERT OR UPDATE ON certificates FOR EACH ROW EXECUTE FUNCTION validate_certificate();

-- Identity relationships are stable. Reassignment creates a new record, preserving history.
CREATE FUNCTION immutable_relationships() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE field_name text;
BEGIN
  FOREACH field_name IN ARRAY TG_ARGV LOOP
    IF to_jsonb(OLD)->field_name IS DISTINCT FROM to_jsonb(NEW)->field_name THEN
      RAISE EXCEPTION 'Historical relationship is immutable' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER training_assignments_identity BEFORE UPDATE ON training_assignments FOR EACH ROW EXECUTE FUNCTION immutable_relationships('employeeId', 'trainingId');
CREATE TRIGGER monthly_quiz_assignments_identity BEFORE UPDATE ON monthly_quiz_assignments FOR EACH ROW EXECUTE FUNCTION immutable_relationships('employeeId', 'monthlyQuizId');
CREATE TRIGGER training_quizzes_identity BEFORE UPDATE ON training_quizzes FOR EACH ROW EXECUTE FUNCTION immutable_relationships('quizId', 'trainingId');
CREATE TRIGGER monthly_quizzes_identity BEFORE UPDATE ON monthly_quizzes FOR EACH ROW EXECUTE FUNCTION immutable_relationships('quizId', 'period');
CREATE TRIGGER quizzes_identity BEFORE UPDATE ON quizzes FOR EACH ROW EXECUTE FUNCTION immutable_relationships('kind');
CREATE TRIGGER quiz_attempts_identity BEFORE UPDATE ON quiz_attempts FOR EACH ROW EXECUTE FUNCTION immutable_relationships('quizId', 'employeeId', 'trainingAssignmentId', 'monthlyAssignmentId', 'passingPercent', 'attemptNumber');
CREATE TRIGGER training_progress_identity BEFORE UPDATE ON training_progress FOR EACH ROW EXECUTE FUNCTION immutable_relationships('assignmentId');
CREATE TRIGGER certificates_identity BEFORE UPDATE ON certificates FOR EACH ROW EXECUTE FUNCTION immutable_relationships('progressId', 'completedAt', 'scorePercent');
CREATE TRIGGER disclaimer_acknowledgements_identity BEFORE UPDATE ON disclaimer_acknowledgements FOR EACH ROW EXECUTE FUNCTION immutable_relationships('userId', 'context', 'version');
CREATE TRIGGER community_posts_identity BEFORE UPDATE ON community_posts FOR EACH ROW EXECUTE FUNCTION immutable_relationships('authorId');
CREATE TRIGGER email_analyses_identity BEFORE UPDATE ON email_analyses FOR EACH ROW EXECUTE FUNCTION immutable_relationships('userId');
CREATE TRIGGER url_analyses_identity BEFORE UPDATE ON url_analyses FOR EACH ROW EXECUTE FUNCTION immutable_relationships('userId');
CREATE TRIGGER file_analyses_identity BEFORE UPDATE ON file_analyses FOR EACH ROW EXECUTE FUNCTION immutable_relationships('userId');

-- Freeze published/attempted quiz content so historical answers remain meaningful.
CREATE FUNCTION protect_quiz_content() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE quiz_id uuid; record_data jsonb;
BEGIN
  record_data := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  IF TG_TABLE_NAME = 'quiz_questions' THEN quiz_id := (record_data->>'quizId')::uuid;
  ELSE SELECT "quizId" INTO quiz_id FROM quiz_questions WHERE id = (record_data->>'questionId')::uuid;
  END IF;
  PERFORM 1 FROM quizzes WHERE id = quiz_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM quizzes WHERE id = quiz_id AND (status IN ('APPROVED','PUBLISHED','ARCHIVED') OR "publishedAt" IS NOT NULL))
    OR EXISTS (SELECT 1 FROM quiz_attempts WHERE "quizId" = quiz_id) THEN
    RAISE EXCEPTION 'Create a new quiz version to change historical content' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER question_history BEFORE INSERT OR UPDATE OR DELETE ON quiz_questions FOR EACH ROW EXECUTE FUNCTION protect_quiz_content();
CREATE TRIGGER option_history BEFORE INSERT OR UPDATE OR DELETE ON quiz_options FOR EACH ROW EXECUTE FUNCTION protect_quiz_content();
CREATE TRIGGER question_identity BEFORE UPDATE ON quiz_questions FOR EACH ROW EXECUTE FUNCTION immutable_relationships('quizId');
CREATE TRIGGER option_identity BEFORE UPDATE ON quiz_options FOR EACH ROW EXECUTE FUNCTION immutable_relationships('questionId');

CREATE FUNCTION protect_submitted_result() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'SUBMITTED' THEN
    RAISE EXCEPTION 'Submitted quiz results are immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER submitted_history BEFORE UPDATE OR DELETE ON quiz_attempts FOR EACH ROW EXECUTE FUNCTION protect_submitted_result();

CREATE FUNCTION protect_submitted_answer() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE attempt_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN attempt_id := OLD."attemptId"; ELSE attempt_id := NEW."attemptId"; END IF;
  PERFORM 1 FROM quiz_attempts WHERE id = attempt_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM quiz_attempts WHERE id = attempt_id AND status = 'SUBMITTED') THEN
    RAISE EXCEPTION 'Submitted quiz answers are immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER answer_history BEFORE INSERT OR UPDATE OR DELETE ON quiz_answers FOR EACH ROW EXECUTE FUNCTION protect_submitted_answer();
CREATE TRIGGER answer_identity BEFORE UPDATE ON quiz_answers FOR EACH ROW EXECUTE FUNCTION immutable_relationships('attemptId','questionId');

CREATE FUNCTION protect_quiz_publication() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."publishedAt" IS NOT NULL AND
    (NEW."publishedAt" IS DISTINCT FROM OLD."publishedAt" OR NEW."passingPercent" <> OLD."passingPercent" OR NEW.version <> OLD.version) THEN
    RAISE EXCEPTION 'Published quiz policy is immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.status IN ('APPROVED','PUBLISHED') THEN
    IF NOT EXISTS (SELECT 1 FROM quiz_questions WHERE "quizId" = NEW.id) OR EXISTS (
      SELECT 1 FROM quiz_questions q WHERE q."quizId" = NEW.id AND (
        (q.origin = 'AI_DRAFT' AND (q."reviewedById" IS NULL OR q."reviewedAt" IS NULL)) OR
        (SELECT count(*) FROM quiz_options o WHERE o."questionId" = q.id AND o."isCorrect") <> 1 OR
        (SELECT count(*) FROM quiz_options o WHERE o."questionId" = q.id) < 2 OR
        (q.type = 'TRUE_FALSE' AND (SELECT count(*) FROM quiz_options o WHERE o."questionId" = q.id) <> 2)
      )
    ) THEN RAISE EXCEPTION 'Quiz needs reviewed questions and valid options' USING ERRCODE = '23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER quiz_publication BEFORE INSERT OR UPDATE ON quizzes FOR EACH ROW EXECUTE FUNCTION protect_quiz_publication();
COMMIT;
