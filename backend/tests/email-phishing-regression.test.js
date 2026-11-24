import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { analyzeEmail } from '../src/analyzers/email/email-analyzer.js';
import { evaluateRisk } from '../src/risk/risk-engine.js';
import { escalationDecision } from '../src/incidents/escalation-policy.js';
import { persistEmailAnalysis } from '../src/analyzers/email/email-submission.js';
import { projectToolResult } from '../src/ai/tools/tool-results.js';

const sample = () => readFile(new URL('./fixtures/reported-paypal-phishing.eml', import.meta.url));
const risk = (evidence, confirmedContext) => evaluateRisk({ analyzerType: 'EMAIL', evidence, confirmedContext });
const ids = (result) => result.indicators.map(({ id }) => id);
const analyze = (body, headers = 'From: Alice <alice@example.invalid>') =>
  analyzeEmail({ inputType: 'PASTED', body, headers });

test('original user-supplied sample3: HIGH with matching Reply-To domain and no attachments', async (t) => {
  // Keep submitted recipient data out of committed fixtures. The sanitized
  // reconstruction below always runs, even without the local original file.
  let eml;
  try {
    eml = await readFile(new URL('../../analysis_test_files/sample3.eml', import.meta.url));
  } catch (error) {
    if (error.code === 'ENOENT') return t.skip('Original sample3.eml is not present locally');
    throw error;
  }
  const evidence = await analyzeEmail({ inputType: 'EML', eml });
  const result = risk(evidence);
  assert.equal(result.score, 67);
  assert.equal(result.riskLevel, 'HIGH');
  for (const id of [
    'SENDER_LOOKALIKE',
    'BRAND_IMPERSONATION',
    'AUTHENTICATION_CONCERN',
    'URL_SHORTENER',
    'PAYMENT_REQUEST',
    'URGENCY',
  ]) {
    assert.ok(ids(evidence).includes(id), id);
  }
  assert.equal(evidence.replyTo.domain, evidence.sender.domain);
  assert.ok(!ids(evidence).includes('REPLY_DOMAIN_MISMATCH'));
  assert.ok(ids(evidence).includes('REPLY_ADDRESS_MISMATCH'));
  assert.equal(result.reasons.find(({ code }) => code === 'EMAIL_REPLY_TO_MISMATCH').contribution, 0);
  assert.equal(evidence.attachments.length, 0);
  assert.ok(!ids(evidence).includes('CREDENTIAL_REQUEST'));
  assert.equal(evidence.urls.length, 1);
  assert.equal(evidence.urls[0].networkStatus, 'NOT_CHECKED');
  for (const method of ['spf', 'dkim', 'dmarc']) {
    assert.deepEqual(evidence.authentication[method].claimedResults, ['FAIL']);
    assert.equal(evidence.authentication[method].verified, false);
  }
  assert.equal(escalationDecision(result).eligible, true);
  assert.equal(result.scoring.criticalEligible, false);
});

test('reported sample reconstruction: HTML-only phishing is HIGH without fabricated evidence', async () => {
  const evidence = await analyzeEmail({ inputType: 'EML', eml: await sample() });
  for (const id of [
    'SENDER_LOOKALIKE',
    'BRAND_IMPERSONATION',
    'AUTHENTICATION_CONCERN',
    'URL_SHORTENER',
    'PAYMENT_REQUEST',
    'URGENCY',
  ]) {
    assert.ok(ids(evidence).includes(id), id);
  }
  for (const id of ['REPLY_DOMAIN_MISMATCH', 'REPLY_ADDRESS_MISMATCH', 'CREDENTIAL_REQUEST', 'ATTACHMENT_EXECUTABLE'])
    assert.ok(!ids(evidence).includes(id), id);
  assert.equal(evidence.sender.domain, 'paypai-resolution.com');
  assert.equal(evidence.returnPath.domain, evidence.sender.domain);
  assert.equal(evidence.attachments.length, 0);
  assert.deepEqual(evidence.urls, [
    { origin: 'https://tinyurl.com', detailsOmitted: true, networkStatus: 'NOT_CHECKED' },
  ]);
  for (const method of ['spf', 'dkim', 'dmarc'])
    assert.deepEqual(evidence.authentication[method], {
      status: 'HEADER_CLAIM',
      claimedResults: ['FAIL'],
      verified: false,
    });
  const result = risk(evidence);
  assert.equal(result.score, 67);
  assert.equal(result.riskLevel, 'HIGH');
  assert.equal(result.scoring.criticalEligible, false);
  assert.equal(result.reasons.filter(({ code }) => code === 'EMAIL_AUTH_FAILURE').length, 1);
  assert.equal(escalationDecision(result).eligible, true);
  assert.equal(escalationDecision(result).urgent, false);
  assert.equal(evidence.threatIntelligence, undefined);
});

test('legitimate brand mail stays below HIGH; isolated SPF failure remains LOW', async () => {
  const body =
    'PayPal: your monthly statement is available. If needed, dispute a transaction through your usual account.';
  const benign = await analyze(
    body,
    'From: PayPal <billing@notifications.paypal.com>\r\nReply-To: help@notifications.paypal.com\r\nAuthentication-Results: mx.invalid; spf=pass; dkim=pass; dmarc=pass',
  );
  // A different Reply-To local part plus a dispute instruction may warrant
  // caution under existing policy, but must not imply likely phishing.
  assert.ok(['LOW', 'MEDIUM'].includes(risk(benign).riskLevel));
  const ordinary = await analyze(
    'Your monthly statement is available.',
    'From: PayPal <billing@paypal.com>\r\nAuthentication-Results: mx.invalid; spf=pass; dkim=pass; dmarc=pass',
  );
  assert.equal(risk(ordinary).riskLevel, 'LOW');
  assert.ok(!ids(benign).includes('SENDER_LOOKALIKE'));
  assert.ok(!ids(benign).includes('REPLY_DOMAIN_MISMATCH'));
  const isolated = await analyze(
    'The team meeting is tomorrow.',
    'From: colleague@example.invalid\r\nAuthentication-Results: mx.invalid; spf=fail',
  );
  assert.equal(risk(isolated).score, 15);
  assert.equal(risk(isolated).riskLevel, 'LOW');
});

test('lookalikes generalize across brands, DNS case, Unicode and deceptive subdomains', async () => {
  for (const [brand, domain] of [
    ['Microsoft', 'micr0soft-billing.invalid'],
    ['Google', 'g00gle-support.invalid'],
    ['Apple', 'app1e-resolution.invalid'],
    ['PayPal', 'PAYPAI-resolution.com.'],
    ['PayPal', 'paypal.com.attacker.invalid'],
    ['PayPal', 'p\u0430ypal-resolution.invalid'],
  ]) {
    const evidence = await analyze(
      `${brand}: Dispute this transaction immediately. https://bit.ly/test`,
      `From: "${brand} Billing" <billing@${domain}>`,
    );
    assert.ok(ids(evidence).includes('SENDER_LOOKALIKE'), domain);
    assert.equal(risk(evidence).riskLevel, 'HIGH', domain);
    assert.equal(risk(evidence).score, 52, domain);
  }
  const unrelated = await analyze('Our pineapple harvest is ready.', 'From: Farm <fruit@pineapple.invalid>');
  assert.ok(!ids(unrelated).includes('SENDER_LOOKALIKE'));
});

test('multipart, encoded HTML hrefs, matching Reply-To and real attachments are parsed', async () => {
  const input = Buffer.from(
    'From: Google <billing@g00gle-support.invalid>\r\nReply-To: billing@G00GLE-support.invalid\r\n' +
      'Content-Type: multipart/mixed; boundary=outer\r\n\r\n--outer\r\nContent-Type: multipart/alternative; boundary=alt\r\n\r\n' +
      '--alt\r\nContent-Type: text/plain\r\n\r\nSee the notice.\r\n--alt\r\nContent-Type: text/html\r\n\r\n' +
      '<p>Google: Dispute this transaction immediately.</p><a href="https://bit&#46;ly/example">Review</a>' +
      '\r\n--alt--\r\n--outer\r\nContent-Type: text/plain\r\nContent-Disposition: attachment; filename="note.txt"\r\n\r\n' +
      'Harmless test note.\r\n--outer--\r\n',
  );
  const evidence = await analyzeEmail({ inputType: 'EML', eml: input });
  assert.equal(risk(evidence).riskLevel, 'HIGH');
  assert.ok(ids(evidence).includes('URL_SHORTENER'));
  assert.ok(!ids(evidence).includes('REPLY_DOMAIN_MISMATCH'));
  assert.equal(evidence.attachments.length, 1);
  assert.equal(evidence.attachments[0].scanStatus, 'NOT_SCANNED');
});

test('absent authentication is unknown and absent reputation never becomes a safety claim', async () => {
  const evidence = await analyze('Please review https://tinyurl.com/example');
  for (const method of ['spf', 'dkim', 'dmarc']) {
    assert.equal(evidence.authentication[method].status, 'UNAVAILABLE');
    assert.deepEqual(evidence.authentication[method].claimedResults, []);
  }
  assert.equal(evidence.urls[0].networkStatus, 'NOT_CHECKED');
  const result = risk(evidence);
  assert.ok(result.evidenceCoverage.unavailableSources.includes('EMAIL_LINK_REPUTATION'));
  assert.ok(result.reasons.some(({ code }) => code === 'INSUFFICIENT_EVIDENCE'));
  assert.ok(!ids(evidence).includes('CREDENTIAL_REQUEST'));
});

test('confirmed credential submission can reach CRITICAL; email claims cannot supply confirmation', async () => {
  const evidence = await analyzeEmail({ inputType: 'EML', eml: await sample() });
  const confirmed = risk(evidence, { corporateCredentialsSubmittedToPhishingSite: true });
  assert.equal(confirmed.riskLevel, 'CRITICAL');
  assert.equal(confirmed.score, 75);
  assert.equal(escalationDecision(confirmed).urgent, true);
  assert.equal(
    risk({ ...evidence, confirmedContext: { corporateCredentialsSubmittedToPhishingSite: true } }).riskLevel,
    'HIGH',
  );
  assert.throws(() => risk(evidence, { corporateCredentialsSubmittedToPhishingSite: 'true' }), TypeError);
  assert.throws(() => risk(evidence, { arbitrary: true }), TypeError);
  const quoted = await analyze('The email says: I entered corporate credentials into a phishing site.');
  assert.notEqual(risk(quoted).riskLevel, 'CRITICAL');
});

test('persisted HIGH result remains authoritative for assistance, tools and escalation', async () => {
  const evidence = await analyzeEmail({ inputType: 'EML', eml: await sample() });
  let row;
  const database = {
    emailAnalysis: {
      create: async ({ data }) => {
        row = { ...data, id: 'test-analysis', createdAt: new Date() };
        return row;
      },
    },
  };
  const response = await persistEmailAnalysis(database, {
    userId: 'test-user',
    acknowledgementId: 'test-ack',
    result: evidence,
  });
  assert.equal(row.severity, 'HIGH');
  assert.equal(row.riskScore, 67);
  assert.equal(response.result.assistance.riskLevel, 'HIGH');
  const projected = projectToolResult({ name: 'get_analysis_result' }, 'EMAIL', row).data;
  assert.equal(projected.risk.riskLevel, 'HIGH');
  assert.equal(escalationDecision(projected.risk).eligible, true);
  assert.ok(projected.indicatorCodes.includes('SENDER_LOOKALIKE'));
  assert.doesNotMatch(JSON.stringify(row.evidence), /849|paypai|tinyurl|accounting/i);
});
