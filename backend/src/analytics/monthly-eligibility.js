import { Prisma } from '../generated/prisma/client.ts';

// Participation is measured against the employees who were expected to take a monthly quiz, not against
// those who happened to start it. An employee is expected when the account existed before the quiz closed and
// was still usable when it opened: active today, or deactivated only after the window began.
// SQL fragment for a join between the aliases `u` (users) and `mq` (monthly_quizzes).
export const MONTHLY_ELIGIBLE_EMPLOYEE = Prisma.sql`u."createdAt" < mq."closesAt"
  AND ((u.status = 'ACTIVE' AND u."deactivatedAt" IS NULL) OR u."deactivatedAt" >= mq."opensAt")`;
