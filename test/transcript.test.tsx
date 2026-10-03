import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { fakeApi, renderAt } from './helpers';

// wavesurfer.js draws on a canvas and decodes audio; neither exists in jsdom.
const { surfer } = vi.hoisted(() => ({
  surfer: {
    on: vi.fn(),
    /** Fires a wavesurfer event the way the real player would. */
    fire(name: string, ...args: unknown[]) {
      for (const call of (this.on as { mock: { calls: [string, (...a: unknown[]) => void][] } }).mock.calls)
        if (call[0] === name) call[1](...args);
    },
    load: vi.fn(async () => {}),
    destroy: vi.fn(),
    setTime: vi.fn(),
    isPlaying: () => false,
    play: vi.fn(async () => {}),
    playPause: vi.fn(),
    skip: vi.fn(),
    setPlaybackRate: vi.fn(),
  },
}));
vi.mock('wavesurfer.js', () => ({
  default: class {
    constructor() {
      return surfer;
    }
  },
}));

import App from '../src/App';

const segments = [
  { index: 0, startSeconds: 0.4, endSeconds: 3.1, textScript: 'नमस्ते', textRoman: 'namaste' },
  { index: 1, startSeconds: 3.5, endSeconds: 6.0, textScript: 'धन्यवाद', textRoman: 'dhanyavaad' },
];

const transcript = (id: string, version: number) => ({
  id,
  recordingId: 'rec_1',
  jobId: version === 1 ? 'job_1' : '',
  version,
  modelRegistryId: 'faster-whisper/turbo',
  engine: 'faster-whisper',
  compute: 'int8',
  script: 'devanagari',
  createdAt: new Date().toISOString(),
  language: {
    detected: 'hi',
    probability: 0.91,
    decodedAs: 'hi',
    policy: 'auto',
    candidates: [
      { language: 'hi', probability: 0.91 },
      { language: 'ur', probability: 0.06 },
    ],
  },
  stats: { audioSeconds: 61.5, elapsedSeconds: 44, realtimeFactor: 1.4, chunks: 6, silenceSkippedSeconds: 3 },
  segments,
});

const recording = (status: string, extra: Record<string, unknown> = {}) => ({
  id: 'rec_1',
  originalName: 'call.mp3',
  mediaId: 'med_1',
  sizeBytes: 1000,
  sha256: '',
  durationSeconds: 61.5,
  channels: 1,
  sampleRate: 8000,
  source: 'upload',
  externalId: '',
  status,
  failureReason: '',
  latestTranscriptId: status === 'done' ? 'trn_1' : '',
  detectedLanguage: status === 'done' ? 'hi' : '',
  languageProbability: status === 'done' ? 0.91 : 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  playbackUrl: 'http://media.test/audio',
  peaksUrl: 'http://media.test/peaks',
  jobs: [],
  ...extra,
});

function page(client: ReturnType<typeof fakeApi>['client'], path = '/recordings/rec_1') {
  vi.stubGlobal(
    'EventSource',
    class {
      addEventListener() {}
      close() {}
    },
  );
  vi.stubGlobal(
    'fetch',
    async () => new Response(JSON.stringify({ peaks: [1, 2], max: 100, duration_seconds: 61.5 })),
  );
  return renderAt(
    path,
    <Routes>
      <Route path="/recordings/:id" element={<App />} />
    </Routes>,
    client,
  );
}

describe('the transcript page', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows both layers of every line, the language and the details', async () => {
    const saved: { name: string; content: string }[] = [];
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: () => {} });
    const { client } = fakeApi({
      Recording: () => ({ recording: recording('done') }),
      Transcript: () => ({ transcript: transcript('trn_1', 1) }),
      TranscriptVersions: () => ({ transcriptVersions: [transcript('trn_1', 1)] }),
    });
    page(client);

    expect(await screen.findByRole('heading', { name: 'call.mp3' })).toBeInTheDocument();
    const lines = within(await screen.findByLabelText('Transcript lines')).getAllByRole('listitem');
    expect(lines).toHaveLength(2);
    expect(within(lines[0]!).getByText('namaste')).toBeInTheDocument();
    expect(within(lines[0]!).queryByText('नमस्ते')).not.toBeInTheDocument(); // Hinglish only, by default

    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Both' }));
    expect(within(lines[0]!).getByText('नमस्ते')).toHaveAttribute('lang', 'hi');
    expect(localStorage.getItem('likho:layer')).toBe('both');

    expect(screen.getByText('Hindi 91%')).toBeInTheDocument();
    expect(screen.getByText('Decoded as Hindi (auto).')).toBeInTheDocument();
    expect(screen.getByText('00:44 (1.4× realtime)')).toBeInTheDocument();

    // Find narrows the lines; the download holds the chosen layer.
    await user.type(screen.getByLabelText('Find in transcript'), 'dhanya');
    expect(within(screen.getByLabelText('Transcript lines')).getAllByRole('listitem')).toHaveLength(1);
    const link = document.createElement('a');
    vi.spyOn(document, 'createElement').mockImplementationOnce(() => {
      Object.defineProperty(link, 'click', {
        value: () => saved.push({ name: link.download, content: 'clicked' }),
      });
      return link;
    });
    await user.click(screen.getByRole('button', { name: '.txt' }));
    expect(saved).toEqual([{ name: 'call.hinglish.txt', content: 'clicked' }]);
  });

  it('opens at the moment a search pointed to: the line is marked and the player stands there', async () => {
    const { client } = fakeApi({
      Recording: () => ({ recording: recording('done') }),
      Transcript: () => ({ transcript: transcript('trn_1', 1) }),
      TranscriptVersions: () => ({ transcriptVersions: [transcript('trn_1', 1)] }),
    });
    Element.prototype.scrollIntoView = vi.fn(); // jsdom has no layout; the active line scrolls into view
    page(client, '/recordings/rec_1?t=4');
    const lines = within(await screen.findByLabelText('Transcript lines')).getAllByRole('listitem');
    await waitFor(() => expect(lines[1]).toHaveAttribute('aria-current', 'true'));
    expect(lines[0]).not.toHaveAttribute('aria-current', 'true');
    surfer.setTime.mockClear();
    surfer.fire('ready', 61.5);
    expect(surfer.setTime).toHaveBeenCalledWith(4);
    expect(surfer.play).not.toHaveBeenCalled();
  });

  it('shows the live banner while a job runs, and the way to start one when none has', async () => {
    const { client } = fakeApi({
      Recording: () => ({
        recording: recording('transcribing', {
          jobs: [
            {
              id: 'job_1',
              status: 'running',
              progressSeconds: 20,
              totalSeconds: 61.5,
              recordingId: 'rec_1',
              modelRegistryId: '',
              languagePolicy: 'auto',
              force: false,
              errorCode: '',
              errorMessage: '',
              transcriptId: '',
              createdAt: '',
              startedAt: null,
              finishedAt: null,
            },
          ],
        }),
      }),
    });
    page(client);
    expect(await screen.findByRole('heading', { name: /Transcribing/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Transcribe' })).not.toBeInTheDocument();
  });

  it('offers Transcribe for a recording that is ready', async () => {
    const started: string[] = [];
    const { client } = fakeApi({
      Recording: () => ({ recording: recording('ready') }),
      CreateJob: (v) => {
        started.push((v.input as { recordingId: string }).recordingId);
        return {
          createJob: {
            id: 'job_1',
            recordingId: 'rec_1',
            status: 'queued',
            modelRegistryId: '',
            languagePolicy: 'auto',
            force: false,
            progressSeconds: 0,
            totalSeconds: 61.5,
            errorCode: '',
            errorMessage: '',
            transcriptId: '',
            createdAt: '',
            startedAt: null,
            finishedAt: null,
          },
        };
      },
    });
    page(client);
    expect(await screen.findByText('Not transcribed yet. Press Transcribe to begin.')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Transcribe' }));
    await waitFor(() => expect(started).toEqual(['rec_1']));
  });
});
