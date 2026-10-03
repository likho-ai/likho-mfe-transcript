# likho-mfe-transcript

The transcript screen of the Likho web app: the player with the waveform, every line in both
layers (as spoken, and Hinglish), the lines arriving live while a job runs, the language and
details, versions, re-applied spellings, and downloads. Loaded by
[likho-web-shell](https://github.com/likho-ai/likho-web-shell) at `/recordings/:id` through Module
Federation; this repository exposes `./App`.

React 19, Vite 8, Tailwind CSS v4 with the likho-ui tokens, likho-web-sdk, wavesurfer.js.

## What it does

- The waveform is drawn at once from the peaks likho-media computed; the audio streams only when
  it plays. Space plays or pauses; the arrow keys skip 5 s; speed 0.75–2×.
- A timestamp seeks the player; the line being played is marked and kept in view.
- Hinglish, Devanagari or both, remembered per browser; hidden for English calls.
- While a job runs: the listening mascot, progress, and each line as it is written. When the job
  ends, the stored transcript is shown.
- Transcribe again, re-apply the workspace's spellings (a new version, without running the model),
  download `.txt` or `.srt`, delete.

## Run it

```bash
pnpm install
pnpm dev            # http://localhost:5175/mfe/transcript/ on its own, against the gateway's API
```

## Develop

```bash
pnpm test && pnpm lint && pnpm typecheck && pnpm build
docker build -t likho-mfe-transcript .    # nginx serving the built files under /mfe/transcript/
```

Settings: `.env.development`, `.env.staging`, `.env.production` (Vite modes). The stylesheet is
scoped under `[data-mfe="transcript"]` (see `vite.config.ts`).
