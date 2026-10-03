import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';

export const BCRYPT_ROUNDS = 12;
const dummyHash = bcrypt.hash(randomBytes(32).toString('hex'), BCRYPT_ROUNDS);

const safeUserSelect = {
  id: true,
  employeeIdentifier: true,
  firstName: true,
  lastName: true,
  email: true,
  status: true,
  deactivatedAt: true,
  role: { select: { name: true } },
  department: { select: { id: true, name: true, code: true } },
};

export async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function authenticateCredentials(database, email, password) {
  const user = await database.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    include: { role: true, department: true },
  });
  const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? await dummyHash);
  if (!user || !passwordMatches || user.status !== 'ACTIVE' || user.deactivatedAt) return null;
  return toSafeUser(user);
}

export async function findActiveUser(database, id) {
  const user = await database.user.findUnique({ where: { id }, select: safeUserSelect });
  if (!user || user.status !== 'ACTIVE' || user.deactivatedAt) return null;
  return toSafeUser(user);
}

function toSafeUser(user) {
  return {
    id: user.id,
    employeeIdentifier: user.employeeIdentifier,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    status: user.status,
    role: user.role.name,
    department: user.department
      ? { id: user.department.id, name: user.department.name, code: user.department.code }
      : null,
  };
}
