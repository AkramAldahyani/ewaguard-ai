// Explicit projection for authorized investigation views; never select credentials.
export const identitySelect = {
  id: true, employeeIdentifier: true, firstName: true, lastName: true,
  department: { select: { id: true, name: true } },
  role: { select: { name: true } },
};

export function actorKind(actorId, system) {
  if (actorId) return 'USER';
  return ['AUTOMATED_RISK_ENGINE', 'RETENTION_WORKER'].includes(system) ? 'SYSTEM' : 'UNKNOWN';
}
