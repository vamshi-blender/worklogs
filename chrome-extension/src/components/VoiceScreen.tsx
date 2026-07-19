import { useEffect, useRef } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  Mic01Icon,
  MicOff01Icon,
  ReloadIcon,
} from "@hugeicons/core-free-icons";
import VoiceTranscript, { type VoiceTranscriptTurn } from "./VoiceTranscript";
import "./VoiceScreen.css";

// Session-driven status. The Realtime controller owns these transitions;
// this screen only renders them and forwards user actions.
export type VoiceStatus =
  | "preparing"
  | "listening"
  | "thinking"
  | "working"
  | "speaking"
  | "error";

const STATUS_LABELS: Record<VoiceStatus, string> = {
  preparing: "Getting things ready...",
  listening: "Listening",
  thinking: "Donna is thinking",
  working: "Donna is checking",
  speaking: "Donna is speaking",
  error: "Voice session disconnected",
};

interface VoiceScreenProps {
  status: VoiceStatus;
  muted: boolean;
  closing: boolean;
  onClose: () => void;
  onExitComplete: () => void;
  onMutedChange: (muted: boolean) => void;
  turns?: VoiceTranscriptTurn[];
  error?: string | null;
  onRetry?: () => void;
  orbRef?: (element: HTMLElement | null) => void;
}

export default function VoiceScreen({
  status,
  muted,
  closing,
  onClose,
  onExitComplete,
  onMutedChange,
  turns = [],
  error,
  onRetry,
  orbRef,
}: VoiceScreenProps) {
  const micButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    micButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function handleToggleMute() {
    onMutedChange(!muted);
  }

  const statusLabel =
    muted && status !== "error" ? "Mic muted" : STATUS_LABELS[status];

  return (
    <div
      className={`voice-screen${closing ? " voice-screen--closing" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Voice conversation"
    >
      <div
        className="voice-card"
        data-status={muted ? "muted" : status}
        onAnimationEnd={(event) => {
          if (closing && event.target === event.currentTarget) onExitComplete();
        }}
      >
        <VoiceTranscript turns={turns} />
        <div className="voice-glow-stage" aria-hidden="true">
          <div className="voice-glow" ref={orbRef} />
        </div>
        <div className="voice-foot">
          <p className="voice-status" aria-live="polite">
            {statusLabel}
          </p>
          {status === "error" && error && (
            <p className="voice-error" role="alert">
              {error}
            </p>
          )}
          <div className="voice-actions">
            {status === "error" ? (
              <button
                ref={micButtonRef}
                type="button"
                className="voice-action-btn app-tooltip"
                aria-label="Retry voice conversation"
                data-tooltip="Retry"
                onClick={onRetry}
              >
                <HugeiconsIcon icon={ReloadIcon} size={24} />
              </button>
            ) : (
              <button
                ref={micButtonRef}
                type="button"
                className="voice-action-btn app-tooltip"
                aria-label={muted ? "Unmute microphone" : "Mute microphone"}
                aria-pressed={muted}
                data-tooltip={muted ? "Unmute" : "Mute"}
                disabled={status === "preparing"}
                onClick={handleToggleMute}
              >
                <HugeiconsIcon icon={muted ? MicOff01Icon : Mic01Icon} size={24} />
              </button>
            )}
            <button
              type="button"
              className="voice-action-btn voice-action-btn--soft app-tooltip"
              aria-label="End voice conversation"
              data-tooltip="End"
              onClick={onClose}
            >
              <HugeiconsIcon icon={Cancel01Icon} size={24} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
