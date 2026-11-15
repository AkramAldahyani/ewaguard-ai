import '../src/config/env.js';

// Read-only account check: no generation and no key/error-body output.
const model = process.env.OPENAI_MODEL || 'gpt-6-luna';
console.log(JSON.stringify({ model, keyConfigured: Boolean(process.env.OPENAI_API_KEY) }));
if (process.env.OPENAI_API_KEY) {
  try {
    const response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      signal: AbortSignal.timeout(15_000),
    });
    console.log(JSON.stringify({ modelAccessStatus: response.status, available: response.ok }));
    if (!response.ok) process.exitCode = 1;
  } catch {
    console.log(JSON.stringify({ modelAccess: 'network_or_timeout_error' }));
    process.exitCode = 1;
  }
}
