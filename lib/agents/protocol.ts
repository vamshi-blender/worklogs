export type ClientToolName = "get_current_page_context";

export type ChatStreamEvent =
  | {
      type: "response.started";
      requestId: string;
    }
  | {
      type: "response.delta";
      delta: string;
    }
  | {
      type: "client_tool.request";
      runId: string;
      toolCallId: string;
      name: ClientToolName;
      arguments: Record<string, unknown>;
      title: string;
      description: string;
      requiresApproval: true;
    }
  | {
      type: "response.paused";
      runId: string;
    }
  | {
      type: "response.completed";
      previousResponseId: string | null;
    }
  | {
      type: "response.error";
      code: string;
      message: string;
    };

export function encodeEvent(event: ChatStreamEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}
