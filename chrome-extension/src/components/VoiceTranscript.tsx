import { useEffect, useRef } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { CableIcon } from "@hugeicons/core-free-icons";
import "./VoiceTranscript.css";

// Realtime voice turns — a flat timeline, not the request/response tree the
// text chat uses, since Realtime speech interleaves user speech, Donna's
// speech, and tool activity in one continuous stream. The future Realtime
// session layer appends to this list as transcription/tool events arrive;
// this component only renders whatever it is given.
export type VoiceTranscriptTurn =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "assistant"; text: string }
  | {
      id: string;
      kind: "tool";
      name: string;
      status: "running" | "completed" | "failed";
    };

interface VoiceTranscriptProps {
  turns: VoiceTranscriptTurn[];
}

function humanizeToolName(name: string): string {
  return name
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export default function VoiceTranscript({ turns }: VoiceTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [turns]);

  if (turns.length === 0) return null;

  return (
    <div className="voice-transcript">
      <div ref={scrollRef} className="voice-transcript-scroll" aria-live="polite">
        {turns.map((turn) => {
          if (turn.kind === "tool") {
            return (
              <div key={turn.id} className="voice-transcript-tool">
                <HugeiconsIcon icon={CableIcon} size={16} className="voice-transcript-tool-icon" />
                <span
                  className={`voice-transcript-tool-name voice-transcript-tool-name--${turn.status}${
                    turn.status === "running" ? " agent-work-shimmer" : ""
                  }`}
                >
                  {humanizeToolName(turn.name)}
                </span>
              </div>
            );
          }

          return (
            <p
              key={turn.id}
              className={`voice-transcript-line voice-transcript-line--${turn.kind}`}
            >
              {turn.text}
            </p>
          );
        })}
      </div>
    </div>
  );
}
