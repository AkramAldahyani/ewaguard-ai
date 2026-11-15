import { createDatabaseClient } from '../src/config/database.js';

if (process.env.NODE_ENV === 'production') {
  throw new Error('Development seed is disabled in production.');
}

const db = createDatabaseClient();
try {
  await db.$transaction(async (tx) => {
    for (const name of ['EMPLOYEE', 'IT_SECURITY_ADMIN']) {
      await tx.role.upsert({ where: { name }, create: { name }, update: {} });
    }
    for (const [code, name] of [
      ['IT', 'IT'],
      ['FIN', 'Finance'],
      ['HR', 'HR'],
      ['OPS', 'Operations'],
    ]) {
      await tx.department.upsert({ where: { code }, create: { code, name }, update: {} });
    }
  });
  console.info('Development reference seed complete: two roles and four departments. No accounts created.');
} catch {
  console.error('Development seed failed. Verify database connectivity and applied relational migration.');
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
