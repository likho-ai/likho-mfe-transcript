import type { CorrectionLayer, Layer, Line } from '@likho-ai/web-sdk';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { clock } from '../lib/format';

/** A line being corrected: the text of one layer, as the person types it. */
function Editor({
  initial,
  lang,
  label,
  onSave,
  onCancel,
  saving,
}: {
  initial: string;
  lang?: string;
  label: string;
  onSave: (text: string) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [text, setText] = useState(initial);
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    box.current?.focus();
    box.current?.setSelectionRange(text.length, text.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- focus once, when the editor opens
  }, []);
  const keys = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (text.trim() && text.trim() !== initial) onSave(text.trim());
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  };
  return (
    <div className="space-y-2">
      <textarea
        ref={box}
        lang={lang}
        aria-label={label}
        value={text}
        rows={2}
        disabled={saving}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={keys}
        className="w-full rounded-input border border-line-strong bg-surface px-3 py-2 text-[16px] leading-[1.6] text-ink focus-visible:outline-accent"
      />
      <p className="text-xs text-ink-3">Enter saves, Esc cancels, Shift+Enter for a new line.</p>
    </div>
  );
}

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
  corrected,
  onCorrect,
  saving = false,
}: {
  lines: Line[];
  layer: Layer;
  currentTime: number;
  onSeek: (seconds: number) => void;
  highlight?: string;
  fadeIn?: boolean;
  /** The lines a person corrected in this version, by index. */
  corrected?: ReadonlySet<number>;
  /** When given, a line's text can be clicked (or E pressed) and edited in place. */
  onCorrect?: (index: number, layer: CorrectionLayer, text: string) => Promise<unknown>;
  saving?: boolean;
}) {
  const [editing, setEditing] = useState<{ index: number; layer: CorrectionLayer } | null>(null);
  // The line being played; between lines (a pause, or a moment opened from a search just before
  // a line), the one about to start.
  let activeIndex = lines.findIndex(
    (line) => currentTime >= line.startSeconds && currentTime < line.endSeconds,
  );
  if (activeIndex < 0)
    activeIndex = lines.findIndex(
      (line) => line.startSeconds >= currentTime && line.startSeconds - currentTime <= 1,
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
              {(['script', 'roman'] as const)
                .filter((which) => layer === 'both' || layer === which)
                .map((which) => {
                  const text = which === 'script' ? line.textScript : line.textRoman;
                  const open = editing?.index === line.index && editing.layer === which;
                  if (open && onCorrect) {
                    return (
                      <Editor
                        key={which}
                        initial={text}
                        lang={which === 'script' ? 'hi' : undefined}
                        label={`Correct the ${which === 'script' ? 'Devanagari' : 'Hinglish'} of line ${line.index + 1}`}
                        saving={saving}
                        onCancel={() => setEditing(null)}
                        onSave={(value) =>
                          void onCorrect(line.index, which, value).then(() => setEditing(null))
                        }
                      />
                    );
                  }
                  const classes =
                    which === 'script'
                      ? 'text-[16px] leading-[1.7]'
                      : `text-[17px] leading-[1.55] ${layer === 'both' ? 'text-ink-2' : ''}`;
                  if (!onCorrect) {
                    return (
                      <p key={which} lang={which === 'script' ? 'hi' : undefined} className={classes}>
                        {text}
                      </p>
                    );
                  }
                  return (
                    <p key={which} lang={which === 'script' ? 'hi' : undefined} className={classes}>
                      <button
                        type="button"
                        lang={which === 'script' ? 'hi' : undefined}
                        onClick={() => setEditing({ index: line.index, layer: which })}
                        onKeyDown={(event) => {
                          if (event.key === 'e' || event.key === 'E')
                            setEditing({ index: line.index, layer: which });
                        }}
                        title="Click to correct this line"
                        aria-label={`Correct the ${which === 'script' ? 'Devanagari' : 'Hinglish'} of line ${line.index + 1}`}
                        className="rounded-sm text-left hover:bg-surface-2 focus-visible:outline-accent"
                      >
                        {text}
                      </button>
                    </p>
                  );
                })}
              {corrected?.has(line.index) && (
                <span className="mt-1 inline-block rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent-strong">
                  corrected
                </span>
              )}
            </div>
          </li>
        );
      })}
      {shown.length === 0 && <li className="px-3 py-6 text-ink-3">No line contains “{highlight}”.</li>}
    </ol>
  );
}
