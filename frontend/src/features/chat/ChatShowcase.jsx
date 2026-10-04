import { Link } from 'react-router';
import { Button, Card } from '../../components/ui/index.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { AIMessage, AnalysisResultBlock, ChatError, CitationCard, EmployeeMessage, IncidentEscalationBanner, SecurityNotice, ToolRunningState } from './ChatMessages.jsx';

export function ChatShowcase() {
  return <><PageHeader eyebrow="Design showcase" title="Chat component previews" description="Synthetic layout examples only. No tools ran, no sources were retrieved, and no incidents were created." actions={<Button as={Link} to="/assistant" variant="secondary">Return to assistant</Button>} />
    <SecurityNotice>These components accept structured data for later integration. All content below is a layout demonstration, not a security finding or legal citation.</SecurityNotice>
    <div className="mt-6 grid items-start gap-6 xl:grid-cols-2">
      <Card className="p-5"><h2 className="font-bold">Message presentation</h2><EmployeeMessage content="Example employee message for layout review." /><AIMessage content="Example assistant message for layout review. This is not an AI-generated answer." /><ChatError /></Card>
      <Card className="space-y-3 p-5"><h2 className="font-bold">Future tool activity</h2>{['Analyzing email…', 'Checking URL indicators…', 'Reviewing file metadata…', 'Searching Bahrain PDPL…', 'Checking company policy…'].map((label) => <ToolRunningState key={label} label={label} />)}</Card>
      <Card className="space-y-4 p-5"><h2 className="font-bold">Evidence and source layouts</h2><AnalysisResultBlock analysisType="Unconnected analysis" /><CitationCard /><IncidentEscalationBanner /></Card>
      <Card className="space-y-4 p-5"><h2 className="font-bold">Severity treatments — synthetic examples</h2>{[['LOW', 10], ['MEDIUM', 40], ['HIGH', 75], ['CRITICAL', 95]].map(([severity, riskScore]) => <AnalysisResultBlock key={severity} analysisType={`${severity} layout example`} severity={severity} riskScore={riskScore} evidenceNote="Synthetic score for visual review only; no evidence was analyzed." />)}</Card>
    </div>
  </>;
}
