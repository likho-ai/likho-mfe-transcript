/**
 * The waveform player: wavesurfer.js over the peaks likho-media computed, so the waveform is
 * drawn at once and the audio is only streamed when it plays. Space plays or pauses; the arrow
 * keys skip 5 s.
 */
import { Button } from '@likho-ai/ui';
import { Pause, Play, RotateCcw, RotateCw } from 'lucide-react';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { clock } from '../lib/format';

export interface PlayerHandle {
  seek(seconds: number): void;
}

interface Peaks {
  peaks: number[];
  max: number;
  duration_seconds: number;
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

export const Player = forwardRef<
  PlayerHandle,
  {
    audioUrl: string;
    peaksUrl: string | null;
    durationSeconds: number;
    onTime: (seconds: number) => void;
    /** Where to stand when the audio is ready (a line opened from a search), without playing. */
    startAt?: number;
  }
>(function Player({ audioUrl, peaksUrl, durationSeconds, onTime, startAt = 0 }, ref) {
  const container = useRef<HTMLDivElement>(null);
  const surfer = useRef<WaveSurfer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(durationSeconds);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    seek: (seconds) => {
      surfer.current?.setTime(seconds);
      if (!surfer.current?.isPlaying()) void surfer.current?.play();
    },
  }));

  useEffect(() => {
    if (!container.current) return;
    let cancelled = false;
    const styles = getComputedStyle(document.documentElement);
    const wave = new WaveSurfer({
      container: container.current,
      height: 72,
      waveColor: styles.getPropertyValue('--likho-wave').trim() || '#c7d2ff',
      progressColor: styles.getPropertyValue('--likho-accent').trim() || '#7c3aed',
      cursorColor: styles.getPropertyValue('--likho-accent-strong').trim() || '#5d0ec0',
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
    });
    surfer.current = wave;
    wave.on('play', () => setPlaying(true));
    wave.on('pause', () => setPlaying(false));
    wave.on('finish', () => setPlaying(false));
    wave.on('ready', (d) => {
      setDuration(d);
      if (startAt > 0 && startAt < d) wave.setTime(startAt);
    });
    wave.on('timeupdate', (t) => {
      setTime(t);
      onTime(t);
    });
    wave.on('error', (e) => setError(e instanceof Error ? e.message : 'The audio could not be loaded.'));

    (async () => {
      let peaks: number[][] | undefined;
      if (peaksUrl) {
        try {
          const body = (await (await fetch(peaksUrl)).json()) as Peaks;
          peaks = [body.peaks.map((p) => p / (body.max || 100))];
        } catch {
          /* no waveform: wavesurfer decodes the audio itself */
        }
      }
      if (cancelled) return;
      try {
        await wave.load(audioUrl, peaks, durationSeconds || undefined);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'The audio could not be loaded.');
      }
    })();

    return () => {
      cancelled = true;
      wave.destroy();
      surfer.current = null;
    };
  }, [audioUrl, peaksUrl, durationSeconds, onTime, startAt]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return;
      if (event.code === 'Space') {
        event.preventDefault();
        void surfer.current?.playPause();
      } else if (event.key === 'ArrowRight') surfer.current?.skip(5);
      else if (event.key === 'ArrowLeft') surfer.current?.skip(-5);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const changeSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]!;
    setSpeed(next);
    surfer.current?.setPlaybackRate(next, true);
  };

  return (
    <section
      aria-label="Player"
      className="rounded-card border border-line bg-surface p-4 shadow-card sm:p-5"
    >
      <div ref={container} className="w-full" data-testid="waveform" />
      {error && (
        <p role="alert" className="mt-2 text-sm text-[var(--likho-status-failed-ink)]">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="icon"
          variant="primary"
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={() => void surfer.current?.playPause()}
        >
          {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        </Button>
        <Button size="icon" aria-label="Back 5 seconds" onClick={() => surfer.current?.skip(-5)}>
          <RotateCcw aria-hidden="true" />
        </Button>
        <Button size="icon" aria-label="Forward 5 seconds" onClick={() => surfer.current?.skip(5)}>
          <RotateCw aria-hidden="true" />
        </Button>
        <Button size="sm" aria-label={`Speed ${speed} times`} onClick={changeSpeed}>
          {speed}×
        </Button>
        <span className="ml-auto font-mono text-sm tabular-nums text-ink-2" aria-live="off">
          {clock(time)} / {clock(duration)}
        </span>
      </div>
    </section>
  );
});
