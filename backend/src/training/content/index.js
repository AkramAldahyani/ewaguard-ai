import { phishingAwarenessCourse, phishingAwarenessQuiz } from './phishing-awareness.js';
import { safeBrowsingCourse, safeBrowsingQuiz } from './safe-browsing.js';
import { dataPrivacyCourse, dataPrivacyQuiz } from './data-privacy.js';
import { physicalSecurityCourse, physicalSecurityQuiz } from './physical-security.js';
import { reportingSecurityIncidentsCourse, reportingSecurityIncidentsQuiz } from './reporting-security-incidents.js';

// Reviewed, human-authored course content available to the development provisioning command.
export const trainingContent = Object.freeze({
  'phishing-awareness': { course: phishingAwarenessCourse, quiz: phishingAwarenessQuiz },
  'safe-browsing': { course: safeBrowsingCourse, quiz: safeBrowsingQuiz },
  'data-privacy': { course: dataPrivacyCourse, quiz: dataPrivacyQuiz },
  'physical-security': { course: physicalSecurityCourse, quiz: physicalSecurityQuiz },
  'reporting-security-incidents': { course: reportingSecurityIncidentsCourse, quiz: reportingSecurityIncidentsQuiz },
});
