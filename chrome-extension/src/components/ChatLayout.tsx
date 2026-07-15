import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { MenuTwoLineIcon } from "@hugeicons/core-free-icons";
import type { DisplayMode } from "../mode";
import ModeSwitcher from "./ModeSwitcher";
import Sidebar from "./Sidebar";
import Composer from "./Composer";
import MessageList, { type ChatMessage } from "./MessageList";
import "./ChatLayout.css";

interface ChatLayoutProps {
  ctx: DisplayMode;
}

export default function ChatLayout({ ctx }: ChatLayoutProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const hasMessages = messages.length > 0;

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  function handleSend(content: string) {
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content }]);
    queueMockReply();
  }

  function queueMockReply() {
    const reply =
      "This is a mock response so we can preview the assistant bubble, streaming cursor, and copy/share actions before the real backend is wired up.";
    const replyId = crypto.randomUUID();

    setMessages((prev) => [
      ...prev,
      { id: replyId, role: "assistant", content: "", status: "pending" },
    ]);

    let i = 0;
    // Pause before the first token, so the pending dot pulse has time to show.
    setTimeout(() => {
      const interval = setInterval(() => {
        i += 3;
        const chunk = reply.slice(0, i);
        const finished = i >= reply.length;

        setMessages((prev) =>
          prev.map((m) =>
            m.id === replyId
              ? { ...m, content: chunk, status: finished ? "done" : "streaming" }
              : m,
          ),
        );

        if (finished) clearInterval(interval);
      }, 20);
    }, 2200);
  }

  return (
    <div className="chat-layout">
      <header className="chat-topbar">
        <button
          type="button"
          className="icon-button sidebar-trigger"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open sidebar"
        >
          <HugeiconsIcon icon={MenuTwoLineIcon} size={20} />
        </button>
        <div className="chat-topbar-actions">
          <button type="button" className="pill-button pill-button--primary">
            New chat
          </button>
          <div className="settings-anchor">
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
            <MessageList messages={messages} />
            {/* Spacer so the last message can scroll clear of the floating composer. */}
            <div className="chat-scroll-spacer" />
          </div>
          <div className="chat-composer-dock">
            <div className="chat-composer-area">
              <Composer onSend={handleSend} />
            </div>
          </div>
        </div>
      ) : (
        <main className="chat-main">
          <div className="chat-composer-area">
            <Composer onSend={handleSend} />
          </div>
        </main>
      )}

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </div>
  );
}
