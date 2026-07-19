import { z } from "zod";
import { getServerTimeResult } from "@/lib/agents/server-time";
import { corsHeaders, getAllowedOrigin } from "@/lib/http/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const toolRequestSchema = z
  .object({
    name: z.literal("get_server_time"),
    arguments: z.object({ timeZone: z.string().nullable() }).strict(),
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

  const headers = { ...corsHeaders(origin), "Cache-Control": "no-store" };
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON." },
      { status: 400, headers },
    );
  }

  const parsed = toolRequestSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json(
      { error: "The Realtime tool request is invalid." },
      { status: 400, headers },
    );
  }

  return Response.json(
    { data: getServerTimeResult(parsed.data.arguments) },
    { headers },
  );
}
