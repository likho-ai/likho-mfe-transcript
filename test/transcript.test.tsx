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
      for (const call of (this.on as unknown as { mock: { calls: [string, (...a: unknown[]) => void][] } })
        .mock.calls)
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
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn(); // jsdom has no layout; the active line scrolls into view
  });
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
    page(client, '/recordings/rec_1?t=4');
    const lines = within(await screen.findByLabelText('Transcript lines')).getAllByRole('listitem');
    await waitFor(() => expect(lines[1]).toHaveAttribute('aria-current', 'true'));
    expect(lines[0]).not.toHaveAttribute('aria-current', 'true');
    surfer.setTime.mockClear();
    surfer.fire('ready', 61.5);
    expect(surfer.setTime).toHaveBeenCalledWith(4);
    expect(surfer.play).not.toHaveBeenCalled();
  });

  it('corrects a line in place and marks what was corrected', async () => {
    const asked: Record<string, unknown>[] = [];
    const { client } = fakeApi({
      Recording: () => ({ recording: recording('done') }),
      Transcript: (v) => ({ transcript: transcript(v.id as string, v.id === 'trn_2' ? 2 : 1) }),
      TranscriptVersions: () => ({ transcriptVersions: [transcript('trn_1', 1)] }),
      Corrections: () => ({
        corrections: asked.length
          ? [
              {
                id: 'cor_1',
                recordingId: 'rec_1',
                transcriptId: 'trn_1',
                correctedTranscriptId: 'trn_2',
                segmentIndex: 1,
                layer: 'roman',
                before: 'dhanyavaad',
                after: 'shukriya',
                userId: 'usr_1',
                createdAt: new Date().toISOString(),
              },
            ]
          : [],
      }),
      CorrectSegment: (v) => {
        asked.push(v.input as Record<string, unknown>);
        const next = transcript('trn_2', 2);
        next.segments = next.segments.map((s) => (s.index === 1 ? { ...s, textRoman: 'shukriya' } : s));
        return { correctSegment: next };
      },
    });
    page(client);
    const lines = within(await screen.findByLabelText('Transcript lines')).getAllByRole('listitem');
    const user = userEvent.setup();
    await user.click(within(lines[1]!).getByRole('button', { name: 'Correct the Hinglish of line 2' }));
    const box = screen.getByRole('textbox', { name: 'Correct the Hinglish of line 2' });
    expect(box).toHaveValue('dhanyavaad');
    await user.clear(box);
    await user.type(box, 'shukriya{Enter}');
    await waitFor(() =>
      expect(asked).toEqual([{ transcriptId: 'trn_1', segmentIndex: 1, layer: 'roman', text: 'shukriya' }]),
    );
    // The new version is shown, with the line marked as corrected.
    const after = within(await screen.findByLabelText('Transcript lines')).getAllByRole('listitem');
    await waitFor(() => expect(within(after[1]!).getByText('shukriya')).toBeInTheDocument());
    await waitFor(() => expect(within(after[1]!).getByText('corrected')).toBeInTheDocument());
    expect(screen.queryByRole('textbox', { name: /Correct the/ })).not.toBeInTheDocument();
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

  it('shows a viewer the transcript without the ways to change it', async () => {
    const { client } = fakeApi({
      Me: () => ({
        me: {
          id: 'usr_2',
          email: 'v@example.test',
          name: 'Vee',
          role: 'viewer',
          workspace: { id: 'wsp_1', name: 'W' },
        },
      }),
      Recording: () => ({ recording: recording('ready') }),
    });
    page(client);
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Transcribe' })).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Delete this recording' })).not.toBeInTheDocument();
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

  it('shows what the model said about the call, and asks again on request', async () => {
    const made = {
      id: 'ins_1',
      transcriptId: 'trn_1',
      recordingId: 'rec_1',
      transcriptVersion: 1,
      summary: 'The customer ordered Ashwagandha; delivery in two days.',
      intent: 'order',
      products: ['Ashwagandha'],
      sentiment: 'positive',
      checks: [
        { key: 'greeting', label: 'Greeted the customer', answer: 'yes', evidence: 'namaste' },
        { key: 'closing', label: 'Closed the call properly', answer: 'no', evidence: '' },
        { key: 'objection', label: 'Answered an objection', answer: 'na', evidence: '' },
      ],
      scores: [{ key: 'resolution', label: 'The need was handled', score: 9, max: 10, reason: 'Ordered.' }],
      scoreTotal: 9,
      scoreMax: 10,
      model: 'anthropic/claude-sonnet-5-5',
      inputTokens: 1,
      outputTokens: 1,
      formVersion: 'example-1',
      createdAt: new Date().toISOString(),
    };
    const { client, calls } = fakeApi({
      Recording: () => ({ recording: recording('done') }),
      Transcript: () => ({ transcript: transcript('trn_1', 1) }),
      TranscriptVersions: () => ({ transcriptVersions: [transcript('trn_1', 1)] }),
      InsightsStatus: () => ({
        insightsStatus: { enabled: true, model: 'anthropic/claude-sonnet-5-5', formVersion: 'example-1' },
      }),
      Insights: () => ({ insights: made }),
      AnalyseRecording: () => ({ analyseRecording: { ...made, sentiment: 'mixed' } }),
    });
    page(client);
    const panel = (await screen.findByRole('heading', { name: 'Insights' })).closest('section')!;
    expect(
      await within(panel).findByText('The customer ordered Ashwagandha; delivery in two days.'),
    ).toBeInTheDocument();
    expect(within(panel).getByText('Positive')).toBeInTheDocument();
    expect(within(panel).getByText('Ashwagandha')).toBeInTheDocument();
    expect(within(panel).getByText(/Score 9 \/ 10/)).toBeInTheDocument();
    const checks = within(within(panel).getByRole('list', { name: 'Checks' })).getAllByRole('listitem');
    expect(checks).toHaveLength(3);
    expect(checks[0]).toHaveTextContent('Yes');
    expect(checks[0]).toHaveTextContent('Greeted the customer');
    expect(checks[0]).toHaveTextContent('namaste');
    expect(checks[1]).toHaveTextContent('No');
    expect(within(panel).getByText('The need was handled')).toBeInTheDocument();

    await userEvent.setup().click(within(panel).getByRole('button', { name: 'Analyse again' }));
    expect(await within(panel).findByText('Mixed')).toBeInTheDocument();
    expect(calls.find((c) => c.name === 'AnalyseRecording')?.variables).toEqual({ id: 'rec_1', force: true });
  });

  it('says when insights are off, and offers nothing to ask', async () => {
    const { client } = fakeApi({
      Recording: () => ({ recording: recording('done') }),
      Transcript: () => ({ transcript: transcript('trn_1', 1) }),
      TranscriptVersions: () => ({ transcriptVersions: [transcript('trn_1', 1)] }),
      InsightsStatus: () => ({ insightsStatus: { enabled: false, model: '', formVersion: 'example-1' } }),
      Insights: () => ({ insights: null }),
    });
    page(client);
    const panel = (await screen.findByRole('heading', { name: 'Insights' })).closest('section')!;
    expect(await within(panel).findByText(/no model is configured/)).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Analyse' })).not.toBeInTheDocument();
  });
});
