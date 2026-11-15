// Helpers for human-authored monthly awareness quiz content.
// `course` (source training course slug) and `level` (BEGINNER or APPLIED) are authoring metadata kept in the
// content source and documentation only; the existing monthly quiz engine stores text, type, topic, explanation,
// points and options.

export const mc = (course, topic, level, text, options, answer, explanation) => ({
  course,
  topic,
  level,
  type: 'MULTIPLE_CHOICE',
  text,
  explanation,
  points: 1,
  options: options.map((option, index) => ({ text: option, isCorrect: index === answer })),
});

export const tf = (course, topic, level, text, answer, explanation) => ({
  course,
  topic,
  level,
  type: 'TRUE_FALSE',
  text,
  explanation,
  points: 1,
  options: [
    { text: 'True', isCorrect: answer === true },
    { text: 'False', isCorrect: answer === false },
  ],
});

// Follows the existing administrator authoring defaults: 80% to pass, 3 attempts, and a window covering the
// whole UTC month (first instant of the month until the first instant of the next month).
export function monthlyDraft({ period, title, questions }) {
  const [year, month] = period.split('-').map(Number);
  return {
    period,
    title,
    passingPercent: 80,
    maxAttempts: 3,
    opensAt: `${period}-01T00:00:00.000Z`,
    closesAt: new Date(Date.UTC(year, month, 1)).toISOString(),
    questions: questions.map(({ text, type, explanation, points, options, topic }) => ({
      text,
      type,
      explanation,
      points,
      options,
      topic,
    })),
  };
}
