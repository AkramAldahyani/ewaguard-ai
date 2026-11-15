import { buildIncidentAssistance } from '../../assistance/incident-assistance.js';
import { completeAnalysisEscalation } from '../../incidents/incident-engine.js';
import { createHash } from 'node:crypto';
import { normalizeUrl } from './url-normalization.js';
import { localUrlIndicators, classifyUrl } from './url-local.js';
import { resolvePublicTarget, inspectTls } from './url-network.js';
import { createThreatIntelligence } from '../../services/threat-intelligence.js';
import { evaluateRisk } from '../../risk/risk-engine.js';
import { riskColumns } from '../../risk/risk-persistence.js';
import { retentionExpiry } from '../../privacy/retention-policy.js';

export function createUrlAnalyzer({
  resolveTarget = resolvePublicTarget,
  tlsInspector = inspectTls,
  threatIntelligence = createThreatIntelligence(),
} = {}) {
  return async (input) => {
    const parsed = normalizeUrl(input);
    const localIndicators = localUrlIndicators(parsed);
    const target = await resolveTarget(parsed.normalized.hostname);
    const tlsEvidence = await tlsInspector(parsed.normalized, target.addresses);
    const threatEvidence = [];
    if (target.addresses.length) {
      // Sequential so a 429 stops subsequent quota use through provider cooldown.
      threatEvidence.push(await threatIntelligence.lookupUrl(parsed.url.href));
      threatEvidence.push(await threatIntelligence.lookupDomain(parsed.normalized.hostname));
    } else threatEvidence.push({ provider: 'VIRUSTOTAL', scope: 'URL_AND_DOMAIN', status: 'SKIPPED_DNS' });
    return {
      analyzer: 'URL',
      version: '6B.1',
      normalizedUrl: parsed.normalized,
      localIndicators,
      dnsEvidence: target.evidence,
      tlsEvidence,
      threatIntelligence: threatEvidence,
      provisionalClassification: classifyUrl(localIndicators, tlsEvidence, threatEvidence),
      recommendations: [
        'Verify the domain spelling carefully. Use an official bookmark or manually type the known company URL.',
        'Do not enter credentials on a suspicious website. Report suspicious URLs to the security team.',
        'If credentials were already entered, change the password through the official service and contact security.',
      ],
      limitations: [
        'These are provisional analyzer findings, not a final risk severity. No strong indicators does not guarantee safety.',
        'No webpage, redirect, favicon, screenshot, or remote image was loaded. Shortened destinations are not expanded.',
        'DNS is a point-in-time observation. TLS inspects one validated public address on port 443 only; a valid certificate does not prove trustworthiness.',
        'Domain extraction is an approximation, not a complete public suffix or brand ownership check. Mixed-script checks cover Latin, Greek and Cyrillic only.',
        'VirusTotal reports may be absent, stale, incomplete, or incorrect. URL and domain reports may overlap and are not independent votes.',
        'Only public domains and root URLs may be queried at VirusTotal. Paths, queries and fragments are not sent; domain reports do not assess the exact page.',
        'Paths, query values, unknown parameter names and fragments are omitted from results and storage. Redaction cannot guarantee detection of all secrets, especially in hostnames.',
      ],
    };
  };
}

export async function submitUrlAnalysis(database, { userId, acknowledgementId, input }, analyzer) {
  const result = await analyzer(input);
  const saved = await persistUrlAnalysis(database, { userId, acknowledgementId, result });
  return {
    ...saved,
    incident: await completeAnalysisEscalation(database, { userId, analyzerType: 'URL', analysisId: saved.analysisId }),
  };
}

export async function persistUrlAnalysis(database, { userId, acknowledgementId, result }) {
  const now = new Date();
  result.risk = evaluateRisk({ analyzerType: 'URL', evidence: result, evaluatedAt: now.toISOString() });
  const assistance = buildIncidentAssistance({ analyzerType: 'URL', riskResult: result.risk });
  // Hash the minimized representation, never a raw token-bearing URL.
  const stored = await database.urlAnalysis.create({
    data: {
      userId,
      acknowledgementId,
      status: 'COMPLETED',
      hostname: result.normalizedUrl.hostname,
      urlSha256: createHash('sha256').update(result.normalizedUrl.redactedUrl).digest('hex'),
      evidence: result,
      analyzedAt: now,
      expiresAt: retentionExpiry('url', now),
      ...riskColumns(result.risk),
    },
    select: { id: true, createdAt: true },
  });
  return { analysisId: stored.id, createdAt: stored.createdAt.toISOString(), result: { ...result, assistance } };
}
