import { screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import TranscriptPanel from '../src/TranscriptPanel';
import { fakeApi, renderAt } from './helpers';

// wavesurfer.js draws on a canvas and decodes audio; neither exists in jsdom.
vi.mock('wavesurfer.js', () => ({
  default: class {
    on = vi.fn();
    load = vi.fn(async () => {});
    destroy = vi.fn();
    setTime = vi.fn();
    isPlaying = () => false;
    play = vi.fn(async () => {});
    playPause = vi.fn();
    skip = vi.fn();
    setPlaybackRate = vi.fn();
  },
}));

const recording = {
  id: 'rec_1',
  originalName: 'd000-call.mp3',
  mediaId: 'med_1',
  sizeBytes: 1000,
  sha256: '',
  durationSeconds: 61.5,
  channels: 1,
  sampleRate: 8000,
  source: 'ameyo',
  externalId: 'd000-call',
  status: 'done',
  failureReason: '',
  latestTranscriptId: 'trn_1',
  detectedLanguage: 'hi',
  languageProbability: 0.91,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  playbackUrl: 'http://media.test/audio',
  peaksUrl: null,
  jobs: [],
  attributes: [],
  callTime: new Date().toISOString(),
};

const transcript = {
  id: 'trn_1',
  recordingId: 'rec_1',
  jobId: 'job_1',
  version: 1,
  modelRegistryId: 'faster-whisper/turbo',
  engine: 'faster-whisper',
  compute: 'int8',
  script: 'devanagari',
  createdAt: new Date().toISOString(),
  language: { detected: 'hi', probability: 0.91, decodedAs: 'hi', policy: 'auto', candidates: [] },
  stats: { audioSeconds: 61.5, elapsedSeconds: 44, realtimeFactor: 1.4, chunks: 6, silenceSkippedSeconds: 3 },
  segments: [
    { index: 0, startSeconds: 0.4, endSeconds: 3.1, textScript: 'नमस्ते', textRoman: 'namaste' },
    { index: 1, startSeconds: 3.5, endSeconds: 6.0, textScript: 'धन्यवाद', textRoman: 'dhanyavaad' },
  ],
};

function panel(client: ReturnType<typeof fakeApi>['client'], props: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    async () => new Response(JSON.stringify({ peaks: [1, 2], max: 100, duration_seconds: 61.5 })),
  );
  return renderAt(
    '/embed',
    <Routes>
      <Route path="/embed" element={<TranscriptPanel {...props} />} />
    </Routes>,
    client,
  );
}

describe('the transcript panel for another system', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('finds the call by the id the other system knows and shows the lines, read-only', async () => {
    const { client, calls } = fakeApi({
      Recordings: (v) => ({
        recordings: {
          items: (v.filter as { externalId?: string })?.externalId === 'd000-call' ? [recording] : [],
          hasMore: false,
          endCursor: null,
        },
      }),
      Recording: () => ({ recording }),
      Transcript: () => ({ transcript }),
    });
    panel(client, { externalId: 'd000-call' });
    const lines = within(await screen.findByLabelText('Transcript lines')).getAllByRole('listitem');
    expect(lines).toHaveLength(2);
    expect(within(lines[0]!).getByText('namaste')).toBeInTheDocument();
    expect(screen.getByText('Hindi 91%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '.txt' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Transcribe/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
    expect(calls.find((c) => c.name === 'Recordings')?.variables).toEqual({
      filter: { externalId: 'd000-call' },
      first: 1,
    });
  });

  it('says so when the call is not in Likho, or has no transcript yet', async () => {
    const { client } = fakeApi({
      Recordings: () => ({ recordings: { items: [], hasMore: false, endCursor: null } }),
    });
    panel(client, { externalId: 'd000-missing' });
    expect(await screen.findByText('This call is not in Likho yet.')).toBeInTheDocument();

    const { client: other } = fakeApi({
      Recording: () => ({ recording: { ...recording, status: 'queued', latestTranscriptId: '' } }),
    });
    panel(other, { recordingId: 'rec_1' });
    expect(await screen.findByText(/Being transcribed/)).toBeInTheDocument();
  });
});
