import { z } from "zod";
import { corsHeaders, getAllowedOrigin } from "@/lib/http/cors";
import type { ClientToolResult } from "@/lib/agents/donna";
import { takePendingRun } from "@/lib/agents/pending-runs";
import { restoreRunState, streamDonnaRun } from "@/lib/agents/stream-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resumeRequestSchema = z
  .object({
    runId: z.string().uuid(),
    toolCallId: z.string().min(1).max(300),
    approved: z.boolean(),
    result: z.unknown().optional(),
    error: z.string().max(1_000).optional(),
  })
  .strict();

export function OPTIONS(request: Request) {
  const origin = getAllowedOrigin(request);
  if (origin === null) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(request: Request) {
  const origin = getAllowedOrigin(request);
  if (origin === null) {
    return Response.json({ error: "Origin is not allowed." }, { status: 403 });
  }

  if (
    process.env.NODE_ENV === "production" &&
    process.env.ENABLE_PRODUCTION_CHAT !== "true"
  ) {
    return Response.json(
      { error: "Production chat is disabled." },
      { status: 503, headers: corsHeaders(origin) },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON." },
      { status: 400, headers: corsHeaders(origin) },
    );
  }

  const parsed = resumeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid resume request." },
      { status: 400, headers: corsHeaders(origin) },
    );
  }

  const pending = takePendingRun(parsed.data.runId);
  if (!pending || pending.toolCallId !== parsed.data.toolCallId) {
    return Response.json(
      { error: "This tool request expired or was already handled." },
      { status: 410, headers: corsHeaders(origin) },
    );
  }

  const clientResult: ClientToolResult = parsed.data.approved
    ? { ok: true, data: parsed.data.result }
    : {
        ok: false,
        error: parsed.data.error ?? "The user declined page access.",
      };

  if (JSON.stringify(clientResult).length > 60_000) {
    return Response.json(
      { error: "The browser tool result is too large." },
      { status: 413, headers: corsHeaders(origin) },
    );
  }

  const state = await restoreRunState(pending.serializedState, {
    clientToolResults: { [pending.toolCallId]: clientResult },
  });
  const interruption = state
    .getInterruptions()
    .find(
      (item) =>
        item.rawItem.type === "function_call" &&
        item.rawItem.callId === pending.toolCallId &&
        item.name === pending.toolName,
    );

  if (!interruption) {
    return Response.json(
      { error: "The saved tool request is invalid." },
      { status: 409, headers: corsHeaders(origin) },
    );
  }

  if (parsed.data.approved) {
    state.approve(interruption);
  } else {
    state.reject(interruption, {
      message: parsed.data.error ?? "The user declined page access.",
    });
  }

  const stream = streamDonnaRun({
    input: state,
    conversationId: pending.conversationId,
    signal: request.signal,
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
      "X-Accel-Buffering": "no",
    },
  });
}
