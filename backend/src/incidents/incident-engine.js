import { projectToolResult } from '../ai/tools/tool-results.js';
import { INCIDENT_ESCALATION_POLICY as POLICY, escalationDecision } from './escalation-policy.js';

const sources = Object.freeze({ EMAIL: 'emailAnalysis', URL: 'urlAnalysis', FILE: 'fileAnalysis' });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class IncidentError extends Error {
  constructor(status, code) { super('The stored analysis could not be escalated.'); this.status = status; this.code = code; }
}
const reference = (row) => `INC-${row.createdAt.getUTCFullYear()}-${String(row.number).padStart(6, '0')}`;
function receipt(row, created) {
  return { created, state: 'RECORDED', reference: reference(row), severity: row.severity,
    status: row.status, urgent: row.escalationMetadata.urgent === true, createdAt: row.createdAt.toISOString() };
}

// The caller supplies identity only. Severity/evidence always come from storage.
export async function createIncidentFromAnalysis(database, { analyzerType, analysisId, userId }) {
  if (!Object.hasOwn(sources, analyzerType) || !uuid.test(analysisId ?? '') || !uuid.test(userId ?? '')) {
    throw new IncidentError(400, 'INVALID_INCIDENT_SOURCE');
  }
  // PostgreSQL UUID equality ignores case; the text idempotency key must too.
  analysisId = analysisId.toLowerCase();
  userId = userId.toLowerCase();
  const sourceKey = `${analyzerType}:${analysisId}`;
  try {
    return await database.$transaction(async (tx) => {
      // Serialize this source across processes, including recovery calls. The
      // unique index remains the final database-enforced idempotency boundary.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${sourceKey}, 1010))`;
      const existing = await tx.incident.findUnique({ where: { sourceKey } });
      if (existing) {
        if (existing.reporterId !== userId) throw new IncidentError(404, 'INCIDENT_SOURCE_NOT_FOUND');
        return receipt(existing, false);
      }
      const row = await tx[sources[analyzerType]].findFirst({ where: { id: analysisId, userId } });
      if (!row) throw new IncidentError(404, 'INCIDENT_SOURCE_NOT_FOUND');
      if (row.status !== 'COMPLETED' || !row.analyzedAt) throw new IncidentError(409, 'FINALIZED_RISK_REQUIRED');
      // Expiry is a retention deadline, not permission to discard an outstanding
      // escalation. A still-stored completed analysis can be recovered after it.
      let safe;
      try { safe = projectToolResult({ name: 'get_analysis_result' }, analyzerType, row).data; }
      catch { throw new IncidentError(409, 'FINALIZED_RISK_REQUIRED'); }
      const decision = escalationDecision(safe.risk);
      if (!decision.eligible) return { created: false, state: 'NOT_REQUIRED', reason: 'AUTOMATIC_ESCALATION_NOT_REQUIRED' };
      const now = new Date();
      const snapshot = {
        analysisId, analyzerType, analyzedAt: row.analyzedAt.toISOString(),
        risk: safe.risk, indicatorCodes: safe.indicatorCodes,
        scannerStatuses: safe.scannerStatuses, providerStatuses: safe.providerStatuses,
        evidenceCoverage: coverage(row.evidence.risk.evidenceCoverage),
        checks: minimizedChecks(analyzerType, row.evidence),
        ...(analyzerType === 'FILE' ? { sha256: /^[a-f0-9]{64}$/i.test(row.sha256) ? row.sha256 : null,
          sizeBytes: String(row.sizeBytes) } : {}),
      };
      const incident = await tx.incident.create({ data: {
        sourceKey, reporterId: row.userId, title: `${analyzerType} analysis requires security review`,
        description: 'Automatic escalation from finalized risk evidence. Human validation is required; severity is not proof of maliciousness.',
        severity: safe.risk.riskLevel, riskScore: safe.risk.score, riskRuleVersion: safe.risk.version,
        type: 'SUSPICIOUS_ACTIVITY', detectionSource: `${analyzerType}_ANALYSIS`, status: POLICY.initialStatus,
        escalationMetadata: { ...decision, confidence: safe.risk.confidence, reasonCodes: safe.risk.reasonCodes },
        retentionUntil: new Date(now.getTime() + POLICY.reviewAfterDays * 86400_000),
        evidence: { create: { summary: 'Minimized finalized analysis evidence; no raw submitted content.', snapshot,
          [`${sources[analyzerType]}Id`]: analysisId } },
      } });
      await tx.incidentEvent.create({ data: { incidentId: incident.id, type: 'CREATED', details: {
        event: 'INCIDENT_CREATED', source: 'AUTOMATED_RISK_ENGINE', policyVersion: decision.policyVersion,
        reference: reference(incident), severity: incident.severity, status: incident.status,
        createdAt: incident.createdAt.toISOString(), urgent: decision.urgent,
      } } });
      return receipt(incident, true);
    });
  } catch (error) {
    if (error instanceof IncidentError) throw error;
    throw new IncidentError(503, 'ESCALATION_PENDING');
  }
}

const coverageSources = ['EMAIL_LOCAL', 'EMAIL_SPF_CLAIMS', 'EMAIL_DKIM_CLAIMS', 'EMAIL_DMARC_CLAIMS',
  'EMAIL_LINK_REPUTATION', 'EMAIL_ATTACHMENT_SCANS', 'URL_LOCAL', 'DNS', 'TLS', 'VIRUSTOTAL',
  'VIRUSTOTAL_URL', 'VIRUSTOTAL_DOMAIN', 'VIRUSTOTAL_URL_AND_DOMAIN', 'VIRUSTOTAL_FILE', 'VIRUSTOTAL_FILE_HASH', 'CLAMAV', 'YARA', 'FILE_LOCAL'];
function coverage(value) {
  const list = (entries) => Array.isArray(entries) ? entries.filter((entry) => coverageSources.includes(entry)) : [];
  return { availableSources: list(value?.availableSources), unavailableSources: list(value?.unavailableSources),
    conflicting: value?.conflicting === true, unavailable: !value };
}

function minimizedChecks(type, evidence) {
  const count = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 10000 ? value : null;
  const states = (value, allowed) => allowed.includes(value) ? value : 'UNAVAILABLE';
  if (type === 'EMAIL') return { authentication: Object.fromEntries(['spf', 'dkim', 'dmarc'].map((key) => [key, {
    status: states(evidence.authentication?.[key]?.status, ['HEADER_CLAIM', 'CONFLICTING_CLAIMS', 'UNAVAILABLE']),
    claimedResults: Array.isArray(evidence.authentication?.[key]?.claimedResults)
      ? evidence.authentication[key].claimedResults.filter((s) => ['PASS', 'FAIL', 'SOFTFAIL', 'NEUTRAL', 'NONE', 'TEMPERROR', 'PERMERROR'].includes(s)).slice(0, 128) : [],
    verified: false,
  }])) };
  const reports = type === 'URL' ? evidence.threatIntelligence : [evidence.threatIntelligence];
  return { reputation: Array.isArray(reports) ? reports.slice(0, 4).filter((r) => r?.provider === 'VIRUSTOTAL').map((r) => ({
    provider: 'VIRUSTOTAL', available: r.status === 'AVAILABLE',
    ...(r.status === 'AVAILABLE' ? Object.fromEntries(['maliciousCount', 'suspiciousCount', 'harmlessCount', 'undetectedCount'].map((key) => [key, count(r[key])])) : {}),
  })) : [], ...(type === 'FILE' ? {
    normalizedType: states(evidence.file?.detectedType, ['PDF', 'ZIP', 'DOCX', 'XLSX', 'PPTX', 'PE', 'TEXT', 'PNG', 'JPEG', 'GIF']),
  } : {}) };
}

// A completed scan remains recoverable even when the escalation transaction fails.
export async function completeAnalysisEscalation(database, source) {
  try { return await createIncidentFromAnalysis(database, source); }
  catch {
    return { created: false, state: 'PENDING', reason: 'ESCALATION_PENDING', retryable: true,
      retryPath: `/api/analysis-escalations/${source.analyzerType}/${source.analysisId}/retry` };
  }
}
