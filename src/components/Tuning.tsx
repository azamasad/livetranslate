import { useEffect, useRef, useState } from "react";
import { pairOf, type Settings, type SpeechModelKey } from "../models";
import { fetchOllamaModels, type OllamaModel } from "../translate/ollama";

type TuningProps = {
  settings: Settings;
  locked: boolean;
  onChange: (partial: Partial<Settings>) => void;
};

const SCALES = [
  { value: 0.9, label: "Smaller" },
  { value: 1, label: "Reading" },
  { value: 1.22, label: "Larger" },
];

export function Tuning({ settings, locked, onChange }: TuningProps) {
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [ollamaNote, setOllamaNote] = useState("");
  const chosenModel = useRef(settings.ollamaModel);
  chosenModel.current = settings.ollamaModel;

  useEffect(() => {
    if (settings.engine !== "ollama") return;
    const controller = new AbortController();
    setOllamaNote("Looking for Ollama…");
    fetchOllamaModels(controller.signal)
      .then((found) => {
        setModels(found);
        setOllamaNote(found.length === 0 ? "Ollama is running and has no models yet." : "");
        const first = found[0];
        if (!chosenModel.current && first) onChange({ ollamaModel: first.name });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setModels([]);
        setOllamaNote(error instanceof Error ? error.message : "Could not reach Ollama.");
      });
    return () => controller.abort();
  }, [onChange, settings.engine]);

  const pair = pairOf(settings);
  const clear = pair.clear;
  const builtinKind = clear && settings.translation === "clear" ? "clear" : "quick";

  return (
    <details className="tuning">
      <summary>Tuning</summary>
      <div className="tuning-grid">
        <fieldset disabled={locked}>
          <legend>Speech model</legend>
          <div className="choice-list">
            {(Object.keys(pair.speech) as SpeechModelKey[]).map((key) => {
              const model = pair.speech[key];
              return (
                <label key={key} className={settings.model === key ? "choice is-selected" : "choice"}>
                  <input
                    type="radio"
                    name="speech-model"
                    checked={settings.model === key}
                    onChange={() => onChange({ model: key })}
                  />
                  <span>
                    <strong>{model.label}</strong>
                    <small>{model.detail}</small>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset disabled={locked}>
          <legend>{pair.target.name}</legend>
          <div className="choice-list">
            {clear ? (
              <label className={settings.engine === "builtin" && builtinKind === "clear" ? "choice is-selected" : "choice"}>
                <input
                  type="radio"
                  name="engine"
                  checked={settings.engine === "builtin" && builtinKind === "clear"}
                  onChange={() => onChange({ engine: "builtin", translation: "clear" })}
                />
                <span>
                  <strong>{clear.label}</strong>
                  <small>{clear.detail}</small>
                </span>
              </label>
            ) : null}
            <label className={settings.engine === "builtin" && builtinKind === "quick" ? "choice is-selected" : "choice"}>
              <input
                type="radio"
                name="engine"
                checked={settings.engine === "builtin" && builtinKind === "quick"}
                onChange={() => onChange({ engine: "builtin", translation: "quick" })}
              />
              <span>
                <strong>{pair.quick.label}</strong>
                <small>{pair.quick.detail}</small>
              </span>
            </label>
            <label className={settings.engine === "ollama" ? "choice is-selected" : "choice"}>
              <input
                type="radio"
                name="engine"
                checked={settings.engine === "ollama"}
                onChange={() => onChange({ engine: "ollama" })}
              />
              <span>
                <strong>Ollama</strong>
                <small>A model you already run locally. A small one is the model that can keep up.</small>
              </span>
            </label>
          </div>
          {settings.engine === "ollama" ? (
            <div className="ollama-row">
              {models.length > 0 ? (
                <label>
                  Model
                  <select
                    value={settings.ollamaModel}
                    onChange={(event) => onChange({ ollamaModel: event.target.value })}
                  >
                    {models.map((model) => (
                      <option key={model.name} value={model.name}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label>
                  Model name
                  <input
                    value={settings.ollamaModel}
                    placeholder="llama3.2"
                    onChange={(event) => onChange({ ollamaModel: event.target.value })}
                  />
                </label>
              )}
              {ollamaNote ? <p className="field-note">{ollamaNote}</p> : null}
            </div>
          ) : null}
        </fieldset>

        <fieldset disabled={locked}>
          <legend>Speed</legend>
          <label className="check-line">
            <input
              type="checkbox"
              checked={settings.device === "webgpu"}
              onChange={(event) => onChange({ device: event.target.checked ? "webgpu" : "wasm" })}
            />
            <span>Use the graphics chip when the browser allows it. If it fails, the CPU is used instead.</span>
          </label>
        </fieldset>

        <fieldset>
          <legend>Listening</legend>
          <label className="slider-line">
            <span>Pickup</span>
            <input
              type="range"
              min={2}
              max={7}
              step={0.1}
              value={settings.sensitivity}
              onChange={(event) => onChange({ sensitivity: Number(event.target.value) })}
            />
            <span className="slider-ends">
              <span>Quiet audio</span>
              <span>Ignore the room</span>
            </span>
          </label>
          <label className="slider-line">
            <span>Pause that ends a line</span>
            <input
              type="range"
              min={400}
              max={1200}
              step={50}
              value={settings.silenceMs}
              onChange={(event) => onChange({ silenceMs: Number(event.target.value) })}
            />
            <span className="slider-ends">
              <span>Short</span>
              <span>Long</span>
            </span>
          </label>
        </fieldset>

        <fieldset>
          <legend>Type size</legend>
          <div className="segmented" role="radiogroup" aria-label="Type size">
            {SCALES.map((scale) => (
              <button
                key={scale.label}
                type="button"
                role="radio"
                aria-checked={settings.textScale === scale.value}
                className={settings.textScale === scale.value ? "is-selected" : undefined}
                onClick={() => onChange({ textScale: scale.value })}
              >
                {scale.label}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
    </details>
  );
}
