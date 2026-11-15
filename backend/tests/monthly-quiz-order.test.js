import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nearestMonthOrder } from '../src/training/monthly-quiz-service.js';

const row = (id, period) => ({ id, period: new Date(`${period}-01T00:00:00.000Z`) });
const order = (rows, now) => nearestMonthOrder(rows, new Date(now)).map((item) => item.id);

test('monthly quizzes order by distance from the current UTC month, preferring the later month on ties', () => {
  const rows = [
    row('jan', '2026-01'),
    row('dec', '2026-12'),
    row('oct', '2026-10'),
    row('nov', '2026-11'),
    row('sep', '2026-09'),
    row('may27', '2027-05'),
    row('jan27', '2027-01'),
  ];
  assert.deepEqual(order(rows, '2026-11-10T12:00:00Z'), ['nov', 'dec', 'oct', 'jan27', 'sep', 'may27', 'jan']);
});

test('ordering crosses year boundaries and follows the calendar as months change', () => {
  const rows = [row('dec25', '2025-12'), row('jan26', '2026-01'), row('feb26', '2026-02'), row('nov25', '2025-11')];
  assert.deepEqual(order(rows, '2026-01-01T00:00:00Z'), ['jan26', 'feb26', 'dec25', 'nov25']);
  assert.deepEqual(order(rows, '2025-12-31T23:59:59Z'), ['dec25', 'jan26', 'nov25', 'feb26']);
});

test('ordering is stable for identical periods and does not mutate its input', () => {
  const rows = [row('b', '2026-11'), row('a', '2026-11')];
  assert.deepEqual(order(rows, '2026-11-01T00:00:00Z'), ['a', 'b']);
  assert.deepEqual(
    rows.map((item) => item.id),
    ['b', 'a'],
  );
});
