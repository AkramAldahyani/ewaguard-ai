import { createDatabaseClient } from '../src/config/database.js';
import { ProvisioningError } from '../src/training/course-provisioning.js';
import { provisionMonthlyQuiz } from '../src/training/monthly-quiz-provisioning.js';
import { monthlyQuizContent } from '../src/training/content/monthly-quizzes.js';

if (process.env.NODE_ENV === 'production') {
  throw new Error(
    'Monthly quiz provisioning is a development tool. Use the administrator monthly quiz interface in production.',
  );
}
const option = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};
const adminEmail = option('--admin-email'),
  requested = option('--period');
const selected =
  requested === 'all' ? monthlyQuizContent : monthlyQuizContent.filter((quiz) => quiz.period === requested);
if (!selected.length) {
  console.error(`Choose --period ${monthlyQuizContent[0].period} … ${monthlyQuizContent.at(-1).period} | all.`);
  process.exit(1);
}
const database = createDatabaseClient();
try {
  for (const content of selected) {
    const result = await provisionMonthlyQuiz(database, { adminEmail, content });
    console.info(
      result.outcome === 'CREATED'
        ? `${result.period} ${result.title}: created as ${result.status}.`
        : `${result.period}: a monthly quiz already exists${result.title ? ` ("${result.title}", ${result.status})` : ''}. Nothing was changed.`,
    );
  }
  console.info(
    'Review, approve and publish monthly quizzes from the administrator Monthly Quizzes page (/admin/monthly-quizzes).',
  );
} catch (error) {
  console.error(
    error instanceof ProvisioningError
      ? error.message
      : 'Monthly quiz provisioning failed. Verify database connectivity, migrations and the administrator account.',
  );
  process.exitCode = 1;
} finally {
  await database.$disconnect();
}
