import { createHash, createHmac } from 'node:crypto';
import { completeAnalysisEscalation } from '../incidents/incident-engine.js';

export class SubmissionError extends Error {
  constructor(code, message) {
    super(message);
    this.status = 409;
    this.code = code;
  }
}

// No raw submission or response cache. The existing analysis primary key is the
// cross-process uniqueness boundary; the keyed digest detects key misuse.
export async function submitOnce(database, { key, userId, type, payload, secret, onReplay }, submit) {
  if (key === undefined) return submit(database); // Existing API clients remain compatible.
  if (typeof key !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) {
    throw new SubmissionError('INVALID_SUBMISSION_KEY', 'Use a UUID submission key.');
  }
  const model = { EMAIL: 'emailAnalysis', URL: 'urlAnalysis', FILE: 'fileAnalysis', FILE_HASH: 'fileAnalysis' }[type];
  if (!model) throw new Error('Unsupported analyzer');
  const hex = createHash('sha256')
    .update(`analysis-submission-v1:${userId}:${type}:${key.toLowerCase()}`)
    .digest('hex');
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  const digest = createHmac('sha256', secret).update(payload).digest('hex');
  const find = () => database[model].findUnique({ where: { id } });
  const replay = async (row) => {
    if (row.userId !== userId || row.evidence?.submissionDigest !== digest) {
      throw new SubmissionError(
        'SUBMISSION_KEY_CONFLICT',
        'This submission key was already used for different content. Start a new analysis.',
      );
    }
    if (onReplay) return onReplay(row);
    return {
      replayed: true,
      analysisId: row.id,
      createdAt: row.createdAt.toISOString(),
      analyzerType: type,
      severity: row.severity,
      riskScore: row.riskScore,
      incident: await completeAnalysisEscalation(database, { userId, analyzerType: type, analysisId: id }),
    };
  };
  const existing = await find();
  if (existing) return replay(existing);
  const delegate = new Proxy(database[model], {
    get(target, property) {
      if (property === 'create')
        return (args) =>
          target.create({
            ...args,
            data: { ...args.data, id, evidence: { ...args.data.evidence, submissionDigest: digest } },
          });
      const value = target[property];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const scoped = new Proxy(database, {
    get(target, property) {
      if (property === model) return delegate;
      const value = target[property];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  try {
    return await submit(scoped);
  } catch (error) {
    if (error.code !== 'P2002') throw error;
    const winner = await find();
    if (!winner) throw error;
    return replay(winner);
  }
}
