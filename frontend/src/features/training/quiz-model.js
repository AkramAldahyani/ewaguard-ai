export const blankQuestion = () => ({
  text: '',
  type: 'MULTIPLE_CHOICE',
  explanation: '',
  points: 1,
  options: [
    { text: '', isCorrect: true },
    { text: '', isCorrect: false },
  ],
});
export const blankQuiz = () => ({ title: '', passingPercent: 80, maxAttempts: 3, questions: [blankQuestion()] });
export function quizDraftFromServer(quiz) {
  if (!quiz) return blankQuiz();
  return {
    title: quiz.title,
    passingPercent: quiz.passingPercent,
    maxAttempts: quiz.maxAttempts,
    questions: quiz.questions.map((q) => ({
      text: q.text,
      type: q.type,
      explanation: q.explanation,
      points: q.points,
      options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })),
    })),
  };
}
export function quizBody(draft) {
  return {
    title: draft.title.trim(),
    passingPercent: Number(draft.passingPercent),
    maxAttempts: Number(draft.maxAttempts),
    questions: draft.questions.map((q) => ({
      text: q.text.trim(),
      type: q.type,
      explanation: q.explanation.trim(),
      points: Number(q.points),
      options: q.options.map((o) => ({ text: o.text.trim(), isCorrect: o.isCorrect })),
    })),
  };
}
export function validateQuizDraft(draft) {
  const plain = (value, max) =>
    typeof value === 'string' &&
    Boolean(value.trim()) &&
    value.length <= max &&
    !/[<>]/u.test(value) &&
    !Array.from(value).some((character) => {
      const code = character.codePointAt(0);
      return code === 127 || (code < 32 && ![9, 10, 13].includes(code));
    });
  if (!plain(draft.title, 200)) return 'Enter a plain-text quiz title of at most 200 characters.';
  if (
    !Number.isInteger(Number(draft.passingPercent)) ||
    Number(draft.passingPercent) < 1 ||
    Number(draft.passingPercent) > 100
  )
    return 'Passing threshold must be 1–100%.';
  if (!Number.isInteger(Number(draft.maxAttempts)) || Number(draft.maxAttempts) < 1 || Number(draft.maxAttempts) > 10)
    return 'Attempt limit must be 1–10.';
  if (draft.questions.length < 1 || draft.questions.length > 30) return 'Provide 1–30 questions.';
  for (const [index, q] of draft.questions.entries()) {
    if (
      !plain(q.text, 2000) ||
      !plain(q.explanation, 2000) ||
      !Number.isInteger(Number(q.points)) ||
      Number(q.points) < 1 ||
      Number(q.points) > 20
    )
      return `Complete question ${index + 1}, its explanation and points (1–20).`;
    if (
      q.options.length < 2 ||
      q.options.length > 6 ||
      (q.type === 'TRUE_FALSE' && q.options.length !== 2) ||
      q.options.some((o) => !plain(o.text, 1000)) ||
      q.options.filter((o) => o.isCorrect).length !== 1 ||
      new Set(q.options.map((o) => o.text.trim().toLocaleLowerCase())).size !== q.options.length
    )
      return `Question ${index + 1} needs distinct options and exactly one correct answer.`;
  }
  return '';
}
