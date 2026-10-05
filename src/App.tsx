/**
 * One recording: its transcript with both layers, the player, live lines while a job runs,
 * language and details, versions. Exposed to the shell as ./App; mounted at /recordings/:id.
 */
import { Button, Meter, StatusChip, Tag } from '@likho-ai/ui';
import {
  saveTextFile,
  toSrt,
  toTxt,
  useCreateJob,
  useDeleteRecording,
  useRecording,
  useCorrectSegment,
  useCorrections,
  useRetransliterate,
  useTranscript,
  useTranscriptVersions,
  type Layer,
} from '@likho-ai/web-sdk';
import { ChevronLeft, Download, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { LayerToggle, Lines } from './components/Lines';
import { LiveBanner } from './components/LiveBanner';
import { Player, type PlayerHandle } from './components/Player';
import { CHIP, clock, languageName } from './lib/format';
import './app.css';

const LAYER_KEY = 'likho:layer';

function readLayer(): Layer {
  try {
    const saved = localStorage.getItem(LAYER_KEY);
    return saved === 'script' || saved === 'both' ? saved : 'roman';
  } catch {
    return 'roman';
  }
}

export default function App() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  // ?t=<seconds>: a line opened from a search; the player stands there and the line is marked.
  const startAt = Math.max(0, Number(params.get('t')) || 0);
  const navigate = useNavigate();
  const recording = useRecording(id);
  const [version, setVersion] = useState<string | null>(null);
  const transcriptId = version ?? recording.data?.latestTranscriptId ?? null;
  const transcript = useTranscript(transcriptId || null);
  const versions = useTranscriptVersions(recording.data?.status === 'done' ? id : undefined);
  const createJob = useCreateJob();
  const retransliterate = useRetransliterate();
  const correct = useCorrectSegment();
  const corrections = useCorrections(recording.data?.status === 'done' ? id : undefined);
  const remove = useDeleteRecording();
  const [layer, setLayerState] = useState<Layer>(readLayer);
  const [find, setFind] = useState('');
  const [time, setTime] = useState(startAt);
  const player = useRef<PlayerHandle>(null);
  const onTime = useCallback((seconds: number) => setTime(seconds), []);

  useEffect(() => {
    try {
      localStorage.setItem(LAYER_KEY, layer);
    } catch {
      /* private mode */
    }
  }, [layer]);

  if (recording.isPending) {
    return (
      <div
        data-mfe="transcript"
        className="animate-pulse h-64 rounded-card bg-surface-2"
        aria-busy="true"
        aria-label="Loading the recording"
      />
    );
  }
  if (recording.isError) {
    return (
      <div
        data-mfe="transcript"
        role="alert"
        className="rounded-card border border-line bg-surface p-6 shadow-card"
      >
        <p className="font-semibold">{recording.error.message}</p>
        <Button className="mt-4" asChild>
          <Link to="/recordings">Back to the recordings</Link>
        </Button>
      </div>
    );
  }
  const rec = recording.data;
  const activeJob = rec.jobs.find((job) => job.status === 'queued' || job.status === 'running');
  const chip = CHIP[rec.status];
  const english = transcript.data?.language.decodedAs === 'en';
  const lines = transcript.data?.segments ?? [];
  // The lines a person corrected to make the version being read.
  const correctedLines = new Set(
    (corrections.data ?? [])
      .filter((c) => c.correctedTranscriptId === transcriptId)
      .map((c) => c.segmentIndex),
  );
  const correctedVersions = new Map((corrections.data ?? []).map((c) => [c.correctedTranscriptId, c]));
  const isLatest = transcriptId === rec.latestTranscriptId;
  const canTranscribe = ['ready', 'done'].includes(rec.status) && !activeJob;
  const download = (kind: 'txt' | 'srt') => {
    const base = rec.originalName.replace(/\.[^.]+$/, '');
    if (kind === 'txt')
      saveTextFile(`${base}.${layer === 'script' ? 'script' : 'hinglish'}.txt`, toTxt(lines, layer));
    else
      saveTextFile(`${base}.srt`, toSrt(lines, layer === 'both' ? 'roman' : layer), 'application/x-subrip');
  };

  return (
    <div data-mfe="transcript" className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-sm text-ink-2">
        <Link to="/recordings" className="inline-flex items-center gap-1 hover:underline">
          <ChevronLeft aria-hidden="true" className="size-4" />
          Recordings
        </Link>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="break-all font-mono text-2xl font-bold sm:text-3xl">{rec.originalName}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusChip status={chip.chip} label={chip.label} />
            {rec.detectedLanguage && (
              <Tag>{`${languageName(rec.detectedLanguage)} ${Math.round(rec.languageProbability * 100)}%`}</Tag>
            )}
            {rec.durationSeconds > 0 && <Tag>{clock(rec.durationSeconds)}</Tag>}
            {transcript.data && <Tag>{transcript.data.modelRegistryId}</Tag>}
            {transcript.data && transcript.data.version > 1 && (
              <Tag>{`version ${transcript.data.version}`}</Tag>
            )}
          </div>
          {rec.status === 'failed' && (
            <p role="alert" className="mt-3 text-[var(--likho-status-failed-ink)]">
              {rec.failureReason}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {canTranscribe && (
            <Button
              variant={rec.status === 'ready' ? 'primary' : 'secondary'}
              onClick={() => createJob.mutate({ recordingId: rec.id, force: rec.status === 'done' })}
              disabled={createJob.isPending}
            >
              <RefreshCw aria-hidden="true" />
              {rec.status === 'done' ? 'Transcribe again' : 'Transcribe'}
            </Button>
          )}
          {transcript.data && (
            <>
              <Button
                onClick={() => retransliterate.mutate({ transcriptId: transcript.data!.id })}
                disabled={retransliterate.isPending}
              >
                Re-apply spellings
              </Button>
              <Button onClick={() => download('txt')}>
                <Download aria-hidden="true" />
                .txt
              </Button>
              <Button onClick={() => download('srt')}>
                <Download aria-hidden="true" />
                .srt
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            aria-label="Delete this recording"
            onClick={() => {
              if (confirm(`Delete ${rec.originalName} and its transcript?`)) {
                remove.mutate({ id: rec.id }, { onSuccess: () => navigate('/recordings') });
              }
            }}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      </header>

      {activeJob && <LiveBanner jobId={activeJob.id} status={activeJob.status} layer={layer} />}

      {rec.playbackUrl && (
        <Player
          ref={player}
          audioUrl={rec.playbackUrl}
          peaksUrl={rec.peaksUrl ?? null}
          durationSeconds={rec.durationSeconds}
          onTime={onTime}
          startAt={startAt}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <section
          aria-labelledby="transcript-title"
          className="rounded-card border border-line bg-surface p-4 shadow-card sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="transcript-title" className="text-xl font-bold">
              Transcript
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <LayerToggle layer={layer} onChange={setLayerState} hidden={english} />
              <label className="sr-only" htmlFor="find">
                Find in transcript
              </label>
              <input
                id="find"
                type="search"
                value={find}
                onChange={(e) => setFind(e.target.value)}
                placeholder="Find"
                className="min-h-9 rounded-full border border-line bg-surface px-3 text-sm text-ink focus-visible:outline-accent"
              />
            </div>
          </div>
          <div className="mt-4">
            {transcript.isPending && transcriptId && (
              <div className="h-40 animate-pulse rounded-input bg-surface-2" aria-busy="true" />
            )}
            {transcript.isError && (
              <p role="alert" className="text-[var(--likho-status-failed-ink)]">
                {transcript.error.message}
              </p>
            )}
            {!transcriptId && !activeJob && (
              <p className="py-6 text-center text-ink-2">
                {rec.status === 'ready'
                  ? 'Not transcribed yet. Press Transcribe to begin.'
                  : 'No transcript yet.'}
              </p>
            )}
            {lines.length > 0 && (
              <>
                <Lines
                  lines={lines}
                  layer={english ? 'roman' : layer}
                  currentTime={time}
                  onSeek={(s) => player.current?.seek(s)}
                  highlight={find}
                  corrected={correctedLines}
                  saving={correct.isPending}
                  onCorrect={
                    isLatest && !activeJob
                      ? (index, which, text) =>
                          correct
                            .mutateAsync({
                              transcriptId: transcriptId!,
                              segmentIndex: index,
                              layer: which,
                              text,
                            })
                            .then((data) => setVersion(data.correctSegment.id))
                      : undefined
                  }
                />
                {correct.error && (
                  <p role="alert" className="mt-2 text-sm text-[var(--likho-status-failed-ink)]">
                    {correct.error.message}
                  </p>
                )}
              </>
            )}
          </div>
        </section>

        <aside className="space-y-6">
          {transcript.data && (
            <section
              aria-labelledby="language-title"
              className="rounded-card border border-line bg-surface p-5 shadow-card"
            >
              <h2 id="language-title" className="font-bold">
                Language
              </h2>
              <div className="mt-3 space-y-2">
                {transcript.data.language.candidates.slice(0, 4).map((candidate) => (
                  <Meter
                    key={candidate.language}
                    label={languageName(candidate.language)}
                    value={candidate.probability}
                  />
                ))}
              </div>
              <p className="mt-3 text-sm text-ink-2">
                Decoded as {languageName(transcript.data.language.decodedAs)} (
                {transcript.data.language.policy}).
              </p>
            </section>
          )}
          {transcript.data && (
            <section
              aria-labelledby="details-title"
              className="rounded-card border border-line bg-surface p-5 shadow-card"
            >
              <h2 id="details-title" className="font-bold">
                Details
              </h2>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-ink-3">Model</dt>
                <dd className="font-mono text-xs">{transcript.data.modelRegistryId}</dd>
                <dt className="text-ink-3">Audio</dt>
                <dd>{clock(transcript.data.stats.audioSeconds)}</dd>
                <dt className="text-ink-3">Took</dt>
                <dd>
                  {clock(transcript.data.stats.elapsedSeconds)} (
                  {transcript.data.stats.realtimeFactor.toFixed(1)}× realtime)
                </dd>
                <dt className="text-ink-3">Silence skipped</dt>
                <dd>{clock(transcript.data.stats.silenceSkippedSeconds)}</dd>
                <dt className="text-ink-3">Lines</dt>
                <dd>{transcript.data.segments.length}</dd>
              </dl>
            </section>
          )}
          {versions.data && versions.data.length > 1 && (
            <section
              aria-labelledby="versions-title"
              className="rounded-card border border-line bg-surface p-5 shadow-card"
            >
              <h2 id="versions-title" className="font-bold">
                Versions
              </h2>
              <ul className="mt-3 space-y-1 text-sm">
                {versions.data.map((v) => (
                  <li key={v.id}>
                    <button
                      type="button"
                      aria-pressed={v.id === transcriptId}
                      onClick={() => setVersion(v.id)}
                      className={`w-full rounded-input px-2 py-1.5 text-left hover:bg-surface-2 ${v.id === transcriptId ? 'bg-surface-2 font-medium' : ''}`}
                    >
                      Version {v.version}
                      <span className="ml-2 text-ink-3">
                        {v.jobId
                          ? 'transcribed'
                          : correctedVersions.has(v.id)
                            ? `line ${correctedVersions.get(v.id)!.segmentIndex + 1} corrected`
                            : 're-applied spellings'}
                      </span>
                      {v.createdAt && (
                        <span className="block text-xs text-ink-3">
                          {new Date(v.createdAt).toLocaleString()}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
