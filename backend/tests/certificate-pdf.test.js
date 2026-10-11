import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { renderCertificatePdf } from '../src/certificates/certificate-pdf.js';

test('certificate PDF renders bounded long names and titles without a second page', async () => {
  const pdf = await renderCertificatePdf({ employeeName: 'W'.repeat(105) + ' ' + 'W'.repeat(104),
    trainingTitle: 'W'.repeat(200),
    certificateNumber: randomUUID(), completedAt: new Date('2026-01-01'),
    issuedAt: new Date('2026-01-02'), scorePercent: 87.5 }, 'Test organization');
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.length > 2000);
  assert.equal((pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length, 1);
});
