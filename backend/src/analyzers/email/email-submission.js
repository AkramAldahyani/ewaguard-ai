import { analyzeEmail } from './email-analyzer.js';
import { minimizeEmailEvidence } from './email-privacy.js';

export const EMAIL_RETENTION_MS = 30 * 24 * 60 * 60_000;

export async function submitEmailAnalysis(database, { userId, acknowledgementId, input }, analyzer = analyzeEmail) {
  const result = await analyzer(input);
  const now = new Date();
  // One atomic insert: never store pending records or display metadata.
  const stored = await database.emailAnalysis.create({
    data: {
      userId, acknowledgementId, status: 'COMPLETED', analyzedAt: now,
      expiresAt: new Date(now.getTime() + EMAIL_RETENTION_MS),
      evidence: minimizeEmailEvidence(result),
    },
    select: { id: true, createdAt: true },
  });
  return { analysisId: stored.id, createdAt: stored.createdAt.toISOString(), result };
}
