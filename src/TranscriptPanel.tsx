/**
 * The transcript of one call as another system shows it beside the recording: the player, the
 * lines in Hinglish or Devanagari, find, and downloads. Read-only, no navigation. Exposed as
 * ./TranscriptPanel; the shell's /embed/recordings/:ref page mounts it with the token a portal
 * was given, and a React host with the Likho provider can mount it directly.
 */
import { Button, Tag } from '@likho-ai/ui';
import {
  saveTextFile,
  toSrt,
  toTxt,
  useRecording,
  useRecordingByExternalId,
  useTranscript,
  type Layer,
} from '@likho-ai/web-sdk';
import { Download } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { LayerToggle, Lines } from './components/Lines';
import { Player, type PlayerHandle } from './components/Player';
import { CHIP, clock, languageName } from './lib/format';
import './app.css';

export interface TranscriptPanelProps {
  /** The recording's Likho id (rec_…), or */
  recordingId?: string;
  /** the id the other system knows the call by (the dialer's), exactly. */
  externalId?: string;
  /** Where the player stands when the panel opens, in seconds. */
  startAt?: number;
}

export default function TranscriptPanel({ recordingId, externalId, startAt = 0 }: TranscriptPanelProps) {
  // The other system's id names the call; the recording itself (with its playback links) is read by its own id.
  const found = useRecordingByExternalId(recordingId ? undefined : externalId);
  const id = recordingId ?? found.data?.id;
  const recording = useRecording(id);
  const lookup = {
    isPending: (!recordingId && found.isPending) || (Boolean(id) && recording.isPending),
    isError: found.isError || recording.isError,
    error: found.error ?? recording.error,
  };
  const rec = id ? (recording.data ?? null) : null;
  const transcript = useTranscript(rec?.latestTranscriptId || null);
  const [layer, setLayer] = useState<Layer>('roman');
  const [find, setFind] = useState('');
  const [time, setTime] = useState(startAt);
  const player = useRef<PlayerHandle>(null);
  const onTime = useCallback((seconds: number) => setTime(seconds), []);

  if (lookup.isPending) {
    return (
      <div
        data-mfe="transcript"
        className="h-48 animate-pulse rounded-card bg-surface-2"
        aria-busy="true"
        aria-label="Loading the transcript"
      />
    );
  }
  if (lookup.isError) {
    return (
      <div
        data-mfe="transcript"
        role="alert"
        className="rounded-card border border-line bg-surface p-5 shadow-card"
      >
        <p className="font-semibold">{lookup.error?.message}</p>
      </div>
    );
  }
  if (!rec) {
    return (
      <div
        data-mfe="transcript"
        className="rounded-card border border-line bg-surface p-5 text-ink-2 shadow-card"
      >
        This call is not in Likho yet.
      </div>
    );
  }
  const chip = CHIP[rec.status];
  const english = transcript.data?.language.decodedAs === 'en';
  const lines = transcript.data?.segments ?? [];
  const busy = ['queued', 'transcribing'].includes(rec.status);
  const download = (kind: 'txt' | 'srt') => {
    const base = rec.originalName.replace(/\.[^.]+$/, '');
    if (kind === 'txt')
      saveTextFile(`${base}.${layer === 'script' ? 'script' : 'hinglish'}.txt`, toTxt(lines, layer));
    else
      saveTextFile(`${base}.srt`, toSrt(lines, layer === 'both' ? 'roman' : layer), 'application/x-subrip');
  };

  return (
    <div data-mfe="transcript" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="break-all font-mono text-sm font-semibold">{rec.originalName}</span>
        {chip && <Tag>{chip.label}</Tag>}
        {rec.detectedLanguage && (
          <Tag>{`${languageName(rec.detectedLanguage)} ${Math.round(rec.languageProbability * 100)}%`}</Tag>
        )}
        {rec.durationSeconds > 0 && <Tag>{clock(rec.durationSeconds)}</Tag>}
      </div>

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

      <section
        aria-labelledby="panel-transcript-title"
        className="rounded-card border border-line bg-surface p-4 shadow-card"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="panel-transcript-title" className="text-lg font-bold">
            Transcript
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <LayerToggle layer={layer} onChange={setLayer} hidden={english} />
            <label className="sr-only" htmlFor="panel-find">
              Find in transcript
            </label>
            <input
              id="panel-find"
              type="search"
              value={find}
              onChange={(e) => setFind(e.target.value)}
              placeholder="Find"
              className="min-h-9 rounded-full border border-line bg-surface px-3 text-sm text-ink focus-visible:outline-accent"
            />
            {lines.length > 0 && (
              <>
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
          </div>
        </div>
        <div className="mt-4">
          {transcript.isPending && rec.latestTranscriptId && (
            <div className="h-40 animate-pulse rounded-input bg-surface-2" aria-busy="true" />
          )}
          {transcript.isError && (
            <p role="alert" className="text-[var(--likho-status-failed-ink)]">
              {transcript.error.message}
            </p>
          )}
          {!rec.latestTranscriptId && (
            <p className="py-6 text-center text-ink-2">
              {busy ? 'Being transcribed; the lines appear here when it is done.' : 'Not transcribed yet.'}
            </p>
          )}
          {lines.length > 0 && (
            <Lines
              lines={lines}
              layer={english ? 'roman' : layer}
              currentTime={time}
              onSeek={(s) => player.current?.seek(s)}
              highlight={find}
            />
          )}
        </div>
      </section>
    </div>
  );
}
