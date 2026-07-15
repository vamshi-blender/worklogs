import {
  RunContext,
  RunState,
  run,
  type RunToolApprovalItem,
} from "@openai/agents";
import { donnaAgent, type DonnaRunContext } from "./donna";
import { savePendingRun } from "./pending-runs";
import {
  encodeEvent,
  type ChatStreamEvent,
  type ClientToolName,
} from "./protocol";

const CLIENT_TOOL_NAMES = new Set<ClientToolName>([
  "get_current_page_context",
]);

interface StreamDonnaRunOptions {
  input: string | RunState<DonnaRunContext, typeof donnaAgent>;
  previousResponseId?: string;
  signal: AbortSignal;
}

function asClientToolInterruption(
  interruption: RunToolApprovalItem,
): {
  toolCallId: string;
  name: ClientToolName;
  arguments: Record<string, unknown>;
} | null {
  const { rawItem } = interruption;
  if (rawItem.type !== "function_call") return null;
  if (!CLIENT_TOOL_NAMES.has(rawItem.name as ClientToolName)) return null;

  let parsedArguments: unknown;
  try {
    parsedArguments = JSON.parse(rawItem.arguments);
  } catch {
    return null;
  }

  if (
    !parsedArguments ||
    typeof parsedArguments !== "object" ||
    Array.isArray(parsedArguments)
  ) {
    return null;
  }

  return {
    toolCallId: rawItem.callId,
    name: rawItem.name as ClientToolName,
    arguments: parsedArguments as Record<string, unknown>,
  };
}

function publicError(error: unknown): ChatStreamEvent {
  if (error instanceof Error && error.name === "AbortError") {
    return {
      type: "response.error",
      code: "cancelled",
      message: "Response stopped.",
    };
  }

  return {
    type: "response.error",
    code: "agent_error",
    message: "Donna could not complete that response. Please try again.",
  };
}

export function streamDonnaRun({
  input,
  previousResponseId,
  signal,
}: StreamDonnaRunOptions): ReadableStream<Uint8Array> {
  const abortController = new AbortController();
  const abort = () => abortController.abort();
  signal.addEventListener("abort", abort, { once: true });

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatStreamEvent) => controller.enqueue(encodeEvent(event));
      send({ type: "response.started", requestId: crypto.randomUUID() });

      try {
        const isResumedRun = input instanceof RunState;
        const result = await run(donnaAgent, input, {
          stream: true,
          signal: abortController.signal,
          maxTurns: 8,
          ...(isResumedRun
            ? {}
            : {
                context: { clientToolResults: {} },
                previousResponseId,
              }),
        });

        for await (const event of result) {
          if (
            event.type === "raw_model_stream_event" &&
            event.data.type === "output_text_delta"
          ) {
            send({ type: "response.delta", delta: event.data.delta });
          }
        }

        await result.completed;

        const interruption = result.interruptions
          .map((item) => ({ item, clientTool: asClientToolInterruption(item) }))
          .find(({ clientTool }) => clientTool !== null);

        if (interruption?.clientTool) {
          const runId = savePendingRun({
            serializedState: result.state.toString(),
            toolCallId: interruption.clientTool.toolCallId,
            toolName: interruption.clientTool.name,
          });

          send({
            type: "client_tool.request",
            runId,
            toolCallId: interruption.clientTool.toolCallId,
            name: interruption.clientTool.name,
            arguments: interruption.clientTool.arguments,
            title: "Allow Donna to read this page?",
            description:
              "Shares the active tab's URL, title, selected text, and a limited amount of visible page text for this request.",
            requiresApproval: true,
          });
          send({ type: "response.paused", runId });
          return;
        }

        send({
          type: "response.completed",
          previousResponseId: result.lastResponseId ?? null,
        });
      } catch (error) {
        if (!abortController.signal.aborted) {
          console.error("Donna agent run failed", error);
          send(publicError(error));
        }
      } finally {
        signal.removeEventListener("abort", abort);
        controller.close();
      }
    },
    cancel() {
      abortController.abort();
    },
  });
}

export async function restoreRunState(
  serializedState: string,
  context: DonnaRunContext,
) {
  return RunState.fromStringWithContext(
    donnaAgent,
    serializedState,
    new RunContext(context),
    { contextStrategy: "replace" },
  );
}
