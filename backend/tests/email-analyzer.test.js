import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { analyzeEmail, classifyEmailIndicators } from '../src/analyzers/email/email-analyzer.js';
import { EMAIL_LIMITS, EmailAnalysisError } from '../src/analyzers/email/email-policy.js';
import { minimizeEmailEvidence, redactEmailMetadata } from '../src/analyzers/email/email-privacy.js';

const pasted = (body = 'The team meeting is at ten tomorrow.', headers = 'From: Alice <alice@example.invalid>') => ({ inputType: 'PASTED', body, headers });
const eml = (body, headers = '') => ({ inputType: 'EML', eml: Buffer.from(`From: Alice <alice@example.invalid>\r\nSubject: Test message\r\n${headers}\r\n${body}`) });
const has = (result, id) => result.indicators.some((indicator) => indicator.id === id);
const rejects = async (input, code) => assert.rejects(analyzeEmail(input), (error) => error instanceof EmailAnalysisError && error.code === code);
function attachmentMessage(filename, contentType = 'application/octet-stream') {
  return eml('--fixture\r\nContent-Type: text/plain\r\n\r\nOpen the attachment.\r\n--fixture\r\n' +
    `Content-Type: ${contentType}\r\nContent-Disposition: attachment; filename="${filename}"\r\n` +
    'Content-Transfer-Encoding: base64\r\n\r\nSGFybWxlc3MgZml4dHVyZSB0ZXh0Lg==\r\n--fixture--\r\n',
  'MIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="fixture"\r\n');
}

test('normal-looking pasted email yields evidence, not safety or final risk severity', async () => {
  const result = await analyzeEmail(pasted());
  assert.equal(result.inputType, 'PASTED');
  assert.equal(result.provisionalClassification, 'NO_STRONG_INDICATORS');
  assert.equal(result.sender.domain, 'example.invalid');
  assert.equal(result.sender.address.includes('alice'), false);
  assert.equal(result.riskScore, undefined);
  assert.equal(result.severity, undefined);
  assert.ok(result.limitations.some((line) => line.includes('does not mean safe')));
});

test('body-only input marks missing sender and authentication unavailable', async () => {
  const result = await analyzeEmail({ inputType: 'PASTED', body: 'Plain copied message.' });
  assert.ok(has(result, 'SENDER_MISSING'));
  for (const method of ['spf', 'dkim', 'dmarc']) assert.deepEqual(result.authentication[method], { status: 'UNAVAILABLE', claimedResults: [], verified: false });
});

test('sender mismatch and credential request are deterministic suspicious evidence', async () => {
  const input = pasted('Urgent: reset your password. Enter your credentials and log in immediately.',
    'From: Microsoft security team <notice@example.invalid>\r\nReply-To: collect@other.invalid');
  const first = await analyzeEmail(input);
  assert.deepEqual(await analyzeEmail(input), first);
  for (const id of ['URGENCY', 'PASSWORD_RESET', 'CREDENTIAL_REQUEST', 'LOGIN_REQUEST', 'REPLY_DOMAIN_MISMATCH', 'DISPLAY_NAME_CLAIM']) assert.ok(has(first, id), id);
  assert.equal(first.provisionalClassification, 'HIGHLY_SUSPICIOUS');
});

test('urgency or a brand display name alone is not a phishing conclusion', async () => {
  assert.equal((await analyzeEmail(pasted('Urgent: the meeting room changed.'))).provisionalClassification, 'NO_STRONG_INDICATORS');
  assert.equal((await analyzeEmail(pasted('Our team meeting is tomorrow.', 'From: Microsoft <a@example.invalid>'))).provisionalClassification, 'NO_STRONG_INDICATORS');
});

test('local classification thresholds stay separate from central risk scoring', () => {
  const indicator = (severityWeight, category = 'content') => ({ severityWeight, category });
  assert.equal(classifyEmailIndicators([]), 'NO_STRONG_INDICATORS');
  assert.equal(classifyEmailIndicators([indicator(2)]), 'SUSPICIOUS');
  assert.equal(classifyEmailIndicators([indicator(3), indicator(3)]), 'SUSPICIOUS');
  assert.equal(classifyEmailIndicators([indicator(3), indicator(3), indicator(1, 'sender')]), 'HIGHLY_SUSPICIOUS');
});

test('financial, MFA, attachment invitation and bypass-process heuristics', async () => {
  const result = await analyzeEmail(pasted('Wire transfer required. Buy gift cards. Share your MFA code. Skip the approval process. Enable macros.'));
  for (const id of ['PAYMENT_REQUEST', 'GIFT_CARD', 'MFA_REQUEST', 'BYPASS_PROCESS', 'ATTACHMENT_INVITATION']) assert.ok(has(result, id), id);
});

test('sender Unicode, subdomain structure, malformed and duplicate From evidence', async () => {
  const result = await analyzeEmail(pasted('Hello', 'From: "friend@other.invalid" <a@xn--bcher-kva.example.invalid>\r\nReply-To: a@one.two.three.four.example.invalid'));
  for (const id of ['DISPLAY_ADDRESS_MISMATCH', 'INTERNATIONAL_DOMAIN', 'SENDER_SUBDOMAINS']) assert.ok(has(result, id), id);
  assert.ok(has(await analyzeEmail(pasted('Hello', 'From: broken-address')), 'SENDER_MISSING'));
  assert.ok(has(await analyzeEmail(pasted('Hello', 'From: a@example.invalid\r\nFrom: b@other.invalid')), 'SENDER_FORMAT'));
});

test('SPF/DKIM/DMARC header claims never become verified authentication', async () => {
  const result = await analyzeEmail(pasted('Hello', 'From: a@example.invalid\r\nAuthentication-Results: mx.example.invalid; spf=pass smtp.mailfrom=example.invalid;\r\n dkim=pass header.d=example.invalid; dmarc=fail header.from=example.invalid\r\nDKIM-Signature: v=1; b=secret-value\r\nARC-Seal: i=1; cv=none'));
  assert.deepEqual(result.authentication.spf, { status: 'HEADER_CLAIM', claimedResults: ['PASS'], verified: false });
  assert.deepEqual(result.authentication.dmarc.claimedResults, ['FAIL']);
  assert.ok(has(result, 'AUTHENTICATION_CONCERN'));
  assert.equal(result.authentication.signaturePresent, true);
  assert.equal(result.authentication.arcPresent, true);
});

test('signature/ARC presence and embedded comments do not fabricate pass', async () => {
  const result = await analyzeEmail(pasted('Hello', 'From: a@example.invalid\r\nDKIM-Signature: v=1; d=example.invalid; b=anything\r\nARC-Authentication-Results: i=1; dkim=pass\r\nAuthentication-Results: mx.invalid (a comment; spf=pass); reason="; dmarc=pass"'));
  for (const method of ['spf', 'dkim', 'dmarc']) assert.equal(result.authentication[method].status, 'UNAVAILABLE');
});

test('multiple header claims preserve disagreement; Received-SPF alone is an unverified claim', async () => {
  const result = await analyzeEmail(pasted('Hello', 'From: a@example.invalid\r\nReceived-SPF: pass (comment)\r\nAuthentication-Results: mx.invalid; spf=fail\r\nAuthentication-Results: mx2.invalid; spf=pass'));
  assert.equal(result.authentication.spf.status, 'CONFLICTING_CLAIMS');
  assert.deepEqual(result.authentication.spf.claimedResults, ['FAIL', 'PASS']);
  assert.ok(has(result, 'AUTHENTICATION_CONFLICT'));
});

test('EML HTML URLs are tokenized, entity-decoded, minimized and never fetched', async () => {
  const result = await analyzeEmail(eml('<p>Please sign in</p><a href="https://user:secret@other.invalid/path?token=private&amp;next=1#fragment">https://trusted.invalid</a><script>alert(1)</script>', 'Content-Type: text/html; charset=utf-8\r\n'));
  assert.ok(has(result, 'URL_LABEL_MISMATCH'));
  assert.ok(has(result, 'URL_CREDENTIALS'));
  assert.deepEqual(result.urls[0], { origin: 'https://other.invalid', detailsOmitted: true, networkStatus: 'NOT_CHECKED' });
  assert.equal(result.html, undefined);
  assert.equal(result.body, undefined);
  assert.equal(JSON.stringify(result).includes('token=private'), false);
});

test('URL heuristics normalize hostnames, flag schemes and bound results', async () => {
  const result = await analyzeEmail(pasted('http://127.0.0.1/test https://xn--bcher-kva.invalid/a <a href="javascript:alert(1)">click</a>'));
  for (const id of ['URL_IP', 'URL_HTTP', 'URL_INTERNATIONAL', 'URL_SCHEME']) assert.ok(has(result, id), id);
  const many = await analyzeEmail(pasted(Array.from({ length: 60 }, (_, index) => `https://h${index}.invalid/path`).join(' ')));
  assert.equal(many.urls.length, EMAIL_LIMITS.urls);
  assert.ok(has(many, 'URL_LIMIT'));
});

test('attachment metadata flags executable/double extension with no malware verdict', async () => {
  const result = await analyzeEmail(attachmentMessage('invoice.pdf.exe'));
  assert.ok(has(result, 'ATTACHMENT_EXECUTABLE'));
  assert.ok(has(result, 'ATTACHMENT_DOUBLE_EXTENSION'));
  assert.equal(result.attachments[0].scanStatus, 'NOT_SCANNED');
  assert.equal(result.attachments[0].extension, 'exe');
  assert.equal(result.attachments[0].size, 22);
  assert.equal(result.attachments[0].content, undefined);
  assert.equal(JSON.stringify(result).includes('Harmless fixture text'), false);
});

test('macro and archive attachment types are evidence only', async () => {
  assert.ok(has(await analyzeEmail(attachmentMessage('budget.xlsm')), 'ATTACHMENT_MACRO'));
  assert.ok(has(await analyzeEmail(attachmentMessage('reports.zip')), 'ATTACHMENT_ARCHIVE'));
});

test('encoded MIME headers and quoted-printable text are decoded before evidence checks', async () => {
  const result = await analyzeEmail({ inputType: 'EML', eml: Buffer.from(
    'From: =?UTF-8?B?TWljcm9zb2Z0?= <notice@example.invalid>\r\nSubject: =?UTF-8?Q?Password_reset?=\r\n' +
    'Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nPlease send your pass=77ord.\r\n') });
  assert.equal(result.subject, 'Password reset');
  assert.ok(has(result, 'DISPLAY_NAME_CLAIM'));
  assert.ok(has(result, 'CREDENTIAL_REQUEST'));
});

test('all alternatives are considered and attachment names stay out of persistence projection', async () => {
  const result = await analyzeEmail(attachmentMessage('ConfidentialCustomerName.pdf.exe'));
  assert.equal(JSON.stringify(minimizeEmailEvidence(result)).includes('ConfidentialCustomerName'), false);
  const alternative = await analyzeEmail(eml('--alt\r\nContent-Type: text/plain\r\n\r\nHello\r\n' +
    '--alt\r\nContent-Type: text/html\r\n\r\n<p>Share your MFA code</p>\r\n--alt--\r\n',
  'Content-Type: multipart/alternative; boundary=alt\r\n'));
  assert.ok(has(alternative, 'MFA_REQUEST'));
});

test('attachment and header counts are bounded', async () => {
  const parts = Array.from({ length: 21 }, (_, index) => `--many\r\nContent-Type: application/octet-stream\r\nContent-Disposition: attachment; filename="${index}.txt"\r\n\r\nFixture\r\n`).join('');
  await rejects(eml(`${parts}--many--\r\n`, 'Content-Type: multipart/mixed; boundary=many\r\n'), 'EMAIL_INPUT_TOO_LARGE');
  await rejects(pasted('Hello', 'From: a@example.invalid\r\n' + Array.from({ length: 101 }, (_, index) => `X-Test-${index}: value`).join('\r\n')), 'EMAIL_INPUT_TOO_LARGE');
});

test('pasted MIME headers cannot change plain body interpretation', async () => {
  const result = await analyzeEmail(pasted('Please send your password.', 'From: a@example.invalid\r\nContent-Transfer-Encoding: base64\r\nContent-Type: multipart/mixed; boundary=missing'));
  assert.ok(has(result, 'CREDENTIAL_REQUEST'));
  assert.equal(result.attachments.length, 0);
});

test('empty, mixed, unknown mode, invalid types and malformed headers fail safely', async () => {
  await rejects(pasted('  '), 'EMPTY_EMAIL');
  for (const input of [null, [], { inputType: 'OTHER' }, { ...pasted(), eml: Buffer.from('x') }, { inputType: 'EML', eml: 'text' }, { ...pasted(), body: 42 }]) await rejects(input, 'INVALID_EMAIL_INPUT');
  await rejects(pasted('body', 'From: a@example.invalid\r\n\r\nsmuggled body'), 'MALFORMED_EMAIL');
  await rejects({ inputType: 'EML', eml: Buffer.from('Not an email') }, 'MALFORMED_EMAIL');
  await rejects(eml('--x\r\nContent-Type: text/plain\r\n\r\ntruncated', 'Content-Type: multipart/mixed; boundary=x\r\n'), 'MALFORMED_EMAIL');
});

test('input and MIME complexity limits reject before expensive processing', async () => {
  await rejects(pasted('x'.repeat(EMAIL_LIMITS.bodyBytes + 1)), 'EMAIL_INPUT_TOO_LARGE');
  await rejects(pasted('é'.repeat(EMAIL_LIMITS.bodyBytes / 2 + 1)), 'EMAIL_INPUT_TOO_LARGE');
  await rejects(pasted('hello', `Subject: ${'x'.repeat(EMAIL_LIMITS.headerBytes)}`), 'EMAIL_INPUT_TOO_LARGE');
  await rejects({ inputType: 'EML', eml: Buffer.alloc(EMAIL_LIMITS.emlBytes + 1) }, 'EMAIL_INPUT_TOO_LARGE');
  await rejects(eml('Content-Type: text/plain\r\n'.repeat(EMAIL_LIMITS.mimeParts + 1)), 'EMAIL_INPUT_TOO_LARGE');
});

test('redaction covers common labeled secrets, bearer tokens, keys and long values', () => {
  for (const text of ['password: DoNotRetain123!', 'api_key=DoNotRetain123!', 'Authorization: Bearer DoNotRetain123!', 'Bearer DoNotRetain123!', 'sk-DoNotRetain123', 'A'.repeat(40), '-----BEGIN PRIVATE KEY-----\nDoNotRetain123\n-----END PRIVATE KEY-----']) {
    const output = redactEmailMetadata(text);
    assert.match(output, /REDACTED/);
    assert.doesNotMatch(output, /DoNotRetain|AAAA/);
  }
});

test('persistence projection excludes all submitted free text, not just recognizable secrets', async () => {
  const result = await analyzeEmail(pasted('password: DoNotRetain123!\nPlease send your credentials. https://private.invalid/secret?token=abc', 'From: Private Name <personal@private.invalid>\r\nSubject: sensitive subject'));
  const projection = minimizeEmailEvidence(result);
  const serialized = JSON.stringify(projection);
  for (const fragment of ['DoNotRetain', 'private.invalid', 'personal', 'Private Name', 'sensitive subject', 'token=abc', 'Please send']) assert.equal(serialized.includes(fragment), false, fragment);
  assert.ok(projection.indicatorIds.includes('CREDENTIAL_REQUEST'));
  assert.equal(projection.riskScore, undefined);
});

test('analysis has no network/log effects and returns errors without input content', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', () => { calls.push('network'); throw new Error('Unexpected network'); });
  for (const method of ['log', 'info', 'warn', 'error', 'debug']) t.mock.method(console, method, () => calls.push('log'));
  await analyzeEmail(attachmentMessage('report.docm'));
  await analyzeEmail(pasted('SECRET_UNIQUE_BODY https://example.invalid/credential'));
  await assert.rejects(analyzeEmail({ inputType: 'EML', eml: Buffer.from('SECRET_UNIQUE_BODY') }), (error) => !JSON.stringify(error).includes('SECRET_UNIQUE_BODY') && !error.message.includes('SECRET_UNIQUE_BODY'));
  assert.deepEqual(calls, []);
  const sources = await Promise.all(['email-analyzer', 'email-evidence', 'email-parser', 'email-policy', 'email-privacy'].map((name) => readFile(new URL(`../src/analyzers/email/${name}.js`, import.meta.url), 'utf8')));
  assert.doesNotMatch(sources.join('\n'), /(?:node:(?:http|https|dns|fs)|fetch\(|console\.|writeFile|dangerouslySetInnerHTML)/);
});
