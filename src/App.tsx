import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Tickets } from "./components/Tickets";
import { Tuning } from "./components/Tuning";
import { ListenSession } from "./audio/session";
import { acquireAudio } from "./audio/capture";
import { Engine } from "./engine/client";
import { formatBytes, groupProgress, type ModelProgress, type ProgressGroup, type ReadyInfo } from "./engine/protocol";
import {
  DEFAULT_SETTINGS,
  SPEECH_MODELS,
  TRANSLATION_MODEL,
  loadSettings,
  saveSettings,
  type ListenSource,
  type Settings,
} from "./models";
import { reduceRows, type Row } from "./tickets";
import { transcriptToText } from "./text/export";
import { cleanTranscript } from "./text/transcript";
import { translateWithOllama } from "./translate/ollama";

type Phase = "idle" | "loading" | "listening";

function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Something went wrong.";
}

export function App() {
  const [settings, setSettings] = useState<Settings>(() =>
    typeof localStorage === "undefined" ? DEFAULT_SETTINGS : loadSettings(),
  );
  const [rows, setRows] = useState<Row[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [banner, setBanner] = useState("");
  const [note, setNote] = useState("");
  const [quiet, setQuiet] = useState(false);
  const [backlogMs, setBacklogMs] = useState(0);
  const [progress, setProgress] = useState<ProgressGroup[]>([]);
  const [ready, setReady] = useState<ReadyInfo | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const [hasVideo, setHasVideo] = useState(false);

  const settingsRef = useRef(settings);
  const rowsRef = useRef(rows);
  const phaseRef = useRef(phase);
  const engineRef = useRef<Engine | null>(null);
  const sessionRef = useRef<ListenSession | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const levelRef = useRef(0);
  const manualStop = useRef(false);
  const startGeneration = useRef(0);
  const translations = useRef(new Map<number, string>());
  const translateRef = useRef<(id: number, german: string) => Promise<void>>(async () => {});
  const filesRef = useRef(new Map<string, ModelProgress>());

  settingsRef.current = settings;
  rowsRef.current = rows;
  phaseRef.current = phase;

  if (!engineRef.current) engineRef.current = new Engine();

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setHasVideo(false);
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const translateLine = useCallback(async (id: number, german: string) => {
    const from = german.trim();
    if (!from) return;
    const engine = engineRef.current;
    if (!engine) return;
    if (translations.current.get(id) === from) return;
    translations.current.set(id, from);
    setRows((current) => reduceRows(current, { type: "translate-start", id }));
    try {
      const current = settingsRef.current;
      const english =
        current.engine === "ollama"
          ? await translateWithOllama(current.ollamaModel, from)
          : await engine.translate(from);
      if (translations.current.get(id) !== from) return;
      setRows((currentRows) =>
        reduceRows(currentRows, {
          type: "translate-done",
          id,
          english: cleanTranscript(english),
          from,
        }),
      );
    } catch (error) {
      if (translations.current.get(id) === from) translations.current.delete(id);
      if (errorText(error) === "Stopped." || errorText(error) === "Restarting the models.") return;
      setRows((currentRows) =>
        reduceRows(currentRows, { type: "translate-error", id, message: errorText(error) }),
      );
    }
  }, []);

  translateRef.current = translateLine;

  const updateSettings = useCallback((partial: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...partial };
      saveSettings(next);
      sessionRef.current?.update({ sensitivity: next.sensitivity, silenceMs: next.silenceMs });
      if (partial.translateLive && !current.translateLive) {
        for (const row of rowsRef.current) {
          if (row.kind === "line" && row.ticket.german && row.ticket.translation !== "done" && row.ticket.translation !== "pending") {
            void translateRef.current(row.ticket.id, row.ticket.german);
          }
        }
      }
      return next;
    });
  }, []);

  const stop = useCallback(
    async (message = "") => {
      manualStop.current = true;
      startGeneration.current += 1;
      await sessionRef.current?.stop();
      releaseStream();
      setPhase("idle");
      setQuiet(false);
      setBacklogMs(0);
      setProgress([]);
      if (message) setNote(message);
    },
    [releaseStream],
  );

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const session = new ListenSession(engine, {
      onPartial: (id, atMs, german) => {
        setRows((current) => reduceRows(current, { type: "draft", id, atMs, german }));
      },
      onDraft: (id, atMs, german) => {
        setRows((current) => reduceRows(current, { type: "draft", id, atMs, german }));
        if (settingsRef.current.translateLive) void translateRef.current(id, german);
      },
      onFinal: (id, atMs, german) => {
        setRows((current) =>
          german
            ? reduceRows(current, { type: "final", id, atMs, german })
            : reduceRows(current, { type: "drop", id }),
        );
        if (german && settingsRef.current.translateLive) void translateRef.current(id, german);
      },
      onLevel: (level) => {
        levelRef.current = level;
      },
      onBacklog: setBacklogMs,
      onQuiet: setQuiet,
      onEnded: () => {
        if (manualStop.current || phaseRef.current === "idle") return;
        void stop("Sharing ended. Start again when the video is playing.");
      },
      onError: (message) => setBanner(message),
    });
    sessionRef.current = session;
    return () => {
      void session.stop();
      engine.stop();
    };
  }, [stop]);

  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream || !hasVideo) return;
    video.srcObject = stream;
    void video.play().catch(() => undefined);
  }, [hasVideo]);

  async function start() {
    const engine = engineRef.current;
    const session = sessionRef.current;
    if (!engine || !session) return;
    setBanner("");
    setNote("");
    manualStop.current = false;
    const generation = ++startGeneration.current;
    const current = settingsRef.current;

    let stream: MediaStream;
    try {
      stream = await acquireAudio(current.source);
    } catch (error) {
      setBanner(errorText(error));
      return;
    }
    if (generation !== startGeneration.current) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    streamRef.current = stream;
    setHasVideo(stream.getVideoTracks().length > 0);
    setPhase("loading");
    filesRef.current = new Map();
    setProgress([]);
    engine.onProgress = (item) => {
      if (!item.file || !item.total) return;
      filesRef.current.set(`${item.name}/${item.file}`, item);
      setProgress(groupProgress(filesRef.current.values()));
    };

    try {
      const info = await engine.load({
        asrModel: SPEECH_MODELS[current.model].id,
        mtModel: current.engine === "builtin" ? TRANSLATION_MODEL.id : null,
        device: current.device,
      });
      if (generation !== startGeneration.current) return;
      if (rowsRef.current.some((row) => row.kind === "line")) {
        setRows((existing) => reduceRows(existing, { type: "session", text: "Listening again" }));
      }
      setReady(info);
      if (info.note) setNote(info.note);
      await session.start(stream, {
        sensitivity: current.sensitivity,
        silenceMs: current.silenceMs,
      });
      if (generation !== startGeneration.current) return;
      setPhase("listening");
    } catch (error) {
      if (generation !== startGeneration.current) return;
      const message = errorText(error);
      if (message !== "Stopped.") setBanner(message);
      await session.stop();
      releaseStream();
      setPhase("idle");
    }
  }

  function cancel() {
    void stop();
  }

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el || !settings.follow || !pinnedRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [rows, settings.follow, phase]);

  function onScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
    pinnedRef.current = settings.follow && nearBottom;
    setShowJump(settings.follow && !nearBottom && rows.length > 0);
  }

  function jumpToLive() {
    const el = scrollerRef.current;
    pinnedRef.current = true;
    if (el) el.scrollTop = el.scrollHeight;
    setShowJump(false);
  }

  const lineCount = useMemo(() => rows.filter((row) => row.kind === "line").length, [rows]);
  const locked = phase !== "idle";
  const showExample = phase === "idle" && lineCount === 0;

  return (
    <div className="shell" style={{ ["--text-scale" as string]: String(settings.textScale) }}>
      <header className="top">
        <div className="top-inner">
          <div className="brand">
            <svg className="mark" viewBox="0 0 32 32" aria-hidden="true">
              <rect x="3" y="5" width="11" height="22" />
              <rect x="18" y="5" width="11" height="22" />
            </svg>
            <div>
              <h1>Nebenbei</h1>
              <p>Live German, with English beside it.</p>
            </div>
          </div>

          <div className="listen-state" role="status">
            <span className={phase === "listening" ? "dot is-on" : "dot"} />
            <span>{phase === "listening" ? "Listening" : phase === "loading" ? "Preparing" : "Ready"}</span>
            <LevelMeter levelRef={levelRef} active={phase === "listening"} />
          </div>

          <div className="top-actions">
            <div className="segmented" role="radiogroup" aria-label="Audio source">
              <button
                type="button"
                role="radio"
                aria-checked={settings.source === "tab"}
                className={settings.source === "tab" ? "is-selected" : undefined}
                disabled={locked}
                onClick={() => updateSettings({ source: "tab" })}
              >
                Video tab
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={settings.source === "mic"}
                className={settings.source === "mic" ? "is-selected" : undefined}
                disabled={locked}
                onClick={() => updateSettings({ source: "mic" })}
              >
                Microphone
              </button>
            </div>
            {phase === "loading" ? (
              <button type="button" className="primary" onClick={cancel}>
                Cancel
              </button>
            ) : phase === "listening" ? (
              <button type="button" className="primary is-stop" onClick={() => void stop()}>
                Stop
              </button>
            ) : (
              <button type="button" className="primary" onClick={() => void start()}>
                Start listening
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="workspace">
        {banner ? (
          <div className="banner" role="alert">
            <p>{banner}</p>
            <button type="button" onClick={() => setBanner("")}>
              Dismiss
            </button>
          </div>
        ) : null}
        {note ? (
          <div className="note">
            <p>{note}</p>
            <button type="button" onClick={() => setNote("")}>
              Dismiss
            </button>
          </div>
        ) : null}

        <div className="columns" aria-hidden="true">
          <h2>
            German <span>as spoken</span>
          </h2>
          <h2>
            English <span>the same lines</span>
          </h2>
        </div>

        <div className="stage" ref={scrollerRef} onScroll={onScroll}>
          {showExample ? <Example source={settings.source} /> : null}
          {phase === "loading" ? <ProgressCard groups={progress} engine={settings.engine} /> : null}
          <Tickets
            rows={rows}
            translateLive={settings.translateLive}
            onEdit={(id, german) => {
              setRows((current) => reduceRows(current, { type: "edit", id, german }));
              if (settingsRef.current.translateLive) void translateLine(id, german);
            }}
            onTranslate={(id, german) => void translateLine(id, german)}
          />
          <div className="stage-end" />
        </div>

        {showJump ? (
          <button type="button" className="jump" onClick={jumpToLive}>
            Back to the live line
          </button>
        ) : null}

        <div className="toolbar">
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.translateLive}
              onChange={(event) => updateSettings({ translateLive: event.target.checked })}
            />
            Translate as I listen
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.follow}
              onChange={(event) => {
                pinnedRef.current = event.target.checked;
                updateSettings({ follow: event.target.checked });
                if (event.target.checked) jumpToLive();
              }}
            />
            Follow the live line
          </label>
          <div className="toolbar-spacer" />
          {quiet && phase === "listening" ? (
            <p className="hint">
              {settings.source === "tab"
                ? "No audio yet. Stop, share the video tab again, and turn on “Share tab audio”."
                : "No audio yet. Move the microphone closer, or lower Pickup in Tuning."}
            </p>
          ) : null}
          {backlogMs > 2500 && phase === "listening" ? (
            <p className="hint">About {Math.round(backlogMs / 1000)}s behind the voice. The Fast model keeps up more easily.</p>
          ) : null}
          <button
            type="button"
            disabled={lineCount === 0}
            onClick={() => {
              const text = transcriptToText(rows);
              const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = "nebenbei.txt";
              link.click();
              URL.revokeObjectURL(url);
            }}
          >
            Save text
          </button>
          <button
            type="button"
            disabled={lineCount === 0}
            onClick={() => {
              if (!confirmClear) {
                setConfirmClear(true);
                return;
              }
              setRows([]);
              setConfirmClear(false);
            }}
          >
            {confirmClear ? "Clear the lines?" : "Clear"}
          </button>
        </div>

        <Tuning settings={settings} locked={locked} onChange={updateSettings} />
        <p className="footnote">{footnote(settings, ready, phase)}</p>
      </div>
      <video ref={videoRef} className="capture-sink" playsInline muted />
    </div>
  );
}

function footnote(settings: Settings, ready: ReadyInfo | null, phase: Phase): string {
  if (phase === "loading") {
    return "The first start downloads the models into this browser. Later starts use that copy. The sound stays on this computer.";
  }
  const speech = SPEECH_MODELS[settings.model].label.toLowerCase();
  const device = ready?.device === "webgpu" ? "graphics chip" : "CPU";
  if (settings.engine === "ollama") {
    const model = settings.ollamaModel || "the model you choose";
    return `German from the ${speech} speech model on the ${device}. English from Ollama (${model}), through this page only.`;
  }
  return `German from the ${speech} speech model on the ${device}. English from the built-in translator, also in this browser.`;
}

function Example({ source }: { source: ListenSource }) {
  return (
    <section className="intro">
      <div className="intro-copy">
        <p>
          {source === "tab"
            ? "Play the video in another browser tab. Start listening, choose that tab, and turn on “Share tab audio”. The video keeps playing where it is. This page only reads the sound."
            : "The microphone hears the room, including a video on your speakers. A shared browser tab is clearer when you can use one."}
        </p>
        <p>Each phrase becomes a line. German stays on the left. English arrives on the right, or when you ask for it. Scroll up whenever you want to reread.</p>
      </div>
      <article className="ticket is-example">
        <div className="german-side">
          <div className="ticket-meta">
            <time>00:12</time>
            <span className="live-tag">Example</span>
          </div>
          <p lang="de" className="german">
            Guten Abend, willkommen zur heutigen Sendung. Wir beginnen mit den Nachrichten aus Berlin.
          </p>
        </div>
        <div className="english-side">
          <p className="side-kicker">English</p>
          <p lang="en" className="english">
            Good evening, welcome to today’s broadcast. We begin with the news from Berlin.
          </p>
        </div>
      </article>
    </section>
  );
}

function ProgressCard({ groups, engine }: { groups: ProgressGroup[]; engine: Settings["engine"] }) {
  return (
    <section className="progress-card" aria-live="polite">
      <h2>Preparing on this computer</h2>
      <p>
        {engine === "builtin"
          ? "Downloading the speech model and the German-to-English translator. They stay in this browser afterwards."
          : "Downloading the speech model. English will come from Ollama on this computer."}
      </p>
      {groups.length === 0 ? (
        <p className="english-wait">Contacting the model files…</p>
      ) : (
        <ul>
          {groups.map((group) => (
            <li key={group.label}>
              <div className="progress-label">
                <span>{group.label}</span>
                <span>
                  {formatBytes(group.loaded)} / {formatBytes(group.total)}
                </span>
              </div>
              <div className="progress-track">
                <span style={{ width: `${group.progress}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LevelMeter({ levelRef, active }: { levelRef: RefObject<number>; active: boolean }) {
  const barRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!active) {
      if (barRef.current) barRef.current.style.transform = "scaleX(0)";
      return;
    }
    let frame = 0;
    const tick = () => {
      if (barRef.current) barRef.current.style.transform = `scaleX(${levelRef.current})`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, levelRef]);

  return (
    <span className="meter" aria-hidden="true">
      <span ref={barRef} />
    </span>
  );
}
