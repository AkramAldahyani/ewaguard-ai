import { PrismaClient } from '../generated/prisma/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';
import { databaseUrl } from './env.js';

// Construct lazily: the foundation liveness API does not depend on PostgreSQL.
// Callers must disconnect on completion/shutdown. Never enable query payload logs.
export function createDatabaseClient() {
  const adapter = new PrismaPg({ connectionString: databaseUrl() });
  return new PrismaClient({ adapter });
}
