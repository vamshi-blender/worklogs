import { z } from "zod";
import OpenAI from "openai";
import { corsHeaders, getAllowedOrigin } from "@/lib/http/cors";
import { streamDonnaRun } from "@/lib/agents/stream-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const chatRequestSchema = z
  .object({
    message: z.string().trim().min(1).max(20_000),
    conversationId: z.string().min(1).max(200).optional(),
  })
  .strict();

function unavailableReason(): string | null {
  if (!process.env.OPENAI_API_KEY) return "OPENAI_API_KEY is not configured.";
  // SECURITY: the ENABLE_PRODUCTION_CHAT production kill-switch was removed
  // here (dev-phase decision; see this commit). Restore it together with
  // authentication and rate limiting before locking production down again.
  return null;
}

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

  const unavailable = unavailableReason();
  if (unavailable) {
    return Response.json(
      { error: unavailable },
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

  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "A non-empty message is required." },
      { status: 400, headers: corsHeaders(origin) },
    );
  }

  let conversationId = parsed.data.conversationId;
  if (!conversationId) {
    try {
      const openai = new OpenAI();
      const conversation = await openai.conversations.create(
        {},
        { signal: request.signal },
      );
      conversationId = conversation.id;
    } catch (error) {
      console.error("Failed to create an OpenAI conversation", error);
      return Response.json(
        { error: "Donna could not start a conversation. Please try again." },
        { status: 502, headers: corsHeaders(origin) },
      );
    }
  }

  const stream = streamDonnaRun({
    input: parsed.data.message,
    conversationId,
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
