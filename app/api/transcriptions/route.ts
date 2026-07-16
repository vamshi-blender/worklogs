import OpenAI from "openai";
import { corsHeaders, getAllowedOrigin } from "@/lib/http/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRANSCRIPTION_MODEL = "gpt-4o-transcribe";
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

function unavailableReason(): string | null {
  if (!process.env.OPENAI_API_KEY) return "OPENAI_API_KEY is not configured.";
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ENABLE_PRODUCTION_CHAT !== "true"
  ) {
    return "Production transcription is disabled until authentication and rate limiting are configured.";
  }
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

  const headers = { ...corsHeaders(origin), "Cache-Control": "no-store" };
  const unavailable = unavailableReason();
  if (unavailable) {
    return Response.json({ error: unavailable }, { status: 503, headers });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json(
      { error: "Request body must be multipart form data." },
      { status: 400, headers },
    );
  }

  const audio = formData.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return Response.json(
      { error: "A non-empty audio file is required." },
      { status: 400, headers },
    );
  }
  if (audio.size >= MAX_AUDIO_BYTES) {
    return Response.json(
      { error: "The recording must be smaller than 25 MB." },
      { status: 413, headers },
    );
  }

  try {
    const transcription = await new OpenAI().audio.transcriptions.create(
      {
        file: audio,
        model: TRANSCRIPTION_MODEL,
        response_format: "json",
      },
      { signal: request.signal },
    );

    return Response.json({ text: transcription.text.trim() }, { headers });
  } catch (error) {
    console.error("Failed to transcribe audio", error);
    return Response.json(
      { error: "Donna could not transcribe the recording. Please try again." },
      { status: 502, headers },
    );
  }
}
