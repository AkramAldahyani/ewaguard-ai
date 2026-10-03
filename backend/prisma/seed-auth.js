import { createDatabaseClient } from '../src/config/database.js';
import { hashPassword } from '../src/auth/auth-service.js';

if (process.env.NODE_ENV === 'production') throw new Error('Development account seed is disabled in production.');

const employeePassword = process.env.DEV_EMPLOYEE_PASSWORD;
const adminPassword = process.env.DEV_ADMIN_PASSWORD;
for (const [name, value] of [['DEV_EMPLOYEE_PASSWORD', employeePassword], ['DEV_ADMIN_PASSWORD', adminPassword]]) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) {
    throw new Error(`${name} must be set locally to an 8-128 character development-only password.`);
  }
}
if (employeePassword === adminPassword) throw new Error('Development account passwords must be different.');

const database = createDatabaseClient();
try {
  const [employeeHash, adminHash] = await Promise.all([
    hashPassword(employeePassword), hashPassword(adminPassword),
  ]);
  await database.$transaction(async (tx) => {
    const employeeRole = await tx.role.findUniqueOrThrow({ where: { name: 'EMPLOYEE' } });
    const adminRole = await tx.role.findUniqueOrThrow({ where: { name: 'IT_SECURITY_ADMIN' } });
    const operations = await tx.department.findUniqueOrThrow({ where: { code: 'OPS' } });
    const it = await tx.department.findUniqueOrThrow({ where: { code: 'IT' } });
    await tx.user.upsert({
      where: { employeeIdentifier: 'DEV-EMP-001' },
      create: {
        employeeIdentifier: 'DEV-EMP-001', firstName: 'Development', lastName: 'Employee',
        email: 'employee@ewa.bh', passwordHash: employeeHash, status: 'ACTIVE',
        roleId: employeeRole.id, departmentId: operations.id,
      },
      update: { email: 'employee@ewa.bh', passwordHash: employeeHash, status: 'ACTIVE', deactivatedAt: null, roleId: employeeRole.id, departmentId: operations.id },
    });
    await tx.user.upsert({
      where: { employeeIdentifier: 'DEV-ADM-001' },
      create: {
        employeeIdentifier: 'DEV-ADM-001', firstName: 'Development', lastName: 'Administrator',
        email: 'admin@ewa.bh', passwordHash: adminHash, status: 'ACTIVE',
        roleId: adminRole.id, departmentId: it.id,
      },
      update: { email: 'admin@ewa.bh', passwordHash: adminHash, status: 'ACTIVE', deactivatedAt: null, roleId: adminRole.id, departmentId: it.id },
    });
  });
  console.info('Development authentication accounts created. Passwords were read from local environment only.');
} catch {
  console.error('Development authentication seed failed. Verify local variables, database migrations, roles, and departments.');
  process.exitCode = 1;
} finally {
  await database.$disconnect();
}
