import { getAnalysisRiskLevel, getAnalysisSeverityTheme } from './analysis-risk-theme-config.js';

export function AnalysisSeverityIcon({ risk, neutral = false, className = '', ...props }) {
  const { Icon } = getAnalysisSeverityTheme(risk, { neutral });
  return <Icon className={className} aria-hidden="true" {...props} />;
}

export function AnalysisPageTheme({ risk, children, className = '' }) {
  const level = getAnalysisRiskLevel(risk);
  return (
    <div className={`analysis-theme ${className}`.trim()} data-risk-theme={level || 'NEUTRAL'}>
      {children}
    </div>
  );
}

export function AnalysisRiskPanel({
  risk,
  neutral = false,
  as: Component = 'div',
  className = '',
  children,
  ...props
}) {
  const level = neutral ? null : getAnalysisRiskLevel(risk);
  return (
    <Component
      className={`analysis-risk-panel ${className}`.trim()}
      data-risk-theme={level || 'NEUTRAL'}
      {...props}
    >
      {children}
    </Component>
  );
}
