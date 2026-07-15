import type { ChatMessage } from "../components/MessageList";

const CURRENT_CHAT_KEY = "donnaCurrentChat";

export interface StoredChat {
  messages: ChatMessage[];
  previousResponseId: string | null;
}

const EMPTY_CHAT: StoredChat = {
  messages: [],
  previousResponseId: null,
};

function restoreMessage(value: unknown): ChatMessage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const message = value as Partial<ChatMessage>;
  if (
    typeof message.id !== "string" ||
    (message.role !== "user" && message.role !== "assistant") ||
    typeof message.content !== "string"
  ) {
    return null;
  }

  if (
    message.role === "assistant" &&
    (message.status === "pending" ||
      message.status === "streaming" ||
      message.status === "approval")
  ) {
    return {
      id: message.id,
      role: "assistant",
      content: message.content,
      status: "error",
      error: "This response was interrupted. Try sending the message again.",
    };
  }

  return message as ChatMessage;
}

export async function loadCurrentChat(): Promise<StoredChat> {
  const stored = await chrome.storage.local.get(CURRENT_CHAT_KEY);
  const value = stored[CURRENT_CHAT_KEY];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return EMPTY_CHAT;
  }

  const candidate = value as Partial<StoredChat>;
  const messages = Array.isArray(candidate.messages)
    ? candidate.messages.map(restoreMessage).filter((item) => item !== null)
    : [];

  return {
    messages,
    previousResponseId:
      typeof candidate.previousResponseId === "string"
        ? candidate.previousResponseId
        : null,
  };
}

export async function saveCurrentChat(chat: StoredChat) {
  await chrome.storage.local.set({ [CURRENT_CHAT_KEY]: chat });
}

export async function clearCurrentChat() {
  await chrome.storage.local.remove(CURRENT_CHAT_KEY);
}
