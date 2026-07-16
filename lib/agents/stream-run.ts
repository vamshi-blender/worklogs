import {
  RunContext,
  RunState,
  run,
  type RunToolApprovalItem,
} from "@openai/agents";
import { donnaAgent, type DonnaRunContext } from "./donna";
import { savePendingRun } from "./pending-runs";
import {
  CONFIRM_LABELS,
  encodeEvent,
  type ChatStreamEvent,
  type ClientToolName,
  type ConfirmLabel,
  type ToolExecutor,
} from "./protocol";

const CLIENT_TOOL_NAMES = new Set<ClientToolName>([
  "get_current_page_context",
]);

interface StreamDonnaRunOptions {
  input: string | RunState<DonnaRunContext, typeof donnaAgent>;
  conversationId: string;
  signal: AbortSignal;
}

function asToolApprovalInterruption(
  interruption: RunToolApprovalItem,
): {
  toolCallId: string;
  name: string;
  executor: ToolExecutor;
  arguments: Record<string, unknown>;
} | null {
  const { rawItem } = interruption;
  if (rawItem.type !== "function_call") return null;

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
    name: rawItem.name,
    executor: CLIENT_TOOL_NAMES.has(rawItem.name as ClientToolName)
      ? "client"
      : "server",
    arguments: parsedArguments as Record<string, unknown>,
  };
}

// The model generates the approval texts as part of the tool call itself
// (see approvalPresentationFields in donna.ts). Fall back to generic copy if
// a field is missing or malformed so the approval card never renders empty.
function approvalPresentation(args: Record<string, unknown>): {
  title: string;
  description: string;
  confirmLabel: ConfirmLabel;
} {
  const title =
    typeof args.approvalTitle === "string" && args.approvalTitle.trim()
      ? args.approvalTitle.trim().slice(0, 80)
      : "Allow Donna to perform this action?";
  const description =
    typeof args.approvalDescription === "string" && args.approvalDescription.trim()
      ? args.approvalDescription.trim().slice(0, 240)
      : "Donna needs your approval before it can continue with this request.";
  const confirmLabel = CONFIRM_LABELS.includes(args.confirmLabel as ConfirmLabel)
    ? (args.confirmLabel as ConfirmLabel)
    : "Allow";

  return { title, description, confirmLabel };
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
  conversationId,
  signal,
}: StreamDonnaRunOptions): ReadableStream<Uint8Array> {
  const abortController = new AbortController();
  const abort = () => abortController.abort();
  signal.addEventListener("abort", abort, { once: true });

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatStreamEvent) => controller.enqueue(encodeEvent(event));
      send({
        type: "response.started",
        requestId: crypto.randomUUID(),
        conversationId,
      });

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
                conversationId,
              }),
        });

        let startsNewSegment = true;

        for await (const event of result) {
          if (
            event.type === "run_item_stream_event" &&
            event.name === "message_output_created"
          ) {
            startsNewSegment = true;
            continue;
          }

          if (
            event.type === "raw_model_stream_event" &&
            event.data.type === "output_text_delta"
          ) {
            if (!event.data.delta) continue;

            send({
              type: "response.delta",
              delta: event.data.delta,
              ...(startsNewSegment ? { startsNewSegment: true } : {}),
            });
            startsNewSegment = false;
          }
        }

        await result.completed;

        const approval = result.interruptions
          .map(asToolApprovalInterruption)
          .find((candidate) => candidate !== null);

        if (approval) {
          const runId = savePendingRun({
            serializedState: result.state.toString(),
            conversationId,
            toolCallId: approval.toolCallId,
            toolName: approval.name,
            executor: approval.executor,
          });

          send({
            type: "tool_approval.request",
            runId,
            toolCallId: approval.toolCallId,
            name: approval.name,
            executor: approval.executor,
            arguments: approval.arguments,
            ...approvalPresentation(approval.arguments),
            requiresApproval: true,
          });
          send({ type: "response.paused", runId });
          return;
        }

        if (result.interruptions.length > 0) {
          // A paused run we cannot surface must not masquerade as a completed
          // response — the user would wait on an answer that never arrives.
          send({
            type: "response.error",
            code: "unsupported_interruption",
            message: "Donna paused for an approval it could not display. Please try again.",
          });
          return;
        }

        send({
          type: "response.completed",
          conversationId,
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
