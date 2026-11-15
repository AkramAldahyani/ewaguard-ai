import { CircleHelp, ShieldAlert, ShieldCheck, Siren, TriangleAlert } from 'lucide-react';
import { severityTone } from './incident-flow.js';

// Severity is always communicated with a label and icon as well as colour.
const severityMeta = {
  CRITICAL: { label: 'Critical risk', short: 'Critical', Icon: Siren, urgency: 'Immediate review' },
  HIGH: { label: 'High risk', short: 'High', Icon: TriangleAlert, urgency: 'Priority review' },
  MEDIUM: { label: 'Medium risk', short: 'Medium', Icon: ShieldAlert },
  LOW: { label: 'Low risk', short: 'Low', Icon: ShieldCheck },
  NEUTRAL: { label: 'Risk unavailable', short: 'Unavailable', Icon: CircleHelp },
};
export const severityInfo = (value) => severityMeta[severityTone(value)];
