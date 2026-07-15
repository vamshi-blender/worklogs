import OpenAI from "openai";
import { z } from "zod";
import { corsHeaders, getAllowedOrigin } from "@/lib/http/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const deleteConversationSchema = z
  .object({
    conversationId: z.string().min(1).max(200),
  })
  .strict();

function unavailableReason(): string | null {
  if (!process.env.OPENAI_API_KEY) return "OPENAI_API_KEY is not configured.";
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ENABLE_PRODUCTION_CHAT !== "true"
  ) {
    return "Production chat is disabled.";
  }
  return null;
}

export function OPTIONS(request: Request) {
  const origin = getAllowedOrigin(request);
  if (origin === null) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export async function DELETE(request: Request) {
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

  const parsed = deleteConversationSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "A valid conversation ID is required." },
      { status: 400, headers: corsHeaders(origin) },
    );
  }

  try {
    const openai = new OpenAI();
    await openai.conversations.delete(parsed.data.conversationId, {
      signal: request.signal,
    });
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  } catch (error) {
    if (error instanceof OpenAI.APIError && error.status === 404) {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    console.error("Failed to delete an OpenAI conversation", error);
    return Response.json(
      { error: "Donna could not delete that conversation. Please try again." },
      { status: 502, headers: corsHeaders(origin) },
    );
  }
}
