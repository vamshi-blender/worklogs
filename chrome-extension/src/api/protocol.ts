export type ClientToolName = "get_current_page_context";

export interface ClientToolRequest {
  runId: string;
  toolCallId: string;
  name: ClientToolName;
  arguments: Record<string, unknown>;
  title: string;
  description: string;
  requiresApproval: true;
}

export type ChatStreamEvent =
  | { type: "response.started"; requestId: string }
  | { type: "response.delta"; delta: string }
  | ({ type: "client_tool.request" } & ClientToolRequest)
  | { type: "response.paused"; runId: string }
  | {
      type: "response.completed";
      previousResponseId: string | null;
    }
  | {
      type: "response.error";
      code: string;
      message: string;
    };

const EVENT_TYPES = new Set([
  "response.started",
  "response.delta",
  "client_tool.request",
  "response.paused",
  "response.completed",
  "response.error",
]);

export function isChatStreamEvent(value: unknown): value is ChatStreamEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const type = (value as { type?: unknown }).type;
  return typeof type === "string" && EVENT_TYPES.has(type);
}
