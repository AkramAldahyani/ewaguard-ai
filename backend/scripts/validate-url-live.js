// Explicit opt-in only; never imported by the normal test suite.
import { parseConfig } from '../src/config/env.js';
import { createThreatIntelligence } from '../src/services/threat-intelligence.js';

const { virusTotalApiKey } = parseConfig();
if (!virusTotalApiKey) {
  console.info('VirusTotal is not configured; live check skipped.');
} else {
  const provider = createThreatIntelligence({ apiKey: virusTotalApiKey });
  const report = await provider.lookupUrl('https://example.com/');
  const secretExposure = JSON.stringify(report).includes(virusTotalApiKey);
  console.info(JSON.stringify({ providerReachable: ['AVAILABLE', 'NO_REPORT', 'UNAUTHORIZED', 'RATE_LIMITED'].includes(report.status),
    normalizedResponseReceived: report.status === 'AVAILABLE', noSecretExposure: !secretExposure }));
  if (report.status !== 'AVAILABLE' || secretExposure) process.exitCode = 1;
}
