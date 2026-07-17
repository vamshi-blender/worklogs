export type ClientToolName = "get_current_page_context";

export type ToolExecutor = "client" | "server";

export type AssistantPhase = "commentary" | "final_answer";

export interface ToolApprovalRequest {
  runId: string;
  toolCallId: string;
  name: string;
  executor: ToolExecutor;
  arguments: Record<string, unknown>;
  title: string;
  description: string;
  confirmLabel: string;
  requiresApproval: true;
}

export type ChatStreamEvent =
  | { type: "response.started"; requestId: string; conversationId: string }
  | {
      type: "response.delta";
      delta: string;
      itemId: string;
      phase: AssistantPhase;
      startsNewSegment?: true;
    }
  | {
      type: "tool.started";
      callId: string;
      name: string;
      executor: ToolExecutor;
      arguments: Record<string, unknown>;
      startedAt: number;
    }
  | {
      type: "tool.completed";
      callId: string;
      output?: string;
      completedAt: number;
    }
  | ({ type: "tool_approval.request" } & ToolApprovalRequest)
  | { type: "response.paused"; runId: string; pausedAt: number }
  | {
      type: "response.completed";
      conversationId: string;
    }
  | {
      type: "response.error";
      code: string;
      message: string;
    };

const EVENT_TYPES = new Set([
  "response.started",
  "response.delta",
  "tool.started",
  "tool.completed",
  "tool_approval.request",
  "response.paused",
  "response.completed",
  "response.error",
]);

export function isChatStreamEvent(value: unknown): value is ChatStreamEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const type = (value as { type?: unknown }).type;
  return typeof type === "string" && EVENT_TYPES.has(type);
}
