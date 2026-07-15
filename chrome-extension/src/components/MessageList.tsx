import { useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, Tick01Icon, Upload01Icon } from "@hugeicons/core-free-icons";
import type { ClientToolRequest } from "../api/protocol";
import "./MessageList.css";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: "pending" | "streaming" | "approval" | "done" | "error";
  error?: string;
  toolRequest?: ClientToolRequest;
}

interface MessageListProps {
  messages: ChatMessage[];
  onApproveTool?: (messageId: string) => void;
  onRejectTool?: (messageId: string) => void;
  onRetry?: (messageId: string) => void;
}

const COPIED_RESET_MS = 2000;

export default function MessageList({
  messages,
  onApproveTool,
  onRejectTool,
  onRetry,
}: MessageListProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const resetTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  async function handleCopy(message: ChatMessage) {
    await navigator.clipboard.writeText(message.content);
    setCopiedId(message.id);
    clearTimeout(resetTimeout.current);
    resetTimeout.current = setTimeout(() => setCopiedId(null), COPIED_RESET_MS);
  }

  return (
    <div className="message-list">
      {messages.map((message) => (
        <div key={message.id} className={`message-row message-row--${message.role}`}>
          {message.role === "user" ? (
            <div className="message-bubble message-bubble--user">{message.content}</div>
          ) : message.status === "pending" && !message.content ? (
            <span className="message-pending-dot" aria-label="Waiting for response" />
          ) : (
            <div className="message-column">
              {message.content && (
                <div className="message-bubble message-bubble--assistant">
                  {message.content}
                  {(message.status === "streaming" || message.status === "pending") && (
                    <span className="message-cursor" />
                  )}
                </div>
              )}
              {message.status === "approval" && message.toolRequest && (
                <div className="tool-approval" role="group" aria-label={message.toolRequest.title}>
                  <div className="tool-approval-eyebrow">Page access</div>
                  <strong>{message.toolRequest.title}</strong>
                  <p>{message.toolRequest.description}</p>
                  <div className="tool-approval-actions">
                    <button type="button" onClick={() => onRejectTool?.(message.id)}>
                      Not now
                    </button>
                    <button
                      type="button"
                      className="tool-approval-allow"
                      onClick={() => onApproveTool?.(message.id)}
                    >
                      Allow once
                    </button>
                  </div>
                </div>
              )}
              {message.status === "error" && (
                <div className="message-error" role="alert">
                  <span>{message.error ?? "Something went wrong."}</span>
                  <button type="button" onClick={() => onRetry?.(message.id)}>
                    Try again
                  </button>
                </div>
              )}
              {message.status === "done" && (
                <div className="message-actions">
                  <button
                    type="button"
                    className="message-action-btn"
                    aria-label="Copy response"
                    onClick={() => handleCopy(message)}
                  >
                    <HugeiconsIcon icon={copiedId === message.id ? Tick01Icon : Copy01Icon} size={20} />
                  </button>
                  <button type="button" className="message-action-btn" aria-label="Share">
                    <HugeiconsIcon icon={Upload01Icon} size={20} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
