import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  MenuTwoLineIcon,
  PanelRightIcon,
  PictureInPictureOnIcon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { getSavedMode, switchMode, type DisplayMode } from "../mode";
import Sidebar, { type SidebarChat } from "./Sidebar";
import Composer from "./Composer";
import Greeting from "./Greeting";
import MessageList, { type ChatMessage } from "./MessageList";
import {
  deleteConversation,
  generateConversationTitle,
  resumeChat,
  streamChat,
} from "../api/chat";
import { executeClientTool } from "../api/clientTools";
import type { ChatStreamEvent } from "../api/protocol";
import {
  createChatTitle,
  EMPTY_CHAT_STORE,
  loadChatStore,
  saveChatStore,
  type StoredChat,
  type StoredChatStore,
} from "../api/chatStorage";
import "./ChatLayout.css";

// Placeholder until real user identity is wired up.
const CURRENT_USER_NAME = "Vamshi";
const EMPTY_MESSAGES: ChatMessage[] = [];

interface ChatLayoutProps {
  ctx: DisplayMode;
}

export default function ChatLayout({ ctx }: ChatLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [displayMode, setDisplayMode] = useState<DisplayMode | null>(null);
  const [modeHint, setModeHint] = useState("");
  const [chatStore, setChatStore] = useState<StoredChatStore>(EMPTY_CHAT_STORE);
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [composerHeight, setComposerHeight] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerDockRef = useRef<HTMLDivElement>(null);
  const activeRequestRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const modeSwitchingRef = useRef(false);

  const activeChat =
    chatStore.chats.find((chat) => chat.id === chatStore.activeChatId) ?? null;
  const messages = activeChat?.messages ?? EMPTY_MESSAGES;
  const conversationId = activeChat?.conversationId ?? null;
  const hasMessages = messages.length > 0;
  const hasPendingApproval = messages.some((message) => message.status === "approval");
  const sidebarChats: SidebarChat[] = [...chatStore.chats]
    .sort((left, right) => {
      if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
      return right.updatedAt - left.updatedAt;
    })
    .map(({ id, title, titleStatus, pinned }) => ({
      id,
      title,
      titlePending: titleStatus === "pending",
      pinned,
    }));

  useEffect(() => {
    loadChatStore()
      .then(setChatStore)
      .finally(() => setHydrated(true));

    return () => activeRequestRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timeout = setTimeout(() => {
      void saveChatStore(chatStore);
    }, 150);
    return () => clearTimeout(timeout);
  }, [chatStore, hydrated]);

  useEffect(() => {
    if (!hydrated) return;

    for (const chat of chatStore.chats) {
      if (chat.titleStatus !== "pending") continue;
      const firstUserMessage = chat.messages.find(
        (message) => message.role === "user",
      );
      if (!firstUserMessage) continue;
      void generateTitle(chat.id, firstUserMessage.content);
    }
    // Pending titles are retried once when persisted chats are restored.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const dock = composerDockRef.current;
    if (!dock) return;

    // Track the floating composer dock's real height so the spacer below the
    // messages can match it exactly — otherwise a growing composer (e.g. a
    // long, multi-line message) covers message content instead of the
    // content scrolling clear of it.
    let lastHeight = dock.getBoundingClientRect().height;
    const observer = new ResizeObserver(([entry]) => {
      const height = entry.contentRect.height;
      setComposerHeight(height);
      // Stay pinned to bottom only when the dock's height changes (e.g. the
      // composer growing with a longer message) — a width-only change (e.g.
      // resizing the panel) should never force a scroll.
      if (height !== lastHeight && scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
      lastHeight = height;
    });
    observer.observe(dock);
    return () => observer.disconnect();
  }, [hasMessages]);

  useEffect(() => {
    getSavedMode().then(setDisplayMode);
  }, []);

  async function handleToggleDisplayMode(next: DisplayMode) {
    if (modeSwitchingRef.current || next === displayMode) return;
    modeSwitchingRef.current = true;
    setModeHint("");
    setDisplayMode(next);
    try {
      await switchMode(next, ctx, setModeHint);
    } finally {
      modeSwitchingRef.current = false;
    }
  }

  function setBusyState(next: boolean) {
    busyRef.current = next;
    setBusy(next);
  }

  function updateChat(chatId: string, update: (chat: StoredChat) => StoredChat) {
    setChatStore((current) => ({
      ...current,
      chats: current.chats.map((chat) => (chat.id === chatId ? update(chat) : chat)),
    }));
  }

  function updateAssistant(
    chatId: string,
    messageId: string,
    update: (message: ChatMessage) => ChatMessage,
  ) {
    updateChat(chatId, (chat) => ({
      ...chat,
      messages: chat.messages.map((message) =>
        message.id === messageId ? update(message) : message,
      ),
    }));
  }

  async function generateTitle(chatId: string, firstUserMessage: string) {
    try {
      const title = await generateConversationTitle(firstUserMessage);
      updateChat(chatId, (chat) =>
        chat.titleStatus === "pending"
          ? { ...chat, title, titleStatus: "generated" }
          : chat,
      );
    } catch (error) {
      console.error("Could not generate a conversation title", error);
      updateChat(chatId, (chat) =>
        chat.titleStatus === "pending"
          ? {
              ...chat,
              title: createChatTitle(firstUserMessage),
              titleStatus: "fallback",
            }
          : chat,
      );
    }
  }

  function handleStreamEvent(
    chatId: string,
    messageId: string,
    event: ChatStreamEvent,
  ) {
    if (event.type === "response.started") {
      updateChat(chatId, (chat) => ({
        ...chat,
        conversationId: event.conversationId,
      }));
    } else if (event.type === "response.delta") {
      updateAssistant(chatId, messageId, (message) => {
        const trailingNewlines = message.content.match(/\n+$/)?.[0].length ?? 0;
        const segmentBreak =
          event.startsNewSegment && message.content.length > 0
            ? "\n".repeat(Math.max(0, 2 - trailingNewlines))
            : "";

        return {
          ...message,
          content: message.content + segmentBreak + event.delta,
          status: "streaming",
          error: undefined,
        };
      });
    } else if (event.type === "tool_approval.request") {
      updateAssistant(chatId, messageId, (message) => ({
        ...message,
        status: "approval",
        toolRequest: event,
      }));
    } else if (event.type === "response.completed") {
      updateAssistant(chatId, messageId, (message) => ({
        ...message,
        status: "done",
        toolRequest: undefined,
      }));
      updateChat(chatId, (chat) => ({
        ...chat,
        conversationId: event.conversationId,
      }));
    } else if (event.type === "response.error") {
      updateAssistant(chatId, messageId, (message) => ({
        ...message,
        status: "error",
        error: event.message,
        toolRequest: undefined,
      }));
    }
  }

  async function executeRequest(
    chatId: string,
    messageId: string,
    request: (signal: AbortSignal, onEvent: (event: ChatStreamEvent) => void) => Promise<void>,
  ) {
    const controller = new AbortController();
    activeRequestRef.current = controller;
    setBusyState(true);

    try {
      await request(controller.signal, (event) =>
        handleStreamEvent(chatId, messageId, event),
      );
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === "AbortError";
      updateAssistant(chatId, messageId, (message) => ({
        ...message,
        status: cancelled && message.content ? "done" : "error",
        error: cancelled && !message.content ? "Response stopped." : cancelled ? undefined : error instanceof Error ? error.message : "Donna could not respond.",
        toolRequest: undefined,
      }));
    } finally {
      if (activeRequestRef.current === controller) activeRequestRef.current = null;
      setBusyState(false);
    }
  }

  function handleSend(content: string) {
    if (!hydrated || busyRef.current || hasPendingApproval) return;
    const chatId = activeChat?.id ?? crypto.randomUUID();
    const requestConversationId = activeChat?.conversationId ?? undefined;
    const now = Date.now();
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
    };
    const replyId = crypto.randomUUID();
    const assistantMessage: ChatMessage = {
      id: replyId,
      role: "assistant",
      content: "",
      status: "pending",
    };

    setChatStore((current) => {
      const existing = current.chats.find((chat) => chat.id === chatId);
      if (existing) {
        return {
          ...current,
          activeChatId: chatId,
          chats: current.chats.map((chat) =>
            chat.id === chatId
              ? {
                  ...chat,
                  messages: [...chat.messages, userMessage, assistantMessage],
                  updatedAt: now,
                }
              : chat,
          ),
        };
      }

      const chat: StoredChat = {
        id: chatId,
        title: "",
        titleStatus: "pending",
        messages: [userMessage, assistantMessage],
        conversationId: null,
        pinned: false,
        createdAt: now,
        updatedAt: now,
      };
      return {
        activeChatId: chatId,
        chats: [chat, ...current.chats],
      };
    });

    if (!activeChat) void generateTitle(chatId, content);

    void executeRequest(chatId, replyId, (signal, onEvent) =>
      streamChat({
        message: content,
        conversationId: requestConversationId,
        signal,
        onEvent,
      }),
    );
  }

  function handleCancel() {
    activeRequestRef.current?.abort();
  }

  function handleNewChat() {
    handleCancel();
    setChatStore((current) => ({ ...current, activeChatId: null }));
  }

  function handleSelectChat(chatId: string) {
    if (chatId === chatStore.activeChatId) return;
    handleCancel();
    setChatStore((current) =>
      current.chats.some((chat) => chat.id === chatId)
        ? { ...current, activeChatId: chatId }
        : current,
    );
  }

  function handleRenameChat(chatId: string, title: string) {
    const normalized = title.replace(/\s+/g, " ").trim().slice(0, 56);
    if (!normalized) return;
    updateChat(chatId, (chat) => ({
      ...chat,
      title: normalized,
      titleStatus: "manual",
    }));
  }

  function handleTogglePinChat(chatId: string) {
    updateChat(chatId, (chat) => ({ ...chat, pinned: !chat.pinned }));
  }

  async function handleDeleteChat(chatId: string): Promise<boolean> {
    const chat = chatStore.chats.find((candidate) => candidate.id === chatId);
    if (!chat) return true;

    try {
      if (chat.conversationId) {
        await deleteConversation(chat.conversationId);
      }
    } catch (error) {
      console.error("Could not delete Donna conversation", error);
      return false;
    }

    if (chatId === chatStore.activeChatId) handleCancel();
    setChatStore((current) => ({
      activeChatId:
        current.activeChatId === chatId ? null : current.activeChatId,
      chats: current.chats.filter((candidate) => candidate.id !== chatId),
    }));
    return true;
  }

  async function handleToolDecision(messageId: string, approved: boolean) {
    if (busyRef.current) return;
    const chatId = activeChat?.id;
    if (!chatId) return;
    const message = messages.find((candidate) => candidate.id === messageId);
    const toolRequest = message?.toolRequest;
    if (!toolRequest) return;

    setBusyState(true);

    updateAssistant(chatId, messageId, (current) => ({
      ...current,
      status: "pending",
      toolRequest: undefined,
    }));

    let result: unknown;
    let error: string | undefined;
    if (approved) {
      // Server-executed tools run inside the backend once approved; only
      // client tools produce a result in the browser.
      if (toolRequest.executor === "client") {
        try {
          result = await executeClientTool(toolRequest);
        } catch (toolError) {
          approved = false;
          error = toolError instanceof Error ? toolError.message : "The page could not be read.";
        }
      }
    } else {
      error = "The user declined this request.";
    }

    void executeRequest(chatId, messageId, (signal, onEvent) =>
      resumeChat({
        runId: toolRequest.runId,
        toolCallId: toolRequest.toolCallId,
        approved,
        result,
        error,
        signal,
        onEvent,
      }),
    );
  }

  function handleToolInstruction(messageId: string, instruction: string) {
    if (busyRef.current) return;
    const chatId = activeChat?.id;
    if (!chatId) return;
    const message = messages.find((candidate) => candidate.id === messageId);
    const toolRequest = message?.toolRequest;
    if (!toolRequest) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: instruction,
    };
    const replyId = crypto.randomUUID();
    const assistantMessage: ChatMessage = {
      id: replyId,
      role: "assistant",
      content: "",
      status: "pending",
    };

    // Show the instruction as a normal user turn, then stream the resumed
    // run into a fresh assistant bubble below it. The paused approval bubble
    // is closed out — or dropped entirely if the model had no text yet.
    updateChat(chatId, (chat) => ({
      ...chat,
      updatedAt: Date.now(),
      messages: [
        ...chat.messages
          .filter(
            (candidate) => !(candidate.id === messageId && !candidate.content.trim()),
          )
          .map((candidate) =>
            candidate.id === messageId
              ? { ...candidate, status: "done" as const, toolRequest: undefined }
              : candidate,
          ),
        userMessage,
        assistantMessage,
      ],
    }));

    void executeRequest(chatId, replyId, (signal, onEvent) =>
      resumeChat({
        runId: toolRequest.runId,
        toolCallId: toolRequest.toolCallId,
        approved: false,
        instruction,
        signal,
        onEvent,
      }),
    );
  }

  function handleRetry(messageId: string) {
    if (busyRef.current || hasPendingApproval) return;
    const chatId = activeChat?.id;
    if (!chatId) return;
    const failedIndex = messages.findIndex((message) => message.id === messageId);
    if (failedIndex < 1) return;
    const previousUser = [...messages.slice(0, failedIndex)]
      .reverse()
      .find((message) => message.role === "user");
    if (!previousUser) return;

    updateAssistant(chatId, messageId, (message) => ({
      ...message,
      content: "",
      status: "pending",
      error: undefined,
    }));
    void executeRequest(chatId, messageId, (signal, onEvent) =>
      streamChat({
        message: previousUser.content,
        conversationId: conversationId ?? undefined,
        signal,
        onEvent,
      }),
    );
  }

  return (
    <div className="chat-layout">
      <header className="chat-topbar">
        <div className="chat-topbar-brand">
          <button
            type="button"
            className="icon-button sidebar-trigger app-tooltip app-tooltip--bottom app-tooltip--start"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
            data-tooltip="Open sidebar"
          >
            <HugeiconsIcon icon={MenuTwoLineIcon} size={20} />
          </button>
          <span className="chat-brand-name">Donna</span>
        </div>
        <div className="chat-topbar-actions">
          <button
            type="button"
            className="icon-button app-tooltip app-tooltip--bottom"
            onClick={handleNewChat}
            aria-label="New chat"
            data-tooltip="New chat"
          >
            <HugeiconsIcon icon={PlusSignIcon} size={20} />
          </button>
          <button
            type="button"
            className="display-mode-toggle-btn app-tooltip app-tooltip--bottom app-tooltip--end"
            aria-pressed={displayMode === "sidepanel"}
            onClick={() =>
              handleToggleDisplayMode(displayMode === "sidepanel" ? "popout" : "sidepanel")
            }
            aria-label={
              displayMode === "sidepanel" ? "Switch to pop-out window" : "Switch to side panel"
            }
            data-tooltip={displayMode === "sidepanel" ? "Pop out window" : "Side panel"}
          >
            <HugeiconsIcon
              icon={displayMode === "sidepanel" ? PictureInPictureOnIcon : PanelRightIcon}
              size={20}
            />
          </button>
        </div>
      </header>
      {modeHint && <p className="chat-topbar-hint">{modeHint}</p>}

      {hasMessages ? (
        <div className="chat-thread">
          <div className="chat-scroll" ref={scrollRef}>
            <MessageList
              messages={messages}
              onApproveTool={(messageId) => void handleToolDecision(messageId, true)}
              onRejectTool={(messageId) => void handleToolDecision(messageId, false)}
              onInstructTool={handleToolInstruction}
              onRetry={handleRetry}
            />
            {/* Keep the last message actions comfortably clear of the floating composer. */}
            <div
              className="chat-scroll-spacer"
              style={{ height: `calc(${composerHeight}px + var(--space-6))` }}
            />
          </div>
          <div className="chat-composer-dock" ref={composerDockRef}>
            <div className="chat-composer-area">
              <Composer
                onSend={handleSend}
                busy={busy}
                disabled={!hydrated || hasPendingApproval}
                onCancel={handleCancel}
              />
            </div>
          </div>
        </div>
      ) : (
        <main className="chat-main">
          <div className="chat-composer-area">
            <Greeting userName={CURRENT_USER_NAME} />
            <Composer
              onSend={handleSend}
              busy={busy}
              disabled={!hydrated || hasPendingApproval}
              onCancel={handleCancel}
            />
          </div>
        </main>
      )}

      <Sidebar
        open={sidebarOpen}
        chats={sidebarChats}
        activeChatId={chatStore.activeChatId}
        busy={busy}
        onClose={() => setSidebarOpen(false)}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
        onRenameChat={handleRenameChat}
        onTogglePinChat={handleTogglePinChat}
        onDeleteChat={handleDeleteChat}
      />
    </div>
  );
}
