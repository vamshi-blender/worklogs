import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, Upload01Icon } from "@hugeicons/core-free-icons";
import "./MessageList.css";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: "pending" | "streaming" | "done";
}

interface MessageListProps {
  messages: ChatMessage[];
}

export default function MessageList({ messages }: MessageListProps) {
  return (
    <div className="message-list">
      {messages.map((message) => (
        <div key={message.id} className={`message-row message-row--${message.role}`}>
          {message.role === "user" ? (
            <div className="message-bubble message-bubble--user">{message.content}</div>
          ) : message.status === "pending" ? (
            <span className="message-pending-dot" aria-label="Waiting for response" />
          ) : (
            <div className="message-column">
              <div className="message-bubble message-bubble--assistant">
                {message.content}
                {message.status === "streaming" && <span className="message-cursor" />}
              </div>
              {message.status === "done" && (
                <div className="message-actions">
                  <button type="button" className="message-action-btn" aria-label="Copy response">
                    <HugeiconsIcon icon={Copy01Icon} size={20} />
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
