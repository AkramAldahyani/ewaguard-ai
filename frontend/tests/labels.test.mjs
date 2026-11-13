import assert from 'node:assert/strict';
import { test } from 'node:test';
import { confidenceLabel, countLabel, displayLabel } from '../src/lib/labels.js';

// BUG-023: internal enum values are shown as readable labels with correct acronyms and grammar.
test('enum values become readable labels with correct acronyms', () => {
  assert.equal(displayLabel('MFA'), 'MFA');
  assert.equal(displayLabel('USB_SECURITY'), 'USB security');
  assert.equal(displayLabel('USB_SECURITY', { titleCase: true }), 'USB Security');
  assert.equal(displayLabel('URL_ANALYSIS', { titleCase: true }), 'URL Analysis');
  assert.equal(displayLabel('NOT_STARTED'), 'Not started');
  assert.equal(displayLabel('IN_PROGRESS', { titleCase: true }), 'In Progress');
  assert.equal(displayLabel('UNDER_INVESTIGATION', { titleCase: true }), 'Under Investigation');
  assert.equal(displayLabel('IT_SECURITY_ADMIN'), 'IT security administrator');
  assert.equal(displayLabel('TRUE_FALSE'), 'True or false');
  assert.equal(displayLabel('VIRUSTOTAL'), 'VirusTotal');
  assert.equal(displayLabel('INCIDENT_REPORTING', { titleCase: true }), 'Incident Reporting');
  assert.equal(displayLabel('SAFE_BROWSING_AND_USE_OF_WIFI', { titleCase: true }), 'Safe Browsing and Use of Wi-Fi');
  for (const empty of [undefined, null, '', 42]) assert.equal(displayLabel(empty), '');
});

test('counts use the singular for one and confidence reads naturally', () => {
  assert.equal(countLabel(1, 'attempt'), '1 attempt');
  assert.equal(countLabel(2, 'attempt'), '2 attempts');
  assert.equal(countLabel(0, 'question'), '0 questions');
  assert.equal(countLabel(1, 'person', 'people'), '1 person');
  assert.equal(countLabel(3, 'person', 'people'), '3 people');
  assert.equal(countLabel(1250, 'point'), `${(1250).toLocaleString()} points`);
  assert.equal(confidenceLabel('LIMITED_CONFIDENCE'), 'Limited');
  assert.equal(confidenceLabel('HIGH_CONFIDENCE'), 'High');
  assert.equal(confidenceLabel('SOMETHING_ELSE'), 'Unavailable');
});
