import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
export { FILE_MAX_BYTES, FILE_EXTENSIONS } from '../../../../shared/file-policy.js';
export const FILE_LIMITS = Object.freeze({
  submissionsPerMinute: 5,
  activeAnalyses: 2,
  uploadTimeoutMs: 30_000,
  clamavTimeoutMs: 60_000,
  yaraTimeoutMs: 15_000,
  scannerOutputBytes: 64 * 1024,
  archiveEntries: 200,
  archiveExpandedBytes: 50 * 1024 * 1024,
  archiveRatio: 100,
  acknowledgementMaxAgeMs: 15 * 60_000,
});
// Outside the repository and frontend dev server's filesystem serving scope.
export const FILE_TEMP_ROOT = path.join(tmpdir(), 'ewaguard-ai-file-analysis');
export const DEFAULT_YARA_RULES = fileURLToPath(new URL('../../../security/yara/', import.meta.url));
export class FileAnalysisError extends Error {
  constructor(code = 'INVALID_FILE_UPLOAD') {
    super(
      {
        INVALID_FILE_UPLOAD: 'Provide exactly one supported file and no other fields.',
        FILE_TOO_LARGE: 'The file exceeds the 10 MiB limit.',
        EMPTY_FILE: 'The selected file is empty.',
        UNSUPPORTED_FILE: 'This file extension or content format is not supported.',
        FILE_CLEANUP_FAILED: 'Temporary file cleanup could not be confirmed. Contact IT/security.',
        FILE_UPLOAD_TIMEOUT: 'The upload took too long. Try again with a stable connection.',
      }[code],
    );
    this.code = code;
  }
}
