import { z } from "zod";
import OpenAI from "openai";
import { after } from "next/server";
import { corsHeaders, getAllowedOrigin } from "@/lib/http/cors";
import { streamDonnaRun } from "@/lib/agents/stream-run";
import {
  loadRelevantUserMemories,
  processCompletedDonnaTurn,
} from "@/lib/memory/context";
import type { DonnaRunSummary } from "@/lib/memory/types";
import {
  authenticateDonnaRequest,
  PmsAuthenticationError,
} from "@/lib/pms/server-auth";

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
  if (!process.env.SUPABASE_URL) return "SUPABASE_URL is not configured.";
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return "SUPABASE_SERVICE_ROLE_KEY is not configured.";
  }
  if (!process.env.MEM0_API_KEY) return "MEM0_API_KEY is not configured.";
  // SECURITY: PMS authentication now protects chat. Add rate limiting before
  // opening the production endpoint to a larger user population.
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

  let identity;
  try {
    identity = await authenticateDonnaRequest(request);
  } catch (error) {
    if (error instanceof PmsAuthenticationError) {
      return Response.json(
        { error: error.message },
        { status: error.status, headers: corsHeaders(origin) },
      );
    }
    console.error("Failed to resolve the authenticated Donna identity", error);
    return Response.json(
      { error: "Donna could not identify the current user. Please try again." },
      { status: 502, headers: corsHeaders(origin) },
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

  const relevantMemories = await loadRelevantUserMemories(
    identity,
    parsed.data.message,
  );
  const context = {
    clientToolResults: {},
    identity,
    relevantMemories,
    pmsObservations: [],
    resolvedPmsValues: [],
  };
  const memoryCapture = {
    tenantId: identity.tenantId,
    userId: String(identity.identityId),
    conversationId,
    userMessage: parsed.data.message,
    turnId: crypto.randomUUID(),
  };

  type RunSettlement = {
    outcome: "completed" | "paused" | "failed";
    summary: DonnaRunSummary;
  };
  let settleRun!: (settlement: RunSettlement) => void;
  const settledRun = new Promise<RunSettlement>(
    (resolve) => {
      settleRun = resolve;
    },
  );
  after(async () => {
    const settlement = await settledRun;
    if (settlement.outcome === "completed") {
      await processCompletedDonnaTurn({
        identity,
        capture: memoryCapture,
        summary: settlement.summary,
      });
    }
  });

  const stream = streamDonnaRun({
    input: parsed.data.message,
    conversationId,
    signal: request.signal,
    context,
    memoryCapture,
    onSettled: (outcome, summary) => settleRun({ outcome, summary }),
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
