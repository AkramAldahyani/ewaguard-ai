import { createDatabaseClient } from '../src/config/database.js';
import { purgeExpiredChats } from '../src/ai/chat-service.js';

const database = createDatabaseClient();
try {
  const result = await purgeExpiredChats(database);
  console.info(JSON.stringify({ event: 'expired_chats_purged', count: result.count }));
} catch {
  console.error(JSON.stringify({ event: 'chat_retention_failed' }));
  process.exitCode = 1;
} finally { await database.$disconnect(); }
