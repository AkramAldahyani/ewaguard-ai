import { DISCLAIMER_DEFINITION, isDisclaimerContext } from '../../../shared/disclaimer.js';

export const ACKNOWLEDGEMENT_DEDUPLICATION_MS = 5 * 60_000;

export async function acknowledgeDisclaimer(database, { userId, context, now = new Date() }) {
  if (!isDisclaimerContext(context)) throw new TypeError('Invalid disclaimer context.');
  const recent = await database.disclaimerAcknowledgement.findFirst({
    where: {
      userId,
      context,
      version: DISCLAIMER_DEFINITION.version,
      createdAt: { gte: new Date(now.getTime() - ACKNOWLEDGEMENT_DEDUPLICATION_MS) },
    },
    orderBy: { createdAt: 'desc' },
    select: acknowledgementSelection,
  });
  if (recent) return { acknowledgement: recent, reused: true };
  const acknowledgement = await database.disclaimerAcknowledgement.create({
    data: { userId, context, version: DISCLAIMER_DEFINITION.version, createdAt: now },
    select: acknowledgementSelection,
  });
  return { acknowledgement, reused: false };
}

export async function verifyAcknowledgement(
  database,
  { acknowledgementId, userId, context, now = new Date(), maxAgeMs = null },
) {
  if (!acknowledgementId || !userId || !isDisclaimerContext(context)) return null;
  if (maxAgeMs !== null && (!Number.isFinite(maxAgeMs) || maxAgeMs < 0))
    throw new TypeError('Invalid acknowledgement validity window.');
  return database.disclaimerAcknowledgement.findFirst({
    where: {
      id: acknowledgementId,
      userId,
      context,
      version: DISCLAIMER_DEFINITION.version,
      ...(maxAgeMs === null ? {} : { createdAt: { gte: new Date(now.getTime() - maxAgeMs) } }),
    },
    select: acknowledgementSelection,
  });
}

const acknowledgementSelection = Object.freeze({
  id: true,
  context: true,
  version: true,
  createdAt: true,
});
