export type ClientToolName = "get_current_page_context";

export type ToolExecutor = "client" | "server";

export const CONFIRM_LABELS = [
  "Allow",
  "Run",
  "Send",
  "Update",
  "Confirm",
  "Approve",
] as const;

export type ConfirmLabel = (typeof CONFIRM_LABELS)[number];

export type ChatStreamEvent =
  | {
      type: "response.started";
      requestId: string;
      conversationId: string;
    }
  | {
      type: "response.delta";
      delta: string;
      startsNewSegment?: true;
    }
  | {
      type: "tool_approval.request";
      runId: string;
      toolCallId: string;
      name: string;
      executor: ToolExecutor;
      arguments: Record<string, unknown>;
      title: string;
      description: string;
      confirmLabel: ConfirmLabel;
      requiresApproval: true;
    }
  | {
      type: "response.paused";
      runId: string;
    }
  | {
      type: "response.completed";
      conversationId: string;
    }
  | {
      type: "response.error";
      code: string;
      message: string;
    };

export function encodeEvent(event: ChatStreamEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}
