import { createHash, randomBytes } from 'node:crypto';
import { hashPassword } from '../auth/auth-service.js';
import {
  fail,
  fields,
  userId,
  expectedVersion,
  profileInput,
  listInput,
  setupInput,
  setupTokenInput,
  roles,
  statuses,
} from './user-policy.js';
import { loadUserProfile } from './user-profile.js';

export const accountSelect = {
  id: true,
  employeeIdentifier: true,
  firstName: true,
  lastName: true,
  email: true,
  status: true,
  deactivatedAt: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  lastLoginAt: true,
  role: { select: { name: true } },
  department: { select: { id: true, name: true, code: true } },
};
const digest = (token) => createHash('sha256').update(token).digest('hex');
const clearSetup = { setupTokenHash: null, setupTokenExpiresAt: null };
const clearChallenge = {
  mfaChallengeHash: null,
  mfaChallengeExpiresAt: null,
  mfaChallengeCredential: null,
  mfaPendingSecret: null,
  mfaChallengeAttempts: 0,
};
const active = (user) => user?.status === 'ACTIVE' && !user.deactivatedAt && !user.deletedAt;
function newSetup() {
  const token = randomBytes(32).toString('base64url'),
    expiresAt = new Date(Date.now() + 24 * 60 * 60_000);
  return { data: { setupTokenHash: digest(token), setupTokenExpiresAt: expiresAt }, receipt: { token, expiresAt } };
}
export async function audit(tx, actorId, id, action, metadata = {}, resourceType = 'USER') {
  await tx.auditLog.create({
    data: {
      actorId,
      resourceType,
      resourceId: id,
      action,
      outcome: 'SUCCESS',
      metadata,
      retentionUntil: new Date(Date.now() + 90 * 86400000),
    },
  });
}
async function lockUser(tx, id) {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR UPDATE`;
  return tx.user.findUnique({ where: { id }, include: { role: true } });
}
export async function authorizeMutation(tx, auth) {
  // Shared across API workers. Serialize directory mutations before checking the last administrator.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(194731, 1)`;
  const actor = await lockUser(tx, auth.userId);
  if (
    !active(actor) ||
    actor.role.name !== 'IT_SECURITY_ADMIN' ||
    !actor.mfaEnabledAt ||
    actor.mfaEnabledAt.toISOString() !== auth.mfaProof ||
    actor.sessionVersion !== auth.sessionVersion ||
    Date.parse(auth.expiresAt) <= Date.now() ||
    (await tx.revokedSession.findUnique({ where: { id: auth.sessionId } }))
  ) {
    fail(403, 'USER_ACCESS_DENIED', 'Your administrator session is no longer valid. Sign in again.');
  }
  if (
    !Number.isFinite(auth.authenticatedAt) ||
    Date.now() - auth.authenticatedAt * 1000 > 5 * 60_000 ||
    auth.authenticatedAt * 1000 > Date.now() + 1000
  ) {
    fail(
      403,
      'USER_REAUTH_REQUIRED',
      'Sign in again with MFA before changing accounts. A sign-in within the last five minutes is required.',
    );
  }
  return actor;
}
async function uniqueIdentity(tx, data, id) {
  for (const [field, code, label] of [
    ['email', 'USER_EMAIL_EXISTS', 'email address'],
    ['employeeIdentifier', 'USER_EMPLOYEE_ID_EXISTS', 'employee ID'],
  ]) {
    if (
      data[field] &&
      (await tx.user.findFirst({
        where: { [field]: { equals: data[field], mode: 'insensitive' }, ...(id ? { id: { not: id } } : {}) },
        select: { id: true },
      }))
    ) {
      fail(409, code, `That ${label} is already assigned to an account, including retained deleted accounts.`);
    }
  }
  if (
    data.departmentId &&
    !(await tx.department.findUnique({ where: { id: data.departmentId }, select: { id: true } }))
  )
    fail(400, 'USER_DEPARTMENT_INVALID', 'Choose an existing department.');
}
async function protectedChange(tx, actor, target) {
  if (target.role.name === 'IT_SECURITY_ADMIN' && active(target)) {
    const remaining = await tx.user.count({
      where: {
        id: { not: target.id },
        role: { name: 'IT_SECURITY_ADMIN' },
        status: 'ACTIVE',
        deactivatedAt: null,
        deletedAt: null,
        passwordHash: { not: null },
        mfaEnabledAt: { not: null },
      },
    });
    if (!remaining)
      fail(
        409,
        'USER_LAST_ADMIN',
        'The last active administrator cannot lose access. Another administrator must complete MFA enrollment first.',
      );
  }
  if (actor.id === target.id)
    fail(
      409,
      'USER_SELF_PROTECTED',
      'You cannot change your own role, disable, or delete your own administrator account.',
    );
}
export function createUserService(database, config = {}) {
  const manualSetup = config.demoAccountSetupEnabled === true && ['development', 'test'].includes(config.nodeEnv);
  async function mutation(auth, id, body, operation) {
    userId(id);
    expectedVersion(body);
    return database.$transaction(async (tx) => {
      const actor = await authorizeMutation(tx, auth);
      const target = await lockUser(tx, id);
      if (!target || target.deletedAt) fail(404, 'USER_NOT_FOUND', 'Account not found or already deleted.');
      if (target.updatedAt.toISOString() !== body.expectedUpdatedAt)
        fail(409, 'USER_CONFLICT', 'This account changed. Reload it and try again.');
      const result = await operation(tx, actor, target);
      await tx.user.update({
        where: { id },
        data: { updatedAt: new Date(Math.max(Date.now(), target.updatedAt.getTime() + 1)) },
      });
      return { user: await tx.user.findUnique({ where: { id }, select: accountSelect }), ...result };
    });
  }
  return {
    async list(query) {
      const { where, orderBy, skip, page, pageSize } = listInput(query);
      return database.$transaction(
        async (tx) => {
          const [items, total] = await Promise.all([
            tx.user.findMany({ where, orderBy, skip, take: pageSize, select: accountSelect }),
            tx.user.count({ where }),
          ]);
          return { items, total, page, pageSize, hasMore: skip + items.length < total };
        },
        { isolationLevel: 'RepeatableRead' },
      );
    },
    async summary() {
      return database.$transaction(
        async (tx) => {
          const retained = { deletedAt: null };
          const [total, activeCount, inactive, administrators, invited, suspended, deleted] = await Promise.all([
            tx.user.count({ where: retained }),
            tx.user.count({ where: { ...retained, status: 'ACTIVE', deactivatedAt: null } }),
            tx.user.count({ where: { ...retained, status: 'DEACTIVATED' } }),
            tx.user.count({ where: { ...retained, role: { name: 'IT_SECURITY_ADMIN' } } }),
            tx.user.count({ where: { ...retained, status: 'INVITED' } }),
            tx.user.count({ where: { ...retained, status: 'SUSPENDED' } }),
            tx.user.count({ where: { deletedAt: { not: null } } }),
          ]);
          return { total, active: activeCount, inactive, administrators, invited, suspended, deleted };
        },
        { isolationLevel: 'RepeatableRead' },
      );
    },
    async options() {
      return {
        departments: await database.department.findMany({
          select: { id: true, name: true, code: true },
          orderBy: { name: 'asc' },
        }),
        roles,
        statuses,
        manualSetupEnabled: manualSetup,
      };
    },
    async detail(id) {
      const user = await database.user.findUnique({ where: { id: userId(id) }, select: accountSelect });
      if (!user) fail(404, 'USER_NOT_FOUND', 'Account not found.');
      return { user };
    },
    async profile(id) {
      const result = await loadUserProfile(database, userId(id));
      if (!result) fail(404, 'USER_NOT_FOUND', 'Account not found.');
      return result;
    },
    async create(auth, body) {
      const data = profileInput(body, true),
        setup = manualSetup && data.status === 'INVITED' ? newSetup() : null;
      return database.$transaction(async (tx) => {
        const actor = await authorizeMutation(tx, auth);
        await uniqueIdentity(tx, data);
        const user = await tx.user.create({
          data: {
            ...data,
            ...(setup?.data ?? {}),
            deactivatedAt: data.status === 'DEACTIVATED' ? new Date() : null,
            roleId: (await tx.role.findUniqueOrThrow({ where: { name: 'EMPLOYEE' } })).id,
          },
          select: accountSelect,
        });
        await audit(tx, actor.id, user.id, 'USER_CREATED', { status: user.status, role: 'EMPLOYEE' });
        if (setup) await audit(tx, actor.id, user.id, 'USER_SETUP_ISSUED');
        return { user, ...(setup ? { setup: setup.receipt } : {}) };
      });
    },
    update(auth, id, body) {
      const data = profileInput(body);
      return mutation(auth, id, body, async (tx, actor, target) => {
        await uniqueIdentity(tx, data, id);
        const emailChanged = data.email !== undefined && data.email !== target.email;
        await tx.user.update({
          where: { id },
          data: {
            ...data,
            ...(emailChanged ? { ...clearSetup, ...clearChallenge, sessionVersion: { increment: 1 } } : {}),
          },
        });
        await audit(tx, actor.id, id, 'USER_UPDATED', { fields: Object.keys(data) });
        return {};
      });
    },
    status(auth, id, body) {
      fields(body, ['status', 'expectedUpdatedAt']);
      if (!['ACTIVE', 'DEACTIVATED', 'SUSPENDED'].includes(body.status))
        fail(400, 'USER_INVALID', 'Choose active, deactivated, or suspended.');
      return mutation(auth, id, body, async (tx, actor, target) => {
        if (body.status !== 'ACTIVE') await protectedChange(tx, actor, target);
        const status = body.status === 'ACTIVE' && !target.passwordHash ? 'INVITED' : body.status;
        await tx.user.update({
          where: { id },
          data: {
            status,
            deactivatedAt: status === 'DEACTIVATED' ? new Date() : null,
            sessionVersion: { increment: 1 },
            ...clearSetup,
            ...clearChallenge,
          },
        });
        await audit(
          tx,
          actor.id,
          id,
          status === 'DEACTIVATED' ? 'USER_DEACTIVATED' : status === 'SUSPENDED' ? 'USER_SUSPENDED' : 'USER_ACTIVATED',
          { previousStatus: target.status, status },
        );
        return { setupRequired: status === 'INVITED' };
      });
    },
    role(auth, id, body) {
      fields(body, ['role', 'expectedUpdatedAt']);
      if (!roles.includes(body.role)) fail(400, 'USER_INVALID', 'Choose a supported role.');
      return mutation(auth, id, body, async (tx, actor, target) => {
        await protectedChange(tx, actor, target);
        if (target.role.name === body.role) fail(409, 'USER_ROLE_UNCHANGED', 'This account already has that role.');
        if (!active(target) || !target.passwordHash)
          fail(
            409,
            'USER_SETUP_REQUIRED',
            'The employee must complete account setup and be active before a role change.',
          );
        await tx.user.update({
          where: { id },
          data: {
            roleId: (await tx.role.findUniqueOrThrow({ where: { name: body.role } })).id,
            sessionVersion: { increment: 1 },
            ...clearSetup,
            ...clearChallenge,
            // A future promotion requires fresh enrollment, never an old privileged credential.
            mfaEnabledAt: null,
            mfaSecretEncrypted: null,
            mfaLastCounter: null,
          },
        });
        await audit(tx, actor.id, id, 'USER_ROLE_CHANGED', { previousRole: target.role.name, role: body.role });
        return {};
      });
    },
    issueSetup(auth, id, body) {
      fields(body, ['expectedUpdatedAt']);
      return mutation(auth, id, body, async (tx, actor, target) => {
        if (!manualSetup)
          fail(
            403,
            'SETUP_DEMO_DISABLED',
            'Manual setup links are disabled. An approved identity-verified onboarding mechanism is required.',
          );
        if (target.passwordHash || target.status !== 'INVITED')
          fail(409, 'USER_SETUP_NOT_ALLOWED', 'Setup is only available for invited accounts without a password.');
        const setup = newSetup();
        await tx.user.update({ where: { id }, data: setup.data });
        await audit(tx, actor.id, id, 'USER_SETUP_ISSUED');
        return { setup: setup.receipt };
      });
    },
    delete(auth, id, body) {
      fields(body, ['confirmation', 'expectedUpdatedAt']);
      return mutation(auth, id, body, async (tx, actor, target) => {
        await protectedChange(tx, actor, target);
        if (typeof body.confirmation !== 'string' || body.confirmation !== (target.employeeIdentifier ?? target.id))
          fail(
            400,
            'USER_CONFIRMATION_REQUIRED',
            'Type the employee ID exactly, or the internal user ID if no employee ID exists.',
          );
        await audit(tx, actor.id, id, 'USER_DELETION_REQUESTED', { mode: 'SOFT_DELETE' });
        await tx.user.update({
          where: { id },
          data: {
            deletedAt: new Date(),
            deactivatedAt: new Date(),
            status: 'DEACTIVATED',
            passwordHash: null,
            sessionVersion: { increment: 1 },
            ...clearSetup,
            ...clearChallenge,
            mfaEnabledAt: null,
            mfaSecretEncrypted: null,
            mfaLastCounter: null,
          },
        });
        await audit(tx, actor.id, id, 'USER_DELETED', { mode: 'SOFT_DELETE', recordsRetained: true });
        return {};
      });
    },
    async validateSetup(body) {
      fields(body, ['token']);
      const token = setupTokenInput(body.token);
      const candidate = await database.user.findUnique({
        where: { setupTokenHash: digest(token) },
        select: { status: true, deletedAt: true, deactivatedAt: true, passwordHash: true, setupTokenExpiresAt: true },
      });
      if (
        !candidate ||
        candidate.deletedAt ||
        candidate.deactivatedAt ||
        candidate.status !== 'INVITED' ||
        candidate.passwordHash ||
        !candidate.setupTokenExpiresAt ||
        candidate.setupTokenExpiresAt <= new Date()
      ) {
        fail(
          400,
          'SETUP_INVALID',
          'This setup link is invalid or has expired. Please contact your administrator to request a new link.',
        );
      }
      return { valid: true };
    },
    async completeSetup(body) {
      const { token, password } = setupInput(body);
      // Bound hashing to tokens that exist, then recheck under the lock after hashing.
      const candidate = await database.user.findUnique({
        where: { setupTokenHash: digest(token) },
        select: { id: true, setupTokenExpiresAt: true },
      });
      const invalid = () =>
        fail(
          400,
          'SETUP_INVALID',
          'This setup token is invalid or expired. Request a new one from your administrator.',
        );
      if (!candidate || candidate.setupTokenExpiresAt <= new Date()) invalid();
      const passwordHash = await hashPassword(password);
      await database.$transaction(async (tx) => {
        const user = await lockUser(tx, candidate.id);
        if (
          !user ||
          user.deletedAt ||
          user.deactivatedAt ||
          user.status !== 'INVITED' ||
          user.passwordHash ||
          user.setupTokenHash !== digest(token) ||
          !user.setupTokenExpiresAt ||
          user.setupTokenExpiresAt <= new Date()
        )
          invalid();
        await tx.user.update({
          where: { id: user.id },
          data: { passwordHash, status: 'ACTIVE', ...clearSetup, sessionVersion: { increment: 1 } },
        });
        await audit(tx, user.id, user.id, 'USER_SETUP_COMPLETED');
      });
      return { completed: true };
    },
  };
}
