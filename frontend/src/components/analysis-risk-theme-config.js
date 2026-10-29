import { CircleHelp, ShieldAlert, ShieldCheck, Siren, TriangleAlert } from 'lucide-react';

export const ANALYSIS_SEVERITY_THEMES = Object.freeze({
  LOW: Object.freeze({ level: 'LOW', label: 'Low risk', summary: 'No known threat detected by the available checks.', Icon: ShieldCheck }),
  MEDIUM: Object.freeze({ level: 'MEDIUM', label: 'Medium risk', summary: 'The available evidence warrants caution and closer review.', Icon: ShieldAlert }),
  HIGH: Object.freeze({ level: 'HIGH', label: 'High risk', summary: 'The available evidence indicates a likely security threat.', Icon: TriangleAlert }),
  CRITICAL: Object.freeze({ level: 'CRITICAL', label: 'Critical risk', summary: 'The available evidence indicates a critical security situation.', Icon: Siren }),
});

export const NEUTRAL_ANALYSIS_THEME = Object.freeze({
  level: null,
  label: 'Risk unavailable',
  summary: 'The available evidence is incomplete or no risk result is available.',
  Icon: CircleHelp,
});

export function normalizeRiskLevel(value) {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return Object.hasOwn(ANALYSIS_SEVERITY_THEMES, normalized) ? normalized : null;
}

export function getAnalysisRiskLevel(risk) {
  return normalizeRiskLevel(risk?.riskLevel);
}

export function getAnalysisSeverityTheme(risk, { neutral = false } = {}) {
  if (neutral) return NEUTRAL_ANALYSIS_THEME;
  const level = getAnalysisRiskLevel(risk);
  return level ? ANALYSIS_SEVERITY_THEMES[level] : NEUTRAL_ANALYSIS_THEME;
}
