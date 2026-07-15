import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { MenuTwoLineIcon } from "@hugeicons/core-free-icons";
import type { DisplayMode } from "../mode";
import ModeSwitcher from "./ModeSwitcher";
import Sidebar from "./Sidebar";
import Composer from "./Composer";
import Greeting from "./Greeting";
import MessageList, { type ChatMessage } from "./MessageList";
import { resumeChat, streamChat } from "../api/chat";
import { executeClientTool } from "../api/clientTools";
import type { ChatStreamEvent } from "../api/protocol";
import {
  clearCurrentChat,
  loadCurrentChat,
  saveCurrentChat,
} from "../api/chatStorage";
import "./ChatLayout.css";

// Placeholder until real user identity is wired up.
const CURRENT_USER_NAME = "Vamshi";

interface ChatLayoutProps {
  ctx: DisplayMode;
}

export default function ChatLayout({ ctx }: ChatLayoutProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [previousResponseId, setPreviousResponseId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [composerHeight, setComposerHeight] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerDockRef = useRef<HTMLDivElement>(null);
  const activeRequestRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const settingsAnchorRef = useRef<HTMLDivElement>(null);

  const hasMessages = messages.length > 0;
  const hasPendingApproval = messages.some((message) => message.status === "approval");

  useEffect(() => {
    loadCurrentChat()
      .then((chat) => {
        setMessages(chat.messages);
        setPreviousResponseId(chat.previousResponseId);
      })
      .finally(() => setHydrated(true));

    return () => activeRequestRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timeout = setTimeout(() => {
      void saveCurrentChat({ messages, previousResponseId });
    }, 150);
    return () => clearTimeout(timeout);
  }, [hydrated, messages, previousResponseId]);

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
    const observer = new ResizeObserver(([entry]) => {
      setComposerHeight(entry.contentRect.height);
      // Stay pinned to bottom while the composer grows, matching how
      // chatgpt.com keeps the latest message in view as the input expands.
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
    observer.observe(dock);
    return () => observer.disconnect();
  }, [hasMessages]);

  useEffect(() => {
    if (!settingsOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!settingsAnchorRef.current?.contains(event.target as Node)) {
        setSettingsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [settingsOpen]);

  function setBusyState(next: boolean) {
    busyRef.current = next;
    setBusy(next);
  }

  function updateAssistant(messageId: string, update: (message: ChatMessage) => ChatMessage) {
    setMessages((current) =>
      current.map((message) => (message.id === messageId ? update(message) : message)),
    );
  }

  function handleStreamEvent(messageId: string, event: ChatStreamEvent) {
    if (event.type === "response.delta") {
      updateAssistant(messageId, (message) => ({
        ...message,
        content: message.content + event.delta,
        status: "streaming",
        error: undefined,
      }));
    } else if (event.type === "client_tool.request") {
      updateAssistant(messageId, (message) => ({
        ...message,
        status: "approval",
        toolRequest: event,
      }));
    } else if (event.type === "response.completed") {
      updateAssistant(messageId, (message) => ({
        ...message,
        status: "done",
        toolRequest: undefined,
      }));
      setPreviousResponseId(event.previousResponseId);
    } else if (event.type === "response.error") {
      updateAssistant(messageId, (message) => ({
        ...message,
        status: "error",
        error: event.message,
        toolRequest: undefined,
      }));
    }
  }

  async function executeRequest(
    messageId: string,
    request: (signal: AbortSignal, onEvent: (event: ChatStreamEvent) => void) => Promise<void>,
  ) {
    const controller = new AbortController();
    activeRequestRef.current = controller;
    setBusyState(true);

    try {
      await request(controller.signal, (event) => handleStreamEvent(messageId, event));
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === "AbortError";
      updateAssistant(messageId, (message) => ({
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
    if (busyRef.current || hasPendingApproval) return;
    const replyId = crypto.randomUUID();
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content },
      { id: replyId, role: "assistant", content: "", status: "pending" },
    ]);

    void executeRequest(replyId, (signal, onEvent) =>
      streamChat({
        message: content,
        previousResponseId: previousResponseId ?? undefined,
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
    setMessages([]);
    setPreviousResponseId(null);
    void clearCurrentChat();
  }

  async function handleToolDecision(messageId: string, approved: boolean) {
    if (busyRef.current) return;
    const message = messages.find((candidate) => candidate.id === messageId);
    const toolRequest = message?.toolRequest;
    if (!toolRequest) return;

    setBusyState(true);

    updateAssistant(messageId, (current) => ({
      ...current,
      status: "pending",
      toolRequest: undefined,
    }));

    let result: unknown;
    let error: string | undefined;
    if (approved) {
      try {
        result = await executeClientTool(toolRequest);
      } catch (toolError) {
        approved = false;
        error = toolError instanceof Error ? toolError.message : "The page could not be read.";
      }
    } else {
      error = "The user declined page access.";
    }

    void executeRequest(messageId, (signal, onEvent) =>
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

  function handleRetry(messageId: string) {
    if (busyRef.current || hasPendingApproval) return;
    const failedIndex = messages.findIndex((message) => message.id === messageId);
    if (failedIndex < 1) return;
    const previousUser = [...messages.slice(0, failedIndex)]
      .reverse()
      .find((message) => message.role === "user");
    if (!previousUser) return;

    updateAssistant(messageId, (message) => ({
      ...message,
      content: "",
      status: "pending",
      error: undefined,
    }));
    void executeRequest(messageId, (signal, onEvent) =>
      streamChat({
        message: previousUser.content,
        previousResponseId: previousResponseId ?? undefined,
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
            className="icon-button sidebar-trigger"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            <HugeiconsIcon icon={MenuTwoLineIcon} size={20} />
          </button>
          <span className="chat-brand-name">Donna</span>
        </div>
        <div className="chat-topbar-actions">
          <button type="button" className="pill-button pill-button--primary" onClick={handleNewChat}>
            New chat
          </button>
          <div className="settings-anchor" ref={settingsAnchorRef}>
            <button
              type="button"
              className="pill-button pill-button--secondary"
              onClick={() => setSettingsOpen((open) => !open)}
              aria-expanded={settingsOpen}
            >
              Settings
            </button>
            {settingsOpen && (
              <div className="settings-popover">
                <ModeSwitcher ctx={ctx} />
              </div>
            )}
          </div>
        </div>
      </header>

      {hasMessages ? (
        <div className="chat-thread">
          <div className="chat-scroll" ref={scrollRef}>
            <MessageList
              messages={messages}
              onApproveTool={(messageId) => void handleToolDecision(messageId, true)}
              onRejectTool={(messageId) => void handleToolDecision(messageId, false)}
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
                disabled={hasPendingApproval}
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
              disabled={hasPendingApproval}
              onCancel={handleCancel}
            />
          </div>
        </main>
      )}

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </div>
  );
}
