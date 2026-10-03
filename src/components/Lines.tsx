import type { Layer, Line } from '@likho-ai/web-sdk';
import { useEffect, useRef } from 'react';
import { clock } from '../lib/format';

export function LayerToggle({
  layer,
  onChange,
  hidden,
}: {
  layer: Layer;
  onChange: (layer: Layer) => void;
  hidden?: boolean;
}) {
  if (hidden) return null;
  const options: { key: Layer; label: string }[] = [
    { key: 'roman', label: 'Hinglish' },
    { key: 'script', label: 'Devanagari' },
    { key: 'both', label: 'Both' },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Text layer"
      className="inline-flex rounded-full border border-line bg-surface p-1"
    >
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          role="radio"
          aria-checked={layer === option.key}
          onClick={() => onChange(option.key)}
          className={`min-h-9 rounded-full px-3.5 text-sm font-medium ${
            layer === option.key ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:text-ink'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Lines({
  lines,
  layer,
  currentTime,
  onSeek,
  highlight,
  fadeIn = false,
}: {
  lines: Line[];
  layer: Layer;
  currentTime: number;
  onSeek: (seconds: number) => void;
  highlight?: string;
  fadeIn?: boolean;
}) {
  const activeIndex = lines.findIndex(
    (line) => currentTime >= line.startSeconds && currentTime < line.endSeconds,
  );
  const activeRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeIndex]);

  const needle = highlight?.trim().toLowerCase() ?? '';
  const shown = needle
    ? lines.filter(
        (line) => line.textRoman.toLowerCase().includes(needle) || line.textScript.includes(needle),
      )
    : lines;

  if (lines.length === 0) return null;
  return (
    <ol className="divide-y divide-line" aria-label="Transcript lines">
      {shown.map((line) => {
        const active = lines[activeIndex]?.index === line.index;
        return (
          <li
            key={line.index}
            ref={active ? activeRef : undefined}
            aria-current={active ? 'true' : undefined}
            className={`grid grid-cols-[auto_1fr] gap-x-4 px-3 py-3 ${active ? 'rounded-input bg-active-row' : ''} ${fadeIn ? 'fade-in' : ''}`}
          >
            <button
              type="button"
              onClick={() => onSeek(line.startSeconds)}
              className="mt-0.5 font-mono text-sm tabular-nums text-link hover:underline"
              aria-label={`Play from ${clock(line.startSeconds)}`}
            >
              {clock(line.startSeconds)}
            </button>
            <div className="min-w-0">
              {(layer === 'script' || layer === 'both') && (
                <p lang="hi" className="text-[16px] leading-[1.7]">
                  {line.textScript}
                </p>
              )}
              {(layer === 'roman' || layer === 'both') && (
                <p className={`text-[17px] leading-[1.55] ${layer === 'both' ? 'text-ink-2' : ''}`}>
                  {line.textRoman}
                </p>
              )}
            </div>
          </li>
        );
      })}
      {shown.length === 0 && <li className="px-3 py-6 text-ink-3">No line contains “{highlight}”.</li>}
    </ol>
  );
}
