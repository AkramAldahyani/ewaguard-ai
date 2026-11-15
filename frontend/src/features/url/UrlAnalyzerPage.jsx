import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link2 } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader.jsx';
import { Button, Card, Field, Input } from '../../components/ui/index.jsx';
import { createUrlFlow } from './url-state.js';
import { UrlResults } from './UrlResults.jsx';
import { AnalysisPageTheme } from '../../components/analysis-risk-theme.jsx';

export function UrlInputForm({ state, flow }) {
  const busy = state.status === 'submitting';
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void flow.submit();
      }}
      aria-busy={busy}
    >
      <fieldset disabled={busy}>
        <legend className="mb-4 font-bold">Website URL</legend>
        <Field
          id="url-input"
          label="URL to analyze"
          required
          hint="Include http:// or https://. Maximum 4096 characters; public destinations only."
        >
          {(props) => (
            <Input
              {...props}
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={state.url}
              onChange={(event) => flow.edit(event.target.value)}
              placeholder="https://example.com/"
            />
          )}
        </Field>
        <Button type="submit" className="mt-5" disabled={busy}>
          <Link2 className="size-4" aria-hidden="true" />
          {busy ? 'Analyzing URL…' : 'Analyze URL'}
        </Button>
      </fieldset>
      <Button variant="secondary" className="mt-3" onClick={flow.reset}>
        Reset / Clear
      </Button>
    </form>
  );
}
export function UrlAnalyzerPage() {
  const [flow] = useState(createUrlFlow);
  const state = useSyncExternalStore(flow.subscribe, flow.getSnapshot, flow.getSnapshot);
  const feedback = useRef(null);
  useEffect(() => () => flow.dispose(), [flow]);
  useEffect(() => {
    if (state.error || state.result) feedback.current?.focus();
  }, [state.error, state.result]);
  const activeRisk =
    state.status === 'success'
      ? (state.result?.result?.risk ?? (state.result?.replayed ? { riskLevel: state.result.severity } : null))
      : null;
  return (
    <AnalysisPageTheme risk={activeRisk} className="mx-auto w-full min-w-0">
      <div className="mx-auto w-full max-w-6xl min-w-0">
        <PageHeader
          eyebrow="Security analysis"
          title="Analyze URL"
          description="Inspect a link’s structure, public DNS, certificate, and available reputation evidence without opening the webpage."
        />
        <p role="status" aria-live="polite" className="mb-3 text-sm font-semibold text-brand-700">
          {state.status === 'submitting'
            ? 'Analyzing URL… Checking structure and available network evidence.'
            : state.result
              ? 'URL analysis complete.'
              : ''}
        </p>
        {state.error && (
          <div
            ref={feedback}
            tabIndex={-1}
            role="alert"
            className="mb-5 rounded-xl border border-warning-300 bg-warning-50 p-4"
          >
            {state.error}
          </div>
        )}
        {!state.result && (
          <Card className="p-5 sm:p-7">
            <UrlInputForm state={state} flow={flow} />
          </Card>
        )}
        {state.result && (
          <section>
            <div className="analysis-result-heading mb-5 flex flex-wrap items-center justify-between gap-3">
              <h2 ref={feedback} tabIndex={-1} className="text-xl font-bold">
                URL analysis result
              </h2>
              <div className="analysis-result-actions">
                <Button onClick={flow.reset}>Analyze Another URL / Clear</Button>
              </div>
            </div>
            <UrlResults analysis={state.result} />
          </section>
        )}
      </div>
    </AnalysisPageTheme>
  );
}
