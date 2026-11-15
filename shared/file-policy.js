// Shared UX/API limits. The backend remains authoritative.
export const FILE_MAX_BYTES = 10 * 1024 * 1024;
export const FILE_EXTENSIONS = Object.freeze([
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'txt',
  'csv',
  'zip',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'exe',
  'dll',
  'ps1',
  'js',
  'vbs',
  'bat',
  'cmd',
  'sh',
  'py',
]);
export const FILE_ACCEPT = FILE_EXTENSIONS.map((extension) => `.${extension}`).join(',');
export const FILE_PRIVACY_NOTICE =
  'EWAGuard AI uses SHA-256 reputation lookup only. The uploaded file is not submitted to VirusTotal by this analyzer.';
