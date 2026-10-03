import { useEffect, useState } from 'react';
import { Link, Route, Routes } from 'react-router';

function Foundation() {
  const [status, setStatus] = useState('Checking API connectivity…');
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    let active = true;
    async function checkHealth() {
      try {
        const response = await fetch('/api/health', { signal: controller.signal });
        if (!response.ok) throw new Error('Health request failed');
        const result = await response.json();
        if (result.status !== 'ok' || result.service !== 'ewaguard-api') throw new Error('Unexpected response');
        if (active) setStatus('API is reachable.');
      } catch {
        if (active) setStatus('API is unavailable. Start the backend, then reload this page.');
      } finally {
        clearTimeout(timeout);
      }
    }
    checkHealth();
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, []);

  return (
    <section aria-labelledby="foundation-title" className="rounded-xl border border-slate-200 bg-white p-6 sm:p-10">
      <p className="mb-3 text-sm font-semibold text-slate-600">Phase 0 · Project foundation</p>
      <h1 id="foundation-title" className="text-3xl font-semibold tracking-tight">EWAGuard AI</h1>
      <p className="mt-4 max-w-2xl leading-7 text-slate-600">
        Enterprise cybersecurity, incident triage, and security awareness.
        This foundation verifies that the frontend and API can communicate.
      </p>
      <p className="mt-6 rounded-lg bg-slate-100 p-4 text-sm" role="status">{status}</p>
      <p className="mt-3 text-sm text-slate-500">Connectivity is a live check. Database and security services are not connected yet.</p>
      <p className="mt-8 text-sm font-medium text-slate-700">Security tools detect. The risk engine evaluates. AI explains and coordinates.</p>
    </section>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:bg-white focus:p-3">Skip to content</a>
      <header className="border-b border-slate-200 bg-white">
        <nav aria-label="Main navigation" className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-5">
          <Link to="/" className="font-semibold">EWAGuard AI</Link>
          <span className="text-sm text-slate-500">Development foundation</span>
        </nav>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto max-w-5xl px-6 py-12">
        <Routes>
          <Route path="/" element={<Foundation />} />
          <Route path="*" element={<section><h1 className="text-2xl font-semibold">Page not found</h1><Link to="/" className="mt-4 inline-block underline">Return home</Link></section>} />
        </Routes>
      </main>
    </div>
  );
}
