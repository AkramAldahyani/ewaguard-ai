import { projectToolResult } from '../ai/tools/tool-results.js';
import { persistIncidentNotifications } from '../notifications/notification-service.js';
import {
  INCIDENT_ESCALATION_POLICY as POLICY,
  EXPOSURE_REPORT_POLICY as EXPOSURE,
  escalationDecision,
  incidentTypeFor,
} from './escalation-policy.js';
import { projectStoredGuidance } from './incident-detail.js';
import { escalateConfirmedRisk } from '../risk/risk-engine.js';
import { buildIncidentAssistance } from '../assistance/incident-assistance.js';

const sources = Object.freeze({ EMAIL: 'emailAnalysis', URL: 'urlAnalysis', FILE: 'fileAnalysis' });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class IncidentError extends Error {
  constructor(status, code) {
    super('The stored analysis could not be escalated.');
    this.status = status;
    this.code = code;
  }
}
const reference = (row) => `INC-${row.createdAt.getUTCFullYear()}-${String(row.number).padStart(6, '0')}`;
function receipt(row, created) {
  return {
    created,
    state: 'RECORDED',
    reference: reference(row),
    severity: row.severity,
    status: row.status,
    urgent: row.escalationMetadata.urgent === true,
    createdAt: row.createdAt.toISOString(),
  };
}

function identify(analyzerType, analysisId, userId, allowed) {
  if (!allowed.includes(analyzerType) || !uuid.test(analysisId ?? '') || !uuid.test(userId ?? '')) {
    throw new IncidentError(400, 'INVALID_INCIDENT_SOURCE');
  }
  // PostgreSQL UUID equality ignores case; the text idempotency key must too.
  return { analysisId: analysisId.toLowerCase(), userId: userId.toLowerCase() };
}

async function finalizedAnalysis(tx, analyzerType, analysisId, userId) {
  const row = await tx[sources[analyzerType]].findFirst({ where: { id: analysisId, userId } });
  if (!row) throw new IncidentError(404, 'INCIDENT_SOURCE_NOT_FOUND');
  if (row.status !== 'COMPLETED' || !row.analyzedAt) throw new IncidentError(409, 'FINALIZED_RISK_REQUIRED');
  // Expiry is a retention deadline, not permission to discard an outstanding
  // escalation. A still-stored completed analysis can be recovered after it.
  try {
    return { row, safe: projectToolResult({ name: 'get_analysis_result' }, analyzerType, row).data };
  } catch {
    throw new IncidentError(409, 'FINALIZED_RISK_REQUIRED');
  }
}

// One creation path for automatic escalation and employee-confirmed exposure. `exposure` carries the
// deterministically escalated risk and guidance; without it the stored analyzer risk is recorded unchanged.
async function recordIncident(tx, { analyzerType, analysisId, row, safe, exposure }) {
  const risk = exposure?.risk ?? safe.risk;
  const decision = escalationDecision(risk);
  const now = new Date();
  const source = exposure ? EXPOSURE.source : 'AUTOMATED_RISK_ENGINE';
  const snapshot = {
    analysisId,
    analyzerType,
    analyzedAt: row.analyzedAt.toISOString(),
    risk,
    indicatorCodes: safe.indicatorCodes,
    assistance: exposure?.assistance ?? safe.assistance,
    scannerStatuses: safe.scannerStatuses,
    providerStatuses: safe.providerStatuses,
    evidenceCoverage: coverage(row.evidence.risk.evidenceCoverage),
    checks: minimizedChecks(analyzerType, row.evidence),
    ...(analyzerType === 'FILE'
      ? { sha256: /^[a-f0-9]{64}$/i.test(row.sha256) ? row.sha256 : null, sizeBytes: String(row.sizeBytes) }
      : {}),
    ...(exposure ? { originalRisk: safe.risk, reportedExposure: exposure.record } : {}),
  };
  // The reporter's department at the time of the report, for queue filters and department analytics.
  const reporter = await tx.user.findUnique({ where: { id: row.userId }, select: { departmentId: true } });
  const incident = await tx.incident.create({
    data: {
      sourceKey: `${analyzerType}:${analysisId}`,
      reporterId: row.userId,
      departmentId: reporter?.departmentId ?? null,
      title: exposure
        ? `Credential exposure reported after ${analyzerType} analysis`
        : `${analyzerType} analysis requires security review`,
      description: exposure
        ? 'The employee confirmed entering credentials after interacting with the analyzed item. Human validation is required; severity is not proof of maliciousness.'
        : 'Automatic escalation from finalized risk evidence. Human validation is required; severity is not proof of maliciousness.',
      severity: risk.riskLevel,
      riskScore: risk.score,
      riskRuleVersion: risk.version,
      type: exposure ? EXPOSURE.incidentType : incidentTypeFor(risk.reasonCodes),
      detectionSource: `${analyzerType}_ANALYSIS`,
      status: POLICY.initialStatus,
      escalationMetadata: {
        ...decision,
        confidence: risk.confidence,
        reasonCodes: risk.reasonCodes,
        ...(exposure ? { reportedExposure: exposure.record } : {}),
      },
      retentionUntil: new Date(now.getTime() + POLICY.reviewAfterDays * 86400_000),
      evidence: {
        create: {
          summary: 'Minimized finalized analysis evidence; no raw submitted content.',
          snapshot,
          [`${sources[analyzerType]}Id`]: analysisId,
        },
      },
    },
  });
  await tx.incidentEvent.create({
    data: {
      incidentId: incident.id,
      actorId: exposure ? row.userId : null,
      type: 'CREATED',
      details: {
        event: 'INCIDENT_CREATED',
        source,
        policyVersion: decision.policyVersion,
        reference: reference(incident),
        severity: incident.severity,
        status: incident.status,
        createdAt: incident.createdAt.toISOString(),
        urgent: decision.urgent,
        ...(exposure ? { exposure: EXPOSURE.type } : {}),
      },
    },
  });
  await tx.auditLog.create({
    data: {
      actorId: exposure ? row.userId : null,
      action: 'INCIDENT_CREATED',
      resourceType: 'INCIDENT',
      resourceId: incident.id,
      outcome: 'SUCCESS',
      metadata: exposure
        ? { source, exposure: EXPOSURE.type, policyVersion: decision.policyVersion, analyzerType }
        : { system: source, policyVersion: decision.policyVersion, analyzerType },
      retentionUntil: new Date(now.getTime() + 90 * 86400000),
    },
  });
  await persistIncidentNotifications(tx, incident, 'INCIDENT_CREATED', `created:${incident.id}`);
  return incident;
}

// The caller supplies identity only. Severity/evidence always come from storage.
export async function createIncidentFromAnalysis(database, { analyzerType, analysisId, userId }) {
  ({ analysisId, userId } = identify(analyzerType, analysisId, userId, Object.keys(sources)));
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
      const { row, safe } = await finalizedAnalysis(tx, analyzerType, analysisId, userId);
      if (!escalationDecision(safe.risk).eligible)
        return { created: false, state: 'NOT_REQUIRED', reason: 'AUTOMATIC_ESCALATION_NOT_REQUIRED' };
      return receipt(await recordIncident(tx, { analyzerType, analysisId, row, safe }), true);
    });
  } catch (error) {
    if (error instanceof IncidentError) throw error;
    throw new IncidentError(503, 'ESCALATION_PENDING');
  }
}

// Employee-confirmed credential exposure ("I entered my credentials") for one of the employee's own email or URL
// analyses. The route supplies the authenticated identity and a fixed confirmation; nothing here is derived from
// analyzed content, chat text or model output. The risk engine raises the stored risk to CRITICAL, and the
// incident is created, or the existing one upgraded, in a single transaction. Repeated reports change nothing.
export async function reportCredentialExposure(database, { analyzerType, analysisId, userId }) {
  ({ analysisId, userId } = identify(analyzerType, analysisId, userId, EXPOSURE.analyzers));
  const sourceKey = `${analyzerType}:${analysisId}`;
  const escalate = (stored) => {
    try {
      const risk = escalateConfirmedRisk(stored, { corporateCredentialsSubmittedToPhishingSite: true });
      return {
        risk,
        assistance: buildIncidentAssistance({
          analyzerType,
          riskResult: risk,
          evidenceContext: { credentialsExposed: true },
        }),
      };
    } catch {
      throw new IncidentError(409, 'FINALIZED_RISK_REQUIRED');
    }
  };
  const result = (incident, created, assistance, recorded = true) => ({
    ...receipt(incident, created),
    exposure: EXPOSURE.type,
    exposureRecorded: recorded,
    assistance,
  });
  try {
    return await database.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${sourceKey}, 1010))`;
      const existing = await tx.incident.findUnique({ where: { sourceKey }, select: { id: true, reporterId: true } });
      if (!existing) {
        const { row, safe } = await finalizedAnalysis(tx, analyzerType, analysisId, userId);
        const exposure = {
          ...escalate(safe.risk),
          record: { type: EXPOSURE.type, source: EXPOSURE.source, reportedAt: new Date().toISOString() },
        };
        return result(
          await recordIncident(tx, { analyzerType, analysisId, row, safe, exposure }),
          true,
          exposure.assistance,
        );
      }
      if (existing.reporterId !== userId) throw new IncidentError(404, 'INCIDENT_SOURCE_NOT_FOUND');
      // Serialize with administrators changing the same incident.
      await tx.$queryRaw`SELECT id FROM incidents WHERE id = ${existing.id}::uuid FOR UPDATE`;
      const incident = await tx.incident.findUnique({
        where: { id: existing.id },
        include: { evidence: { take: 1, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
      });
      const evidence = incident.evidence[0];
      const snapshot = evidence?.snapshot;
      const stored = snapshot?.risk;
      if (
        snapshot?.analyzerType !== analyzerType ||
        snapshot.analysisId !== analysisId ||
        !stored ||
        stored.analyzerType !== analyzerType ||
        stored.score !== incident.riskScore ||
        stored.riskLevel !== incident.severity ||
        stored.version !== incident.riskRuleVersion
      ) {
        throw new IncidentError(409, 'FINALIZED_RISK_REQUIRED');
      }
      if (incident.escalationMetadata?.reportedExposure) {
        const saved = projectStoredGuidance(snapshot.assistance, stored);
        return result(incident, false, saved.status === 'AVAILABLE' ? saved.assistance : null, false);
      }
      const { risk, assistance } = escalate(stored);
      const now = new Date(Math.max(Date.now(), incident.updatedAt.getTime() + 1));
      const record = { type: EXPOSURE.type, source: EXPOSURE.source, reportedAt: now.toISOString() };
      const reopened = EXPOSURE.reopenFrom.includes(incident.status);
      await tx.incidentEvidence.update({
        where: { id: evidence.id },
        data: { snapshot: { ...snapshot, originalRisk: stored, risk, assistance, reportedExposure: record } },
      });
      const updated = await tx.incident.update({
        where: { id: incident.id },
        data: {
          severity: risk.riskLevel,
          riskScore: risk.score,
          type: EXPOSURE.incidentType,
          updatedAt: now,
          escalationMetadata: {
            ...incident.escalationMetadata,
            urgent: escalationDecision(risk).urgent,
            reasonCodes: risk.reasonCodes,
            reportedExposure: record,
          },
          // A finished incident returns to the investigation queue: the exposure is new information.
          ...(reopened ? { status: EXPOSURE.reopenTo, resolvedAt: null, closedAt: null } : {}),
        },
      });
      const changes = { exposure: EXPOSURE.type, source: EXPOSURE.source };
      await tx.incidentEvent.create({
        data: {
          incidentId: incident.id,
          actorId: userId,
          ...(incident.severity === risk.riskLevel
            ? { type: 'EVIDENCE_ADDED', details: changes }
            : {
                type: 'SEVERITY_CHANGED',
                details: { ...changes, fromSeverity: incident.severity, toSeverity: risk.riskLevel },
              }),
        },
      });
      if (reopened)
        await tx.incidentEvent.create({
          data: {
            incidentId: incident.id,
            actorId: userId,
            type: 'STATUS_CHANGED',
            details: { ...changes, fromStatus: incident.status, toStatus: EXPOSURE.reopenTo },
          },
        });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'INCIDENT_EXPOSURE_REPORTED',
          resourceType: 'INCIDENT',
          resourceId: incident.id,
          outcome: 'SUCCESS',
          metadata: { ...changes, analyzerType, fromSeverity: incident.severity, toSeverity: risk.riskLevel, reopened },
          retentionUntil: new Date(now.getTime() + 90 * 86400000),
        },
      });
      await persistIncidentNotifications(tx, updated, 'EXPOSURE_REPORTED', `exposure:${incident.id}`);
      return result(updated, false, assistance);
    });
  } catch (error) {
    if (error instanceof IncidentError) throw error;
    throw new IncidentError(503, 'ESCALATION_PENDING');
  }
}

const coverageSources = [
  'EMAIL_LOCAL',
  'EMAIL_SPF_CLAIMS',
  'EMAIL_DKIM_CLAIMS',
  'EMAIL_DMARC_CLAIMS',
  'EMAIL_LINK_REPUTATION',
  'EMAIL_ATTACHMENT_SCANS',
  'URL_LOCAL',
  'DNS',
  'TLS',
  'VIRUSTOTAL',
  'VIRUSTOTAL_URL',
  'VIRUSTOTAL_DOMAIN',
  'VIRUSTOTAL_URL_AND_DOMAIN',
  'VIRUSTOTAL_FILE',
  'VIRUSTOTAL_FILE_HASH',
  'CLAMAV',
  'YARA',
  'FILE_LOCAL',
];
function coverage(value) {
  const list = (entries) => (Array.isArray(entries) ? entries.filter((entry) => coverageSources.includes(entry)) : []);
  return {
    availableSources: list(value?.availableSources),
    unavailableSources: list(value?.unavailableSources),
    conflicting: value?.conflicting === true,
    unavailable: !value,
  };
}

function minimizedChecks(type, evidence) {
  const count = (value) => (Number.isSafeInteger(value) && value >= 0 && value <= 10000 ? value : null);
  const states = (value, allowed) => (allowed.includes(value) ? value : 'UNAVAILABLE');
  if (type === 'EMAIL')
    return {
      authentication: Object.fromEntries(
        ['spf', 'dkim', 'dmarc'].map((key) => [
          key,
          {
            status: states(evidence.authentication?.[key]?.status, [
              'HEADER_CLAIM',
              'CONFLICTING_CLAIMS',
              'UNAVAILABLE',
            ]),
            claimedResults: Array.isArray(evidence.authentication?.[key]?.claimedResults)
              ? evidence.authentication[key].claimedResults
                  .filter((s) => ['PASS', 'FAIL', 'SOFTFAIL', 'NEUTRAL', 'NONE', 'TEMPERROR', 'PERMERROR'].includes(s))
                  .slice(0, 128)
              : [],
            verified: false,
          },
        ]),
      ),
    };
  const reports = type === 'URL' ? evidence.threatIntelligence : [evidence.threatIntelligence];
  return {
    reputation: Array.isArray(reports)
      ? reports
          .slice(0, 4)
          .filter((r) => r?.provider === 'VIRUSTOTAL')
          .map((r) => ({
            provider: 'VIRUSTOTAL',
            available: r.status === 'AVAILABLE',
            ...(r.status === 'AVAILABLE'
              ? Object.fromEntries(
                  ['maliciousCount', 'suspiciousCount', 'harmlessCount', 'undetectedCount'].map((key) => [
                    key,
                    count(r[key]),
                  ]),
                )
              : {}),
          }))
      : [],
    ...(type === 'FILE'
      ? {
          normalizedType: states(evidence.file?.detectedType, [
            'PDF',
            'ZIP',
            'DOCX',
            'XLSX',
            'PPTX',
            'PE',
            'TEXT',
            'PNG',
            'JPEG',
            'GIF',
          ]),
        }
      : {}),
  };
}

// A completed scan remains recoverable even when the escalation transaction fails.
export async function completeAnalysisEscalation(database, source) {
  try {
    return await createIncidentFromAnalysis(database, source);
  } catch {
    return {
      created: false,
      state: 'PENDING',
      reason: 'ESCALATION_PENDING',
      retryable: true,
      retryPath: `/api/analysis-escalations/${source.analyzerType}/${source.analysisId}/retry`,
    };
  }
}
