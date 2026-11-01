import { phishingAwarenessCourse, phishingAwarenessQuiz } from './phishing-awareness.js';
import { safeBrowsingCourse, safeBrowsingQuiz } from './safe-browsing.js';
import { dataPrivacyCourse, dataPrivacyQuiz } from './data-privacy.js';

// Reviewed, human-authored course content available to the development provisioning command.
export const trainingContent = Object.freeze({
  'phishing-awareness': { course: phishingAwarenessCourse, quiz: phishingAwarenessQuiz },
  'safe-browsing': { course: safeBrowsingCourse, quiz: safeBrowsingQuiz },
  'data-privacy': { course: dataPrivacyCourse, quiz: dataPrivacyQuiz },
});
