import "server-only";

import { rememberUserContext, searchMem0UserMemories } from "@/lib/mem0/repository";
import type {
  DonnaIdentity,
  DonnaRunSummary,
  MemoryCapture,
  RetrievedUserMemory,
} from "./types";
import { learnReusablePmsKnowledge } from "./pms-learning";

const MEMORY_TEXT_LIMIT = 500;
const SECRET_PATTERN =
  /\b(password|passcode|api[ _-]?key|access[ _-]?token|secret|private[ _-]?key|credit[ _-]?card|cvv|social security|ssn)\b/i;

export async function loadRelevantUserMemories(
  identity: DonnaIdentity,
  query: string,
): Promise<RetrievedUserMemory[]> {
  try {
    const memories = await searchMem0UserMemories({
      tenantId: identity.tenantId,
      userId: String(identity.identityId),
      query,
      limit: 6,
      threshold: 0.15,
    });

    return memories.flatMap((memory) => {
      const text = typeof memory.memory === "string" ? memory.memory.trim() : "";
      return text
        ? [{
            id: memory.id,
            text: text.slice(0, MEMORY_TEXT_LIMIT),
            ...(typeof memory.score === "number" ? { score: memory.score } : {}),
          }]
        : [];
    });
  } catch (error) {
    console.error("Unable to retrieve Donna user memories", error);
    return [];
  }
}

export async function captureUserMemory(input: MemoryCapture): Promise<void> {
  const message = input.userMessage.trim();
  if (!message || message.length > 5_000 || SECRET_PATTERN.test(message)) return;

  try {
    await rememberUserContext({
      tenantId: input.tenantId,
      userId: input.userId,
      conversationId: input.conversationId,
      source: "donna_chat",
      kind: "profile_note",
      messages: [{ role: "user", content: message }],
    });
  } catch (error) {
    console.error("Unable to persist Donna user memory", error);
  }
}

export async function processCompletedDonnaTurn(input: {
  identity: DonnaIdentity;
  capture: MemoryCapture;
  summary: DonnaRunSummary;
}): Promise<void> {
  await Promise.all([
    captureUserMemory(input.capture),
    learnReusablePmsKnowledge(input),
  ]);
}
