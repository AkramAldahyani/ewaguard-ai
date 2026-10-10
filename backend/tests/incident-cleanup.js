// Only call with IDs of disposable users created by the current test.
export async function cleanupTestIncidents(database, userIds) {
  if (!userIds.length) return;
  const where = { incident: { reporterId: { in: userIds } } };
  await database.notification.deleteMany({ where });
  await database.incidentEvent.deleteMany({ where });
  await database.incidentEvidence.deleteMany({ where });
  await database.incident.deleteMany({ where: { reporterId: { in: userIds } } });
}
