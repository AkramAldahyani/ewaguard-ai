import { createDatabaseClient } from '../src/config/database.js';

if (process.env.NODE_ENV === 'production') {
  throw new Error('User assignment backfill must be reviewed and run through the production change process.');
}

const database = createDatabaseClient();
try {
  const result = await database.$transaction(async (tx) => {
    const [operations, it] = await Promise.all([
      tx.department.findUniqueOrThrow({ where: { code: 'OPS' }, select: { id: true } }),
      tx.department.findUniqueOrThrow({ where: { code: 'IT' }, select: { id: true } }),
    ]);
    const users = await tx.user.findMany({
      where: { OR: [{ employeeIdentifier: null }, { departmentId: null }] },
      select: { id: true, employeeIdentifier: true, departmentId: true, role: { select: { name: true } } },
    });
    for (const user of users) {
      const admin = user.role.name === 'IT_SECURITY_ADMIN';
      await tx.user.update({ where: { id: user.id }, data: {
        employeeIdentifier: user.employeeIdentifier ?? `${admin ? 'ADM' : 'EMP'}-${user.id.replaceAll('-', '').slice(0, 12).toUpperCase()}`,
        departmentId: user.departmentId ?? (admin ? it.id : operations.id),
      } });
    }
    return { updated: users.length };
  });
  console.info(`Updated ${result.updated} user account${result.updated === 1 ? '' : 's'}.`);
} catch {
  console.error('User assignment backfill failed. Verify database connectivity, migrations, roles, and departments.');
  process.exitCode = 1;
} finally {
  await database.$disconnect();
}
