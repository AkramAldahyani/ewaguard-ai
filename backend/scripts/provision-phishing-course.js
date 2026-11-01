import { createDatabaseClient } from '../src/config/database.js';
import { provisionCourse, ProvisioningError } from '../src/training/course-provisioning.js';
import { phishingAwarenessCourse, phishingAwarenessQuiz } from '../src/training/content/phishing-awareness.js';

if (process.env.NODE_ENV === 'production') {
  throw new Error('Course provisioning is a development tool. Use the administrator training interface in production.');
}
const flag = process.argv.indexOf('--admin-email');
const adminEmail = flag === -1 ? undefined : process.argv[flag + 1];
const database = createDatabaseClient();
try {
  const result = await provisionCourse(database, { adminEmail, course: phishingAwarenessCourse, quiz: phishingAwarenessQuiz });
  const messages = {
    CREATED: 'Created the Phishing Awareness draft course and draft quiz.',
    QUIZ_ADDED: 'The course already existed; added its missing draft quiz.',
    ALREADY_EXISTS: 'Phishing Awareness already exists. Nothing was changed.',
    MULTIPLE_EXISTING: 'More than one Phishing Awareness program exists. Nothing was changed; review them in the administrator interface.',
  };
  console.info(messages[result.outcome]);
  if (result.programId) console.info(`Program ${result.programId} (${result.status}). Review, publish and assign it from the administrator Training Programs page (/admin/training).`);
} catch (error) {
  console.error(error instanceof ProvisioningError ? error.message
    : 'Course provisioning failed. Verify database connectivity, migrations and the administrator account.');
  process.exitCode = 1;
} finally {
  await database.$disconnect();
}
