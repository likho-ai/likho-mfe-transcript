/**
 * What the model says about the call: a summary, the products, the customer's mood, and the
 * auditor's form pre-filled - every check with the line it rests on, every scored point with
 * its reason. Nothing is shown (and nothing leaves) while no model is configured.
 */
import { Button, Meter, Tag } from '@likho-ai/ui';
import {
  useAnalyseRecording,
  useInsights,
  useInsightsStatus,
  type Insights,
  type RecordingLive,
} from '@likho-ai/web-sdk';
import { RefreshCw } from 'lucide-react';

export const SENTIMENT: Record<string, string> = {
  positive: 'Positive',
  neutral: 'Neutral',
  negative: 'Negative',
  mixed: 'Mixed',
};

const ANSWER: Record<string, { short: string; long: string; className: string }> = {
  yes: { short: 'Yes', long: 'Yes', className: 'font-semibold text-ink' },
  no: { short: 'No', long: 'No', className: 'font-semibold text-[var(--likho-status-failed-ink)]' },
  na: { short: '–', long: 'The call gave no way to tell', className: 'text-ink-3' },
};

const FAILED = 'mt-3 text-sm text-[var(--likho-status-failed-ink)]';

const number = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

interface Props {
  recordingId: string;
  /** The transcript the page would analyse now; null while the call has none. */
  latestTranscriptId: string | null;
  live: RecordingLive;
  canChange: boolean;
}

export function InsightsPanel({ recordingId, latestTranscriptId, live, canChange }: Props) {
  const insights = useInsights(recordingId);
  const status = useInsightsStatus();
  const analyse = useAnalyseRecording();
  const off = status.data?.enabled === false;
  const data = insights.data ?? null;
  const stale = Boolean(data && latestTranscriptId && data.transcriptId !== latestTranscriptId);
  const failure = live.insights?.status === 'failed' ? live.insights : null;
  const busy = analyse.isPending;

  return (
    <section
      aria-labelledby="insights-title"
      className="rounded-card border border-line bg-surface p-5 shadow-card"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="insights-title" className="font-bold">
          Insights
        </h2>
        {canChange && !off && latestTranscriptId && (
          <Button
            variant={data ? 'ghost' : 'secondary'}
            aria-label={data ? 'Analyse again' : 'Analyse'}
            onClick={() => analyse.mutate({ id: recordingId, force: Boolean(data) })}
            disabled={busy}
          >
            <RefreshCw aria-hidden="true" className={busy ? 'animate-spin' : undefined} />
            {data ? 'Again' : 'Analyse'}
          </Button>
        )}
      </div>
      {off ? (
        <p className="mt-3 text-sm text-ink-2">
          Off: no model is configured, so no transcript text leaves this installation.
        </p>
      ) : insights.isPending ? (
        <p className="mt-3 text-sm text-ink-3" aria-busy="true">
          Reading…
        </p>
      ) : insights.isError ? (
        <p role="alert" className={FAILED}>
          {insights.error.message}
        </p>
      ) : !data ? (
        <p className="mt-3 text-sm text-ink-2">
          {!latestTranscriptId
            ? 'There is no transcript to read yet.'
            : busy
              ? 'Asking the model…'
              : 'Not analysed yet. Every new transcript is read within a minute or two.'}
        </p>
      ) : (
        <Body data={data} stale={stale} />
      )}
      {analyse.isError && (
        <p role="alert" className={FAILED}>
          {analyse.error.message}
        </p>
      )}
      {failure && !analyse.isError && (
        <p role="status" className={FAILED}>
          The model could not read this call: {failure.message || failure.code}.
        </p>
      )}
    </section>
  );
}

function Body({ data, stale }: { data: Insights; stale: boolean }) {
  const ratio = data.scoreMax > 0 ? Math.min(1, data.scoreTotal / data.scoreMax) : 0;
  return (
    <div className="mt-3 space-y-4 text-sm">
      {stale && (
        <p className="rounded-input bg-surface-2 px-3 py-2 text-ink-2">
          Made from version {data.transcriptVersion} of the transcript; the call has a newer one.
        </p>
      )}
      <p>{data.summary}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Tag>{SENTIMENT[data.sentiment] ?? data.sentiment}</Tag>
        {data.intent && <Tag>{data.intent}</Tag>}
        {data.products.map((product) => (
          <Tag key={product}>{product}</Tag>
        ))}
      </div>
      {data.scoreMax > 0 && (
        <div>
          <Meter label={`Score ${number(data.scoreTotal)} / ${number(data.scoreMax)}`} value={ratio} />
          <ul className="mt-2 space-y-1.5" aria-label="Scored points">
            {data.scores.map((point) => (
              <li key={point.key} className="flex justify-between gap-3">
                <span>
                  <span className="font-medium">{point.label}</span>
                  {point.reason && <span className="block text-ink-3">{point.reason}</span>}
                </span>
                <span className="shrink-0 font-mono text-xs">
                  {number(point.score)} / {number(point.max)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.checks.length > 0 && (
        <div>
          <h3 className="font-medium">Checks</h3>
          <ul className="mt-1 divide-y divide-line" aria-label="Checks">
            {data.checks.map((check) => {
              const answer = ANSWER[check.answer] ?? ANSWER.na!;
              return (
                <li key={check.key} className="flex gap-3 py-1.5">
                  <span className={`w-8 shrink-0 text-xs ${answer.className}`} title={answer.long}>
                    {answer.short}
                  </span>
                  <span>
                    {check.label}
                    {check.evidence && (
                      <q className="block text-ink-3" lang="hi">
                        {check.evidence}
                      </q>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <p className="text-xs text-ink-3">
        {data.model} · form {data.formVersion}
        {data.createdAt ? ` · ${new Date(data.createdAt).toLocaleString()}` : ''}
      </p>
    </div>
  );
}
