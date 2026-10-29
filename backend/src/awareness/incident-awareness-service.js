import { DISCLAIMER_DEFINITION } from "../../../shared/disclaimer.js";
import {
  securityPeriod,
  SecurityAnalyticsError,
} from "../analytics/security-analytics.js";
import { fields, identifier } from "../training/training-policy.js";

const minimumPatternCount = 3;
const fiveMinutes = 5 * 60_000;
const tenMinutes = 10 * 60_000;
const definitions = Object.freeze({
  PHISHING: {
    topics: ["PHISHING"],
    title: "Recognize phishing attempts",
    body: "Recent incident reports indicate phishing activity. Verify unexpected messages through approved channels and report suspicious requests to the security team.",
  },
  MALWARE: {
    topics: ["MALWARE"],
    title: "Handle suspicious files carefully",
    body: "Recent incident reports indicate suspicious file activity. Do not open unexpected files, and use the approved security-reporting channel.",
  },
  CREDENTIAL_COMPROMISE: {
    topics: ["PASSWORD_SECURITY", "MFA"],
    title: "Protect account credentials",
    body: "Recent incident reports indicate credential-related concerns. Never share passwords or verification codes. Report suspected account compromise promptly.",
  },
  DATA_EXPOSURE: {
    topics: ["INFORMATION_HANDLING"],
    title: "Protect sensitive information",
    body: "Recent incident reports indicate information-handling concerns. Share restricted material only through approved channels and report suspected exposure.",
  },
  SUSPICIOUS_ACTIVITY: {
    topics: ["SAFE_BROWSING", "INCIDENT_REPORTING"],
    title: "Report suspicious activity",
    body: "Recent incident reports indicate suspicious activity. Use approved reporting channels when something unexpected occurs, and follow security-team guidance.",
  },
});

export class IncidentAwarenessError extends Error {
  constructor(status, code, message) {
    super(message);
    Object.assign(this, { status, code });
  }
}
const invalid = () => {
  throw new IncidentAwarenessError(
    400,
    "AWARENESS_ACTION_INVALID",
    "Review the warning fields and try again.",
  );
};
const safeText = (value, max) => {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    /[<>]/u.test(value) ||
    /\b(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\d{1,3}\.){3}\d{1,3}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9-]{27,}|[a-f0-9]{64}|[a-z]:\\)/iu.test(
      value,
    ) ||
    Array.from(value).some((character) => {
      const code = character.codePointAt(0);
      return code === 127 || (code < 32 && ![9, 10, 13].includes(code));
    })
  )
    invalid();
  return value.trim();
};
function rangeInput(input) {
  try {
    return securityPeriod(input);
  } catch (error) {
    if (error instanceof SecurityAnalyticsError) invalid();
    throw error;
  }
}
const whereFor = (range, category) => ({
  createdAt: { gte: range.start, lt: range.endExclusive },
  status: { not: "FALSE_POSITIVE" },
  ...(category ? { type: category } : {}),
});
const publicRange = (range) => ({
  period: range.period,
  start: range.start.toISOString().slice(0, 10),
  end: new Date(range.endExclusive.getTime() - 86_400_000)
    .toISOString()
    .slice(0, 10),
  timezone: "UTC",
  days: range.days,
});

export function createIncidentAwarenessService(database) {
  return {
    async patterns(query) {
      const range = rangeInput(query);
      const [groups, programs] = await Promise.all([
        database.incident.groupBy({
          by: ["type"],
          where: whereFor(range),
          _count: { _all: true },
        }),
        database.trainingProgram.findMany({
          where: {
            status: "PUBLISHED",
            topic: {
              in: [
                ...new Set(
                  Object.values(definitions).flatMap((item) => item.topics),
                ),
              ],
            },
          },
          select: { id: true, title: true, topic: true },
          orderBy: [{ title: "asc" }, { id: "asc" }],
          take: 101,
        }),
      ]);
      const counts = new Map(groups.map((row) => [row.type, row._count._all]));
      return {
        range: publicRange(range),
        minimumPatternCount,
        patterns: Object.entries(definitions)
          .filter(([type]) => (counts.get(type) ?? 0) >= minimumPatternCount)
          .map(([type, definition]) => ({
            incidentCategory: type,
            incidentCount: counts.get(type),
            suggestedTitle: definition.title,
            suggestedBody: definition.body,
            relatedTraining: programs
              .slice(0, 100)
              .filter((program) => definition.topics.includes(program.topic))
              .slice(0, 5),
          })),
        trainingOptionsTruncated: programs.length > 100,
      };
    },
    async prepareWarning(user, input) {
      fields(
        input,
        [
          "incidentCategory",
          "period",
          "start",
          "end",
          "title",
          "body",
          "trainingId",
          "acknowledgementId",
          "reviewed",
        ],
        [
          "incidentCategory",
          "period",
          "title",
          "body",
          "acknowledgementId",
          "reviewed",
        ],
      );
      if (
        input.reviewed !== true ||
        !Object.hasOwn(definitions, input.incidentCategory)
      )
        invalid();
      const title = safeText(input.title, 200),
        body = safeText(input.body, 5000);
      const acknowledgementId = identifier(input.acknowledgementId);
      const trainingId =
        input.trainingId == null ? null : identifier(input.trainingId);
      const range = rangeInput({
        period: input.period,
        ...(input.start == null ? {} : { start: input.start }),
        ...(input.end == null ? {} : { end: input.end }),
      });
      return database.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id}::uuid FOR UPDATE`;
        const count = await tx.incident.count({
          where: whereFor(range, input.incidentCategory),
        });
        if (count < minimumPatternCount)
          throw new IncidentAwarenessError(
            409,
            "AWARENESS_PATTERN_CHANGED",
            "This incident pattern is no longer eligible. Review the latest summary.",
          );
        const now = new Date();
        const acknowledgement = await tx.disclaimerAcknowledgement.findFirst({
          where: {
            id: acknowledgementId,
            userId: user.id,
            context: "COMMUNITY_POST",
            version: DISCLAIMER_DEFINITION.version,
            createdAt: { gte: new Date(now.getTime() - tenMinutes), lte: now },
          },
          select: { id: true },
        });
        if (!acknowledgement)
          throw new IncidentAwarenessError(
            403,
            "AWARENESS_ACKNOWLEDGEMENT_REQUIRED",
            "A current community-post acknowledgement is required.",
          );
        if (trainingId) {
          const training = await tx.trainingProgram.findUnique({
            where: { id: trainingId },
            select: { status: true, topic: true },
          });
          if (
            !training ||
            training.status !== "PUBLISHED" ||
            !definitions[input.incidentCategory].topics.includes(training.topic)
          )
            throw new IncidentAwarenessError(
              409,
              "AWARENESS_TRAINING_UNAVAILABLE",
              "Select a related published training program.",
            );
        }
        const previous = await tx.communityPost.findFirst({
          where: {
            authorId: user.id,
            status: "PENDING_REVIEW",
            category: "SECURITY_WARNING",
            title,
            body,
            trainingId,
            createdAt: { gte: new Date(now.getTime() - fiveMinutes) },
          },
          select: { id: true, status: true, trainingId: true },
        });
        if (previous) return { post: previous, alreadyPrepared: true };
        const post = await tx.communityPost.create({
          data: {
            authorId: user.id,
            acknowledgementId,
            title,
            body,
            category: "SECURITY_WARNING",
            status: "PENDING_REVIEW",
            submittedAt: now,
            trainingId,
          },
          select: { id: true, status: true, trainingId: true },
        });
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: "INCIDENT_AWARENESS_WARNING_PREPARED",
            resourceType: "COMMUNITY_POST",
            resourceId: post.id,
            outcome: "SUCCESS",
            metadata: {
              incidentCategory: input.incidentCategory,
              trainingId,
              periodStart: range.start.toISOString().slice(0, 10),
              periodEnd: new Date(range.endExclusive.getTime() - 86_400_000)
                .toISOString()
                .slice(0, 10),
            },
            retentionUntil: new Date(now.getTime() + 90 * 86_400_000),
          },
        });
        return { post, alreadyPrepared: false };
      });
    },
  };
}
