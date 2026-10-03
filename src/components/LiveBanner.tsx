import { Button, Mascot, Meter } from '@likho-ai/ui';
import { useCancelJob, useJobLive, type Layer } from '@likho-ai/web-sdk';
import { clock } from '../lib/format';
import { Lines } from './Lines';

/** Shown while a job is queued or running: the mascot listens, lines arrive as they are written. */
export function LiveBanner({ jobId, status, layer }: { jobId: string; status: string; layer: Layer }) {
  const live = useJobLive(jobId);
  const cancel = useCancelJob();
  const total = live.totalSeconds;
  const written = live.progressSeconds;
  const current = live.status ?? status;
  const label = current === 'queued' ? 'Waiting for a worker' : 'Transcribing';

  return (
    <section
      aria-live="polite"
      aria-labelledby="live-title"
      className="rounded-card border border-line bg-surface p-5 shadow-card"
    >
      <div className="flex flex-wrap items-center gap-4">
        <Mascot pose="listening" size={64} decorative />
        <div className="min-w-0 flex-1">
          <h2 id="live-title" className="font-bold">
            {label}
            {total > 0 && `, ${clock(written)} of ${clock(total)} written`}
          </h2>
          <div className="mt-2 max-w-md">
            <Meter label="Progress" value={total > 0 ? Math.min(1, written / total) : 0} />
          </div>
          {live.connection === 'error' && (
            <p className="mt-1 text-sm text-ink-3">Reconnecting to the live updates…</p>
          )}
        </div>
        <Button variant="ghost" onClick={() => cancel.mutate({ id: jobId })} disabled={cancel.isPending}>
          Cancel
        </Button>
      </div>
      {live.lines.length > 0 && (
        <div className="mt-4 max-h-96 overflow-y-auto">
          <Lines lines={live.lines} layer={layer} currentTime={-1} onSeek={() => {}} fadeIn />
        </div>
      )}
    </section>
  );
}
