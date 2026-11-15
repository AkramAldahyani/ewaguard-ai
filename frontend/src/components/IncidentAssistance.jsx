import { Badge, Card } from './ui/index.jsx';

const urgencyStyles = {
  ROUTINE: { tone: 'neutral', className: '' },
  CAUTION: { tone: 'warning', className: 'border-warning-200' },
  URGENT: { tone: 'warning', className: 'border-l-4 border-l-warning-600' },
  IMMEDIATE: { tone: 'danger', className: 'border-l-4 border-l-danger-600' },
};

function Actions({ title, items }) {
  if (!items?.length) return null;
  return (
    <div>
      <h4 className="font-bold text-slate-950">{title}</h4>
      <ul className="mt-2 list-disc space-y-2 pl-5 text-slate-700">
        {items.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
    </div>
  );
}

function ConditionalGuidance({ title, guidance }) {
  if (!guidance) return null;
  return (
    <div className="space-y-3 rounded-xl bg-slate-50 p-4">
      <h4 className="font-bold text-slate-950">{title}</h4>
      <p className="text-slate-700">{guidance.summary}</p>
      <Actions title="Steps to follow if this applies" items={guidance.actions} />
    </div>
  );
}

export function IncidentAssistance({ assistance }) {
  if (!assistance) return null;
  const style = urgencyStyles[assistance.urgency] ?? urgencyStyles.CAUTION;
  return (
    <Card className={`min-w-0 space-y-5 p-5 sm:p-7 ${style.className}`} aria-label="What should I do now?">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-bold text-slate-950">What should I do now?</h3>
        <Badge tone={style.tone}>{assistance.urgency}</Badge>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recommended next step</p>
        <p className="mt-1 text-base font-bold text-slate-950">{assistance.headline}</p>
        <p className="mt-3 text-slate-700">{assistance.summary}</p>
      </div>
      {assistance.confidenceNotes.length > 0 && (
        <div className="space-y-2 rounded-xl bg-slate-50 p-4 text-slate-700">
          {assistance.confidenceNotes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      )}
      <Actions title="Immediate actions" items={assistance.immediateActions} />
      <Actions title="Actions to avoid" items={assistance.avoidActions} />
      <div className="rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h4 className="font-bold text-slate-950">Escalation recommendation</h4>
          <Badge tone={style.tone}>{assistance.escalationRecommendation.level}</Badge>
        </div>
        <p className="mt-2 text-slate-700">{assistance.escalationRecommendation.description}</p>
      </div>
      <Actions title="Follow-up actions" items={assistance.followUpActions} />
      <ConditionalGuidance
        title="If credentials or MFA may have been exposed"
        guidance={assistance.credentialGuidance}
      />
      <ConditionalGuidance
        title="If execution or device compromise is suspected"
        guidance={assistance.deviceContainmentGuidance}
      />
      <Actions title="Preserve evidence" items={assistance.evidencePreservationGuidance} />
      <p className="text-sm text-slate-600">{assistance.disclaimer}</p>
      <p className="text-xs text-slate-500">Assistance policy {assistance.version}</p>
    </Card>
  );
}
