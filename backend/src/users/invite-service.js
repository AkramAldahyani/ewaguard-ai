import { createHash, randomBytes } from 'node:crypto';
import { hashPassword } from '../auth/auth-service.js';
import { fail, fields, userId, passwordInput, setupTokenInput } from './user-policy.js';
import { accountSelect, audit, authorizeMutation } from './user-service.js';

// Shareable self-registration links. Anyone holding an unexpired link can create one employee
// account, so every link is bounded: administrator-issued behind a recent MFA sign-in, hashed at
// rest, short-lived, use-limited, revocable, employee-role only and fully audited.
export const INVITE_LIMITS = Object.freeze({ maxUses: 200, maxHours: 7 * 24, defaultUses: 10, defaultHours: 48 });
const RESOURCE = 'REGISTRATION_INVITE';
const digest = (token) => createHash('sha256').update(token).digest('hex');
const inviteSelect = {
  id: true,
  label: true,
  emailDomain: true,
  maxUses: true,
  useCount: true,
  expiresAt: true,
  revokedAt: true,
  createdAt: true,
  department: { select: { id: true, name: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
};
const invalidLink = () =>
  fail(
    400,
    'INVITE_INVALID',
    'This invite link is invalid, expired, or fully used. Ask your administrator for a new link.',
  );
const stateOf = (invite, now = new Date()) =>
  invite.revokedAt
    ? 'REVOKED'
    : invite.expiresAt <= now
      ? 'EXPIRED'
      : invite.useCount >= invite.maxUses
        ? 'EXHAUSTED'
        : 'ACTIVE';
const present = (invite) => ({ ...invite, state: stateOf(invite) });

function text(value, max, label) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim().length > max ||
    [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  )
    fail(400, 'USER_INVALID', `Enter a valid ${label}.`);
  return value.trim();
}
function integer(value, fallback, max, label) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > max)
    fail(400, 'USER_INVALID', `Choose ${label} between 1 and ${max}.`);
  return value;
}
function inviteInput(body) {
  fields(body, ['label', 'departmentId', 'maxUses', 'expiresInHours', 'emailDomain']);
  let emailDomain = null;
  if (body.emailDomain !== undefined && body.emailDomain !== null && body.emailDomain !== '') {
    emailDomain = text(body.emailDomain, 253, 'email domain').toLowerCase().replace(/^@/, '');
    if (!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(emailDomain))
      fail(400, 'USER_INVALID', 'Enter an email domain such as example.com.');
  }
  return {
    label: text(body.label, 120, 'link name'),
    departmentId: userId(body.departmentId),
    maxUses: integer(body.maxUses, INVITE_LIMITS.defaultUses, INVITE_LIMITS.maxUses, 'a number of accounts'),
    hours: integer(body.expiresInHours, INVITE_LIMITS.defaultHours, INVITE_LIMITS.maxHours, 'a validity in hours'),
    emailDomain,
  };
}
function registrationInput(body) {
  fields(body, ['token', 'firstName', 'lastName', 'email', 'password', 'confirmPassword']);
  setupTokenInput(body.token);
  const email = text(body.email, 254, 'work email').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'USER_INVALID', 'Enter a valid work email.');
  const data = {
    token: body.token,
    firstName: text(body.firstName, 100, 'first name'),
    lastName: text(body.lastName, 100, 'last name'),
    email,
  };
  passwordInput(body);
  return { ...data, password: body.password };
}

export function createInviteService(database, config = {}) {
  const enabled = config.registrationInvitesEnabled !== false;
  const requireEnabled = () => {
    if (!enabled) fail(403, 'INVITES_DISABLED', 'Invite links are disabled on this server.');
  };
  async function usable(client, token) {
    const invite = await client.registrationInvite.findUnique({
      where: { tokenHash: digest(token) },
      select: { ...inviteSelect, departmentId: true, department: { select: { id: true, name: true, active: true } } },
    });
    if (!enabled || !invite || stateOf(invite) !== 'ACTIVE' || !invite.department.active) invalidLink();
    return invite;
  }
  return {
    async list() {
      const items = await database.registrationInvite.findMany({
        select: inviteSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 50,
      });
      return { items: items.map(present), enabled, limits: INVITE_LIMITS };
    },
    async create(auth, body) {
      requireEnabled();
      const input = inviteInput(body);
      const token = randomBytes(32).toString('base64url');
      return database.$transaction(async (tx) => {
        const actor = await authorizeMutation(tx, auth);
        const department = await tx.department.findFirst({
          where: { id: input.departmentId, active: true },
          select: { id: true },
        });
        if (!department) fail(400, 'USER_DEPARTMENT_INVALID', 'Choose an existing department.');
        const invite = await tx.registrationInvite.create({
          data: {
            tokenHash: digest(token),
            label: input.label,
            emailDomain: input.emailDomain,
            maxUses: input.maxUses,
            expiresAt: new Date(Date.now() + input.hours * 3600_000),
            departmentId: department.id,
            createdById: actor.id,
          },
          select: inviteSelect,
        });
        await audit(
          tx,
          actor.id,
          invite.id,
          'REGISTRATION_INVITE_CREATED',
          { maxUses: invite.maxUses, expiresAt: invite.expiresAt.toISOString(), departmentId: department.id },
          RESOURCE,
        );
        // The token leaves the server exactly once, in this response.
        return { invite: present(invite), token };
      });
    },
    async revoke(auth, id, body) {
      fields(body, []);
      userId(id);
      return database.$transaction(async (tx) => {
        const actor = await authorizeMutation(tx, auth);
        await tx.$queryRaw`SELECT id FROM registration_invites WHERE id = ${id}::uuid FOR UPDATE`;
        const current = await tx.registrationInvite.findUnique({ where: { id }, select: inviteSelect });
        if (!current) fail(404, 'INVITE_NOT_FOUND', 'Invite link not found.');
        if (current.revokedAt) return { invite: present(current) };
        const invite = await tx.registrationInvite.update({
          where: { id },
          data: { revokedAt: new Date() },
          select: inviteSelect,
        });
        await audit(tx, actor.id, id, 'REGISTRATION_INVITE_REVOKED', { useCount: invite.useCount }, RESOURCE);
        return { invite: present(invite) };
      });
    },
    async validate(body) {
      fields(body, ['token']);
      const invite = await usable(database, setupTokenInput(body.token));
      return {
        valid: true,
        department: invite.department.name,
        emailDomain: invite.emailDomain,
        expiresAt: invite.expiresAt,
      };
    },
    async register(body) {
      const input = registrationInput(body);
      // Bound password hashing to links that exist, then recheck everything under the row lock.
      const candidate = await usable(database, input.token);
      const domainMatches = (invite) => !invite.emailDomain || input.email.endsWith(`@${invite.emailDomain}`);
      const wrongDomain = (invite) =>
        fail(400, 'INVITE_EMAIL_DOMAIN', `Use your @${invite.emailDomain} work email address.`);
      if (!domainMatches(candidate)) wrongDomain(candidate);
      const passwordHash = await hashPassword(input.password);
      return database.$transaction(async (tx) => {
        // Serialize with administrator directory changes so identity uniqueness is checked consistently. Take this
        // before the invite row, in the same order as revoke(): the opposite order deadlocks.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(194731, 1)`;
        await tx.$queryRaw`SELECT id FROM registration_invites WHERE id = ${candidate.id}::uuid FOR UPDATE`;
        const invite = await usable(tx, input.token);
        if (!domainMatches(invite)) wrongDomain(invite);
        if (
          await tx.user.findFirst({
            where: { email: { equals: input.email, mode: 'insensitive' } },
            select: { id: true },
          })
        )
          fail(
            409,
            'REGISTRATION_EMAIL_UNAVAILABLE',
            'An account cannot be created with this email address. If you already have an account, sign in instead.',
          );
        const user = await tx.user.create({
          data: {
            firstName: input.firstName,
            lastName: input.lastName,
            email: input.email,
            passwordHash,
            status: 'ACTIVE',
            departmentId: invite.departmentId,
            // Invite links can never create privileged accounts.
            roleId: (await tx.role.findUniqueOrThrow({ where: { name: 'EMPLOYEE' } })).id,
          },
          select: accountSelect,
        });
        await tx.registrationInvite.update({ where: { id: invite.id }, data: { useCount: { increment: 1 } } });
        await audit(tx, user.id, user.id, 'USER_SELF_REGISTERED', { inviteId: invite.id, role: 'EMPLOYEE' });
        return { completed: true };
      });
    },
  };
}
