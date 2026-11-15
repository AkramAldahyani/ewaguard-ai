// Existing analysis columns plus a minimized, audit-compatible JSON projection.
// Call only with the server-computed result, never request data.
export function riskColumns(risk) {
  return { riskScore: risk.score, severity: risk.riskLevel, riskRuleVersion: risk.version };
}

export function riskSnapshot(risk) {
  return {
    analyzerType: risk.analyzerType,
    score: risk.score,
    riskLevel: risk.riskLevel,
    confidence: risk.confidence,
    version: risk.version,
    reasonCodes: risk.reasons.map(({ code }) => code),
    evaluatedAt: risk.evaluatedAt,
    evidenceCoverage: risk.evidenceCoverage,
  };
}
