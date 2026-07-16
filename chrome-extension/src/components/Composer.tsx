import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Mic01Icon, ArrowUp02Icon, Loading03Icon } from "@hugeicons/core-free-icons";
import { transcribeAudio } from "../api/transcriptions";
import "./Composer.css";

const MAX_TEXTAREA_HEIGHT = 200;
const PREFERRED_AUDIO_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

type DictationStatus = "idle" | "preparing" | "recording" | "transcribing";

interface ComposerProps {
  onSend?: (message: string) => void;
  busy?: boolean;
  disabled?: boolean;
  onCancel?: () => void;
}

export default function Composer({ onSend, busy = false, disabled = false, onCancel }: ComposerProps) {
  const [value, setValue] = useState("");
  const [dictationStatus, setDictationStatus] = useState<DictationStatus>("idle");
  const [dictationError, setDictationError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const transcriptionAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      transcriptionAbortRef.current?.abort();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function resize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value);
    resize(e.target);
  }

  function handleSend() {
    if (busy) {
      onCancel?.();
      return;
    }
    if (dictationStatus !== "idle") return;
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend?.(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function stopMediaStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function finishDictation(audio: Blob) {
    if (!audio.size) {
      setDictationStatus("idle");
      setDictationError("No audio was captured. Please try again.");
      return;
    }

    const controller = new AbortController();
    transcriptionAbortRef.current = controller;
    setDictationStatus("transcribing");

    try {
      const transcript = await transcribeAudio(audio, controller.signal);
      if (!transcript) throw new Error("No speech was detected.");

      setValue((current) => `${current}${current && !/\s$/.test(current) ? " " : ""}${transcript}`);
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          resize(textareaRef.current);
          textareaRef.current.focus();
        }
      });
      setDictationError(null);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setDictationError(error instanceof Error ? error.message : "Could not transcribe the recording.");
      }
    } finally {
      if (transcriptionAbortRef.current === controller) transcriptionAbortRef.current = null;
      setDictationStatus("idle");
    }
  }

  async function startDictation() {
    setDictationStatus("preparing");
    setDictationError(null);

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setDictationStatus("idle");
      setDictationError("Microphone recording is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const mimeType = PREFERRED_AUDIO_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        recorder.onstop = null;
        chunksRef.current = [];
        recorderRef.current = null;
        setDictationError("Microphone recording failed. Please try again.");
        setDictationStatus("idle");
        stopMediaStream();
      };
      recorder.onstop = () => {
        const audio = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];
        recorderRef.current = null;
        stopMediaStream();
        void finishDictation(audio);
      };
      recorder.start();
      setDictationStatus("recording");
    } catch (error) {
      stopMediaStream();
      setDictationStatus("idle");
      setDictationError(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Microphone access was denied. Allow it in Chrome and try again."
          : "Donna could not access the microphone.",
      );
    }
  }

  function handleDictation() {
    if (dictationStatus === "recording") {
      setDictationStatus("transcribing");
      recorderRef.current?.stop();
      return;
    }
    if (dictationStatus === "idle" && !busy && !disabled) void startDictation();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const canSend = value.trim().length > 0;
  const micIsLoading = dictationStatus === "preparing" || dictationStatus === "transcribing";
  const micIsRed = dictationStatus === "recording" || dictationStatus === "transcribing";
  const micLabel =
    dictationStatus === "preparing"
      ? "Starting Mic"
      : dictationStatus === "recording"
        ? "Stop Dictation"
        : dictationStatus === "transcribing"
          ? "Processing"
          : "Dictate";

  return (
    <div className="composer">
      <textarea
        ref={textareaRef}
        className="composer-textarea"
        placeholder="Ask anything"
        rows={1}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      />

      <div className="composer-toolbar">
        <button
          type="button"
          className="composer-icon-btn composer-tooltip"
          aria-label="Attach"
          data-tooltip="Attach"
        >
          <HugeiconsIcon icon={Add01Icon} size={20} />
        </button>

        <div className="composer-trailing">
          <button
            type="button"
            className={`composer-icon-btn composer-tooltip${micIsRed ? " composer-icon-btn--recording" : ""}${micIsLoading ? " composer-icon-btn--loading" : ""}`}
            aria-label={dictationError && dictationStatus === "idle" ? `${micLabel}. ${dictationError}` : micLabel}
            aria-pressed={dictationStatus === "recording"}
            aria-busy={micIsLoading}
            data-tooltip={micLabel}
            disabled={disabled || busy || micIsLoading}
            onClick={handleDictation}
          >
            {micIsLoading ? (
              <span className="composer-mic-loading-icon" aria-hidden="true">
                <HugeiconsIcon icon={Loading03Icon} size={20} />
              </span>
            ) : (
              <HugeiconsIcon icon={Mic01Icon} size={20} />
            )}
          </button>
          <button
            type="button"
            className={`composer-send-btn composer-tooltip${busy ? " composer-send-btn--stop" : ""}`}
            aria-label={busy ? "Stop response" : "Send prompt"}
            data-tooltip={busy ? "Stop response" : "Send"}
            disabled={!busy && (!canSend || disabled || dictationStatus !== "idle")}
            onClick={handleSend}
          >
            {busy ? (
              <span className="composer-stop-glyph" aria-hidden="true" />
            ) : (
              <HugeiconsIcon icon={ArrowUp02Icon} size={18} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
