import { createDatabaseClient } from '../src/config/database.js';
import { provisionCourse, ProvisioningError } from '../src/training/course-provisioning.js';
import { trainingContent } from '../src/training/content/index.js';

if (process.env.NODE_ENV === 'production') {
  throw new Error('Course provisioning is a development tool. Use the administrator training interface in production.');
}
const option = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};
const adminEmail = option('--admin-email'),
  requested = option('--course');
const slugs = requested === 'all' ? Object.keys(trainingContent) : [requested];
if (!slugs.every((slug) => Object.hasOwn(trainingContent, slug))) {
  console.error(`Choose --course ${[...Object.keys(trainingContent), 'all'].join(' | ')}.`);
  process.exit(1);
}
const messages = {
  CREATED: 'Created the draft course and draft quiz.',
  QUIZ_ADDED: 'The course already existed; added its missing draft quiz.',
  ALREADY_EXISTS: 'Already exists. Nothing was changed.',
  MULTIPLE_EXISTING:
    'More than one program with this title exists. Nothing was changed; review them in the administrator interface.',
};
const database = createDatabaseClient();
try {
  for (const slug of slugs) {
    const { course, quiz } = trainingContent[slug];
    const result = await provisionCourse(database, { adminEmail, course, quiz });
    console.info(
      `${course.title}: ${messages[result.outcome]}${result.programId ? ` Program ${result.programId} (${result.status}).` : ''}`,
    );
  }
  console.info('Review, publish and assign courses from the administrator Training Programs page (/admin/training).');
} catch (error) {
  console.error(
    error instanceof ProvisioningError
      ? error.message
      : 'Course provisioning failed. Verify database connectivity, migrations and the administrator account.',
  );
  process.exitCode = 1;
} finally {
  await database.$disconnect();
}
