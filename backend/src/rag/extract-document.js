import { Worker } from 'node:worker_threads';
import { LIMITS, IngestionError } from './ingestion-policy.js';

// Parse only supplied bytes in a disposable worker. No document URLs or rendered HTML.
export async function extractDocument(buffer, format) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > LIMITS.bytes)
    throw new IngestionError('INVALID_FILE_SIZE');
  if (!['pdf', 'docx'].includes(format)) throw new IngestionError('UNSUPPORTED_FORMAT');
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./extract-worker.js', import.meta.url), {
      workerData: { bytes: buffer, format },
      resourceLimits: { maxOldGenerationSizeMb: 256 },
      stdout: true,
      stderr: true,
      env: { NODE_ENV: 'production' },
    });
    // Parser diagnostics may contain source text; never forward them to application logs.
    worker.stdout.resume();
    worker.stderr.resume();
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      if (error) reject(error);
      else resolve(result);
    };
    const timer = setTimeout(() => finish(new IngestionError('EXTRACTION_TIMEOUT')), LIMITS.timeoutMs);
    worker.once('message', (message) =>
      message.error ? finish(new IngestionError(message.error)) : finish(null, message.result),
    );
    worker.once('error', () => finish(new IngestionError('EXTRACTION_FAILED')));
    worker.once('exit', () => finish(new IngestionError('EXTRACTION_FAILED')));
  });
}
