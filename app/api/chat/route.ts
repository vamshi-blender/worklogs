import { Agent, run } from "@openai/agents";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(8000),
});

const requestSchema = z.object({
  messages: z.array(messageSchema).min(1).max(30),
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const chatAgent = new Agent({
  name: "Workupdate Assistant",
  model: process.env.OPENAI_MODEL ?? "gpt-5.5",
  instructions: [
    "You are the first version of a browser-extension assistant.",
    "Answer clearly and helpfully in a conversational tone.",
    "Keep answers concise unless the user asks for detail.",
    "You do not have tools yet, so do not claim to browse pages or inspect private data.",
  ].join(" "),
});

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return json(
      { error: "OPENAI_API_KEY is not configured on the backend." },
      500,
    );
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return json({ error: "Request body must be valid JSON." }, 400);
  }

  const parsed = requestSchema.safeParse(payload);

  if (!parsed.success) {
    return json(
      { error: "Send 1-30 messages with role and non-empty content." },
      400,
    );
  }

  const messages = parsed.data.messages;
  const prompt = formatMessagesForAgent(messages);

  try {
    const result = await run(chatAgent, prompt);
    const reply =
      typeof result.finalOutput === "string"
        ? result.finalOutput
        : JSON.stringify(result.finalOutput);

    return json({ reply });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The agent run failed.";

    return json({ error: message }, 500);
  }
}

function formatMessagesForAgent(messages: z.infer<typeof messageSchema>[]) {
  const transcript = messages
    .map(
      (message) =>
        `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`,
    )
    .join("\n\n");

  return [
    "Continue this chat. Use the full transcript for context, then answer only the latest user message.",
    "",
    transcript,
  ].join("\n");
}

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: corsHeaders,
  });
}
