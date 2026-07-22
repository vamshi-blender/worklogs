import { useCallback, useEffect, useRef, useState } from "react";
import {
  RealtimeAgent,
  RealtimeSession,
  type RealtimeItem,
} from "@openai/agents/realtime";
import { createRealtimeClientSecret } from "../api/realtime";
import type { ChatMessage } from "../components/MessageList";
import type { VoiceStatus } from "../components/VoiceScreen";
import type { VoiceTranscriptTurn } from "../components/VoiceTranscript";
import { createVoiceTools } from "./voiceTools";

const BASE_INSTRUCTIONS = `You are Donna, a thoughtful personal AI assistant in a Chrome extension.

This is a spoken conversation. Respond naturally, warmly, and concisely. Prefer one or two short spoken paragraphs unless the user asks for detail. Never read raw JSON, internal identifiers, or tool arguments aloud.

Before the first tool call, give one very short progress update: ideally 3 to 7 words and never more than 10. State only the immediate action, such as "Checking your leave calendar." Between tool calls, speak again only when the next step changes meaningfully, using the same word limit. Do not restate the user's request, explain routine steps, mention tool names, or preview the answer. Keep these updates present but minimal. After tools finish, answer the user's question directly without narrating implementation details.

Use get_server_time for current date/time questions and to resolve relative dates before date-sensitive PMS queries. Use pms_lookup for live leave balances, existing leave days, and leave application statuses. Never invent tool results or claim a tool succeeded unless it returned successfully.

When the user clearly asks to end or stop the voice conversation, or says goodbye, first say one brief spoken goodbye and then call end_voice_session. After the tool returns, produce no additional speech. Do not call it for an ordinary pause, silence, or an ambiguous phrase.

The UI intentionally does not transcribe user audio yet. You can still understand and answer the user's speech normally.`;

const SESSION_CUE_PATHS = {
  start: "audio/stream-start.ogg",
  end: "audio/stream-end.ogg",
} as const;

// Orb amplitude tuning. RMS is boosted then soft-compressed so ordinary speech
// registers without loud peaks pinning the orb; the smoothing factors ease the
// value up quickly but let it fall gently, so the orb never jitters.
const ORB_GAIN = 8;
const ORB_COMPRESSION = 0.6;
const ORB_ATTACK = 0.35;
const ORB_RELEASE = 0.12;

function conversationContext(messages: ChatMessage[]): string {
  const turns = messages
    .filter((message) => message.content.trim())
    .slice(-10)
    .map(
      (message) =>
        `${message.role === "user" ? "User" : "Donna"}: ${message.content.trim()}`,
    );
  return turns.length
    ? `\n\nRecent text-chat context (continue from this context without repeating it):\n${turns.join("\n")}`
    : "";
}

function upsertAssistantTurn(
  turns: VoiceTranscriptTurn[],
  itemId: string,
  text: string,
): VoiceTranscriptTurn[] {
  const normalizedText = text.trim();
  if (!normalizedText) return turns;

  const index = turns.findIndex(
    (turn) => turn.kind === "assistant" && turn.id === itemId,
  );
  if (index === -1) {
    return [...turns, { id: itemId, kind: "assistant", text: normalizedText }];
  }
  if (turns[index].kind === "assistant" && turns[index].text === normalizedText) {
    return turns;
  }

  const next = [...turns];
  next[index] = { id: itemId, kind: "assistant", text: normalizedText };
  return next;
}

function historyToTurns(
  history: RealtimeItem[],
  partialAssistantTranscripts: ReadonlyMap<string, string>,
): VoiceTranscriptTurn[] {
  const turns: VoiceTranscriptTurn[] = [];
  const includedAssistantIds = new Set<string>();

  for (const item of history) {
    if (item.type === "message" && item.role === "user") {
      const hasAudio = item.content.some((content) => content.type === "input_audio");
      const text = item.content
        .filter((content) => content.type === "input_text")
        .map((content) => content.text)
        .join(" ")
        .trim();
      if (hasAudio || text) {
        turns.push({
          id: item.itemId,
          kind: "user",
          text: hasAudio ? "User Input" : text,
        });
      }
      continue;
    }

    if (item.type === "message" && item.role === "assistant") {
      const finalizedText = item.content
        .map((content) =>
          content.type === "output_audio" ? content.transcript ?? "" : content.text,
        )
        .join(" ")
        .trim();
      const text =
        item.status === "in_progress"
          ? partialAssistantTranscripts.get(item.itemId)?.trim() || finalizedText
          : finalizedText;
      includedAssistantIds.add(item.itemId);
      if (text) turns.push({ id: item.itemId, kind: "assistant", text });
      continue;
    }

    if (item.type === "function_call") {
      // This is an internal voice-session control, not meaningful progress for
      // the user. Keep it in the Realtime history while omitting it from the UI.
      if (item.name === "end_voice_session") continue;

      turns.push({
        id: item.itemId,
        kind: "tool",
        name: item.name,
        status:
          item.status === "completed"
            ? "completed"
            : item.status === "incomplete"
              ? "failed"
              : "running",
      });
    }
  }

  // Deltas can arrive just before the SDK adds the corresponding message to
  // its normalized history. Show those captions immediately instead of
  // waiting for the next history update.
  for (const [itemId, text] of partialAssistantTranscripts) {
    if (!includedAssistantIds.has(itemId) && text.trim()) {
      turns.push({ id: itemId, kind: "assistant", text: text.trim() });
    }
  }

  return turns;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "Donna could not continue the voice session. Please try again.";
}

export function useVoiceSession(
  messages: ChatMessage[],
  userName: string,
  onEndRequested: () => void,
) {
  const [status, setStatus] = useState<VoiceStatus>("preparing");
  const [turns, setTurns] = useState<VoiceTranscriptTurn[]>([]);
  const [muted, setMutedState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<RealtimeSession | null>(null);
  const connectAbortRef = useRef<AbortController | null>(null);
  const connectedRef = useRef(false);
  const cueRef = useRef<HTMLAudioElement | null>(null);
  const generationRef = useRef(0);
  const speakingRef = useRef(false);
  const activePlaybackResponseRef = useRef<string | null>(null);
  const activeToolCountRef = useRef(0);
  const partialAssistantTranscriptsRef = useRef(new Map<string, string>());
  const endRequestedRef = useRef(false);
  const endFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEndRequestedRef = useRef(onEndRequested);

  useEffect(() => {
    onEndRequestedRef.current = onEndRequested;
  }, [onEndRequested]);

  // Live orb amplitude: an AudioContext taps both the mic (outgoing) and
  // Donna's voice (incoming) off the WebRTC peer connection, and a rAF loop
  // writes a smoothed 0–1 level straight onto the orb element's CSS variable.
  // Kept out of React state so it never triggers a re-render per frame.
  const orbElementRef = useRef<HTMLElement | null>(null);
  const meterContextRef = useRef<AudioContext | null>(null);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  const smoothedLevelRef = useRef(0);

  const stopMeter = useCallback(() => {
    if (meterFrameRef.current !== null) {
      cancelAnimationFrame(meterFrameRef.current);
      meterFrameRef.current = null;
    }
    inputAnalyserRef.current = null;
    outputAnalyserRef.current = null;
    void meterContextRef.current?.close().catch(() => {});
    meterContextRef.current = null;
    smoothedLevelRef.current = 0;
    orbElementRef.current?.style.setProperty("--voice-amplitude", "0");
  }, []);

  const startMeter = useCallback((session: RealtimeSession) => {
    stopMeter();

    const AudioContextCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;

    // The WebRTC transport exposes the live peer connection; the mic is on a
    // sender track and Donna's voice on a receiver track. Build a stream per
    // side and feed each into its own analyser.
    const transport = session.transport as unknown as {
      connectionState?: { peerConnection?: RTCPeerConnection };
    };
    const pc = transport.connectionState?.peerConnection;
    if (!pc) return;

    const context = new AudioContextCtor();
    meterContextRef.current = context;

    const attachAnalyser = (track: MediaStreamTrack | undefined | null) => {
      if (!track) return null;
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      const stream = new MediaStream([track]);
      context.createMediaStreamSource(stream).connect(analyser);
      return analyser;
    };

    const micTrack = pc.getSenders().find((s) => s.track?.kind === "audio")?.track;
    const voiceTrack = pc.getReceivers().find((r) => r.track?.kind === "audio")?.track;
    inputAnalyserRef.current = attachAnalyser(micTrack);
    outputAnalyserRef.current = attachAnalyser(voiceTrack);

    const buffer = new Uint8Array(1024);
    const rms = (analyser: AnalyserNode | null) => {
      if (!analyser) return 0;
      analyser.getByteTimeDomainData(buffer);
      let sumSquares = 0;
      for (const value of buffer) {
        const deviation = (value - 128) / 128;
        sumSquares += deviation * deviation;
      }
      return Math.sqrt(sumSquares / buffer.length);
    };

    const tick = () => {
      meterFrameRef.current = requestAnimationFrame(tick);
      // Follow whoever holds the turn: Donna's output while she speaks, the
      // mic otherwise. Mute zeroes the mic side so a muted user is silent.
      const raw = speakingRef.current
        ? rms(outputAnalyserRef.current)
        : sessionRef.current?.transport.muted
          ? 0
          : rms(inputAnalyserRef.current);
      const target = Math.min(1, Math.pow(raw * ORB_GAIN, ORB_COMPRESSION));
      const factor = target > smoothedLevelRef.current ? ORB_ATTACK : ORB_RELEASE;
      smoothedLevelRef.current += (target - smoothedLevelRef.current) * factor;
      orbElementRef.current?.style.setProperty(
        "--voice-amplitude",
        smoothedLevelRef.current.toFixed(3),
      );
    };
    meterFrameRef.current = requestAnimationFrame(tick);
  }, [stopMeter]);

  const setOrbElement = useCallback((element: HTMLElement | null) => {
    orbElementRef.current = element;
    element?.style.setProperty("--voice-amplitude", smoothedLevelRef.current.toFixed(3));
  }, []);

  const playSessionCue = useCallback(
    (cue: keyof typeof SESSION_CUE_PATHS, onComplete?: () => void) => {
      cueRef.current?.pause();

      const audio = new Audio(chrome.runtime.getURL(SESSION_CUE_PATHS[cue]));
      cueRef.current = audio;

      const finishCue = () => {
        if (cueRef.current !== audio) return;
        cueRef.current = null;
        onComplete?.();
      };
      audio.addEventListener("ended", finishCue, { once: true });
      audio.addEventListener("error", finishCue, { once: true });
      void audio.play().catch(finishCue);
    },
    [],
  );

  const closeSession = useCallback(() => {
    generationRef.current += 1;
    connectAbortRef.current?.abort();
    connectAbortRef.current = null;
    stopMeter();
    sessionRef.current?.close();
    sessionRef.current = null;
    connectedRef.current = false;
    speakingRef.current = false;
    activePlaybackResponseRef.current = null;
    activeToolCountRef.current = 0;
    partialAssistantTranscriptsRef.current.clear();
    endRequestedRef.current = false;
    if (endFallbackTimerRef.current !== null) {
      clearTimeout(endFallbackTimerRef.current);
      endFallbackTimerRef.current = null;
    }
    setMutedState(false);
  }, [stopMeter]);

  const end = useCallback(() => {
    const wasConnected = connectedRef.current;
    closeSession();
    if (wasConnected) playSessionCue("end");
  }, [closeSession, playSessionCue]);

  const start = useCallback(async () => {
    closeSession();
    const generation = generationRef.current;
    const abortController = new AbortController();
    connectAbortRef.current = abortController;
    setStatus("preparing");
    setTurns([]);
    setError(null);

    try {
      const clientSecret = await createRealtimeClientSecret(abortController.signal);
      if (generation !== generationRef.current) return;

      const finishVoiceEndIfReady = () => {
        if (
          !endRequestedRef.current ||
          speakingRef.current ||
          activeToolCountRef.current > 0
        ) {
          return;
        }

        endRequestedRef.current = false;
        if (endFallbackTimerRef.current !== null) {
          clearTimeout(endFallbackTimerRef.current);
          endFallbackTimerRef.current = null;
        }
        queueMicrotask(() => onEndRequestedRef.current());
      };

      const agent = new RealtimeAgent({
        name: "Donna",
        voice: "marin",
        instructions: BASE_INSTRUCTIONS + conversationContext(messages),
        tools: createVoiceTools({
          requestEnd: () => {
            endRequestedRef.current = true;
            if (endFallbackTimerRef.current !== null) {
              clearTimeout(endFallbackTimerRef.current);
            }
            // Playback-buffer events are the normal exit path. This fallback
            // prevents a stale SDK speaking state or missing buffer event from
            // trapping the user on the voice screen after the tool succeeds.
            endFallbackTimerRef.current = setTimeout(() => {
              if (!endRequestedRef.current) return;
              endRequestedRef.current = false;
              endFallbackTimerRef.current = null;
              onEndRequestedRef.current();
            }, 5_000);
          },
        }),
      });
      const session = new RealtimeSession(agent, {
        model: "gpt-realtime-2.1",
        transport: "webrtc",
        config: {
          outputModalities: ["audio"],
          audio: {
            input: {
              noiseReduction: { type: "near_field" },
              turnDetection: {
                type: "semantic_vad",
                eagerness: "auto",
                createResponse: true,
                interruptResponse: true,
              },
            },
            output: { voice: "marin" },
          },
        },
      });
      sessionRef.current = session;

      const markSpeaking = (responseId?: string) => {
        activePlaybackResponseRef.current = responseId ?? null;
        speakingRef.current = true;
        setStatus("speaking");
      };
      const markPlaybackComplete = (responseId?: string) => {
        const activeResponseId = activePlaybackResponseRef.current;
        if (
          !endRequestedRef.current &&
          responseId &&
          activeResponseId &&
          responseId !== activeResponseId
        ) {
          return;
        }

        activePlaybackResponseRef.current = null;
        speakingRef.current = false;
        setStatus(activeToolCountRef.current > 0 ? "working" : "listening");
      };
      const markInterrupted = () => {
        activePlaybackResponseRef.current = null;
        speakingRef.current = false;
        setStatus("listening");
      };

      session.on("history_updated", (history) => {
        const partialTranscripts = partialAssistantTranscriptsRef.current;
        setTurns(historyToTurns(history, partialTranscripts));

        for (const item of history) {
          if (
            item.type === "message" &&
            item.role === "assistant" &&
            item.status !== "in_progress"
          ) {
            partialTranscripts.delete(item.itemId);
          }
        }
      });
      session.on("agent_start", () => {
        if (!speakingRef.current && activeToolCountRef.current === 0) {
          setStatus("thinking");
        }
      });
      session.on("agent_end", () => {
        if (!speakingRef.current && activeToolCountRef.current === 0) {
          setStatus("listening");
        }
        finishVoiceEndIfReady();
      });
      session.on("agent_tool_start", () => {
        activeToolCountRef.current += 1;
        if (!speakingRef.current) setStatus("working");
      });
      session.on("agent_tool_end", () => {
        activeToolCountRef.current = Math.max(0, activeToolCountRef.current - 1);
        setStatus(speakingRef.current ? "speaking" : "thinking");
        finishVoiceEndIfReady();
      });
      // For WebRTC, playback can continue after response generation is done.
      // Use the output buffer lifecycle: `stopped` means the buffer is fully
      // drained; `cleared` or input speech while speaking means interruption.
      session.on("transport_event", (event) => {
        if (event.type === "response.output_audio_transcript.delta") {
          const partialTranscripts = partialAssistantTranscriptsRef.current;
          const transcript = (partialTranscripts.get(event.item_id) ?? "") + event.delta;
          partialTranscripts.set(event.item_id, transcript);
          setTurns((current) => upsertAssistantTurn(current, event.item_id, transcript));
          return;
        }
        if (event.type === "response.output_audio_transcript.done") {
          partialAssistantTranscriptsRef.current.set(event.item_id, event.transcript);
          setTurns((current) =>
            upsertAssistantTurn(current, event.item_id, event.transcript),
          );
          return;
        }
        if (event.type === "output_audio_buffer.started") {
          markSpeaking(typeof event.response_id === "string" ? event.response_id : undefined);
          return;
        }
        if (event.type === "output_audio_buffer.stopped") {
          markPlaybackComplete(
            typeof event.response_id === "string" ? event.response_id : undefined,
          );
          finishVoiceEndIfReady();
          return;
        }
        if (event.type === "output_audio_buffer.cleared") {
          markInterrupted();
          finishVoiceEndIfReady();
          return;
        }
        if (event.type === "input_audio_buffer.speech_started" && speakingRef.current) {
          markInterrupted();
        }
      });
      session.on("audio_interrupted", markInterrupted);
      session.on("error", ({ error: sessionError }) => {
        setError(errorMessage(sessionError));
        setStatus("error");
      });

      await session.connect({ apiKey: clientSecret });
      if (generation !== generationRef.current) {
        session.close();
        return;
      }
      connectAbortRef.current = null;
      connectedRef.current = true;
      startMeter(session);
      playSessionCue("start", () => {
        if (generation !== generationRef.current || !connectedRef.current) return;

        const requestResponse = session.transport.requestResponse;
        if (!requestResponse) {
          setStatus("listening");
          return;
        }

        setStatus("thinking");
        requestResponse.call(session.transport, {
          instructions: userName.trim()
            ? `Briefly greet the user by their first name, ${userName.trim()}, and ask how you can help. Use one short sentence. Do not call tools or mention these instructions.`
            : "Briefly greet the user and ask how you can help. Use one short sentence. Do not call tools or mention these instructions.",
        });
      });
    } catch (caught) {
      if (abortController.signal.aborted) return;
      sessionRef.current?.close();
      sessionRef.current = null;
      setError(errorMessage(caught));
      setStatus("error");
    }
  }, [closeSession, messages, playSessionCue, startMeter, userName]);

  const setMuted = useCallback((nextMuted: boolean) => {
    const session = sessionRef.current;
    if (!session) return;
    session.mute(nextMuted);
    setMutedState(nextMuted);
  }, []);

  useEffect(
    () => () => {
      closeSession();
      cueRef.current?.pause();
      cueRef.current = null;
    },
    [closeSession],
  );

  return { status, turns, muted, error, start, end, setMuted, setOrbElement };
}
