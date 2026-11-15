import { buildIncidentAssistance } from '../../assistance/incident-assistance.js';
import { completeAnalysisEscalation } from '../../incidents/incident-engine.js';
import { analyzeEmail } from './email-analyzer.js';
import { minimizeEmailEvidence } from './email-privacy.js';
import { evaluateRisk } from '../../risk/risk-engine.js';
import { riskColumns } from '../../risk/risk-persistence.js';
import { retentionExpiry } from '../../privacy/retention-policy.js';

export async function submitEmailAnalysis(database, { userId, acknowledgementId, input }, analyzer = analyzeEmail) {
  const result = await analyzer(input);
  const saved = await persistEmailAnalysis(database, { userId, acknowledgementId, result });
  return {
    ...saved,
    incident: await completeAnalysisEscalation(database, {
      userId,
      analyzerType: 'EMAIL',
      analysisId: saved.analysisId,
    }),
  };
}

// Persistence is shared with approved execution so the result and consumption
// receipt can commit together, without holding a transaction across analysis.
export async function persistEmailAnalysis(database, { userId, acknowledgementId, result }) {
  const now = new Date();
  result.risk = evaluateRisk({ analyzerType: 'EMAIL', evidence: result, evaluatedAt: now.toISOString() });
  const assistance = buildIncidentAssistance({ analyzerType: 'EMAIL', riskResult: result.risk });
  // One atomic insert: never store pending records or display metadata.
  const stored = await database.emailAnalysis.create({
    data: {
      userId,
      acknowledgementId,
      status: 'COMPLETED',
      analyzedAt: now,
      expiresAt: retentionExpiry('email', now),
      evidence: minimizeEmailEvidence(result),
      ...riskColumns(result.risk),
    },
    select: { id: true, createdAt: true },
  });
  return { analysisId: stored.id, createdAt: stored.createdAt.toISOString(), result: { ...result, assistance } };
}
