import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { databaseUrl } from '../src/config/env.js';
import { createSecurityAnalytics } from '../src/analytics/security-analytics.js';

// Daily analytics are reported in UTC. The result must not depend on the PostgreSQL session time zone, which on a
// developer machine is usually local time (for example Asia/Bahrain) and in a container is usually UTC.
for (const zone of ['UTC', 'Asia/Riyadh', 'America/New_York'])
  test(`daily analytics use UTC days with a ${zone} database session`, async (t) => {
    const url = new URL(databaseUrl());
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
    assert.equal(url.pathname, '/ewaguard_ai');
    url.searchParams.set('options', `-c timezone=${zone}`);
    const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.href }) });
    const users = [];
    t.after(async () => {
      await db.incident.deleteMany({ where: { reporterId: { in: users } } });
      await db.urlAnalysis.deleteMany({ where: { userId: { in: users } } });
      await db.user.deleteMany({ where: { id: { in: users } } });
      await db.$disconnect();
    });
    assert.equal((await db.$queryRaw`SHOW timezone`)[0].TimeZone, zone);
    const user = await db.user.create({
      data: {
        email: `${randomUUID()}@example.invalid`,
        firstName: 'Synthetic',
        lastName: 'Timezone',
        role: { connect: { name: 'EMPLOYEE' } },
      },
    });
    users.push(user.id);
    // Just after and just before UTC midnight, in a period no real record uses.
    const times = ['2094-03-10T00:30:00.000Z', '2094-03-10T01:30:00.000Z', '2094-03-11T23:30:00.000Z'];
    for (const value of times) {
      const at = new Date(value);
      await db.incident.create({
        data: {
          reporterId: user.id,
          title: 'Synthetic',
          description: 'Synthetic',
          severity: 'HIGH',
          riskScore: 60,
          riskRuleVersion: '1.1',
          type: 'PHISHING',
          detectionSource: 'URL_ANALYSIS',
          createdAt: at,
        },
      });
      await db.urlAnalysis.create({
        data: {
          userId: user.id,
          status: 'COMPLETED',
          hostname: 'example.invalid',
          urlSha256: 'a'.repeat(64),
          severity: 'LOW',
          riskScore: 0,
          riskRuleVersion: '1.1',
          evidence: {},
          createdAt: at,
          analyzedAt: at,
          expiresAt: new Date(at.getTime() + 86_400_000),
        },
      });
    }
    const overview = await createSecurityAnalytics(db).overview(
      { period: 'custom', start: '2094-03-09', end: '2094-03-12' },
      new Date('2094-03-12T12:00:00.000Z'),
    );
    const expected = [
      { day: '2094-03-09', count: 0 },
      { day: '2094-03-10', count: 2 },
      { day: '2094-03-11', count: 1 },
      { day: '2094-03-12', count: 0 },
    ];
    assert.deepEqual(overview.dailyCreated, expected);
    assert.deepEqual(overview.analyses.daily, expected);
    assert.equal(overview.metrics.created, 3);
    assert.deepEqual(
      (await db.incident.findMany({ where: { reporterId: user.id }, orderBy: { createdAt: 'asc' } })).map((row) =>
        row.createdAt.toISOString(),
      ),
      times,
    );
  });
