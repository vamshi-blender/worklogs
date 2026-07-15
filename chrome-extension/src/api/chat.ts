import { getBackendUrl } from "./backend";
import { isChatStreamEvent, type ChatStreamEvent } from "./protocol";

interface StreamRequestOptions {
  path: "/api/chat" | "/api/chat/resume";
  body: Record<string, unknown>;
  signal: AbortSignal;
  onEvent: (event: ChatStreamEvent) => void;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string") return body.error;
  } catch {
    // Fall back to a status-based message below.
  }
  return `Request failed with status ${response.status}.`;
}

async function streamRequest({
  path,
  body,
  signal,
  onEvent,
}: StreamRequestOptions): Promise<void> {
  const backendUrl = await getBackendUrl();
  const response = await fetch(`${backendUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) throw new Error(await readError(response));
  if (!response.body) throw new Error("The backend returned no response stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      const event: unknown = JSON.parse(line);
      if (!isChatStreamEvent(event)) {
        throw new Error("The backend sent an unknown stream event.");
      }
      onEvent(event);
    }

    if (done) break;
  }

  if (buffer.trim()) {
    const event: unknown = JSON.parse(buffer);
    if (!isChatStreamEvent(event)) {
      throw new Error("The backend sent an unknown stream event.");
    }
    onEvent(event);
  }
}

export function streamChat(options: {
  message: string;
  previousResponseId?: string;
  signal: AbortSignal;
  onEvent: (event: ChatStreamEvent) => void;
}) {
  return streamRequest({
    path: "/api/chat",
    body: {
      message: options.message,
      ...(options.previousResponseId
        ? { previousResponseId: options.previousResponseId }
        : {}),
    },
    signal: options.signal,
    onEvent: options.onEvent,
  });
}

export function resumeChat(options: {
  runId: string;
  toolCallId: string;
  approved: boolean;
  result?: unknown;
  error?: string;
  signal: AbortSignal;
  onEvent: (event: ChatStreamEvent) => void;
}) {
  return streamRequest({
    path: "/api/chat/resume",
    body: {
      runId: options.runId,
      toolCallId: options.toolCallId,
      approved: options.approved,
      ...(options.result === undefined ? {} : { result: options.result }),
      ...(options.error ? { error: options.error } : {}),
    },
    signal: options.signal,
    onEvent: options.onEvent,
  });
}
