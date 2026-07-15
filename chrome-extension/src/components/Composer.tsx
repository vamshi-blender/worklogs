import { useRef, useState, type KeyboardEvent } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Mic01Icon, ArrowUp02Icon } from "@hugeicons/core-free-icons";
import "./Composer.css";

const MAX_TEXTAREA_HEIGHT = 200;

interface ComposerProps {
  onSend?: (message: string) => void;
  busy?: boolean;
  disabled?: boolean;
  onCancel?: () => void;
}

export default function Composer({ onSend, busy = false, disabled = false, onCancel }: ComposerProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function resize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value);
    resize(e.target);
  }

  function handleSend() {
    if (busy) {
      onCancel?.();
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend?.(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const canSend = value.trim().length > 0;

  return (
    <div className="composer">
      <textarea
        ref={textareaRef}
        className="composer-textarea"
        placeholder="Ask anything"
        rows={1}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      />

      <div className="composer-toolbar">
        <button type="button" className="composer-icon-btn" aria-label="Add files and more">
          <HugeiconsIcon icon={Add01Icon} size={20} />
        </button>

        <div className="composer-trailing">
          <button type="button" className="composer-icon-btn" aria-label="Start dictation">
            <HugeiconsIcon icon={Mic01Icon} size={20} />
          </button>
          <button
            type="button"
            className={`composer-send-btn${busy ? " composer-send-btn--stop" : ""}`}
            aria-label={busy ? "Stop response" : "Send prompt"}
            disabled={!busy && (!canSend || disabled)}
            onClick={handleSend}
          >
            {busy ? (
              <span className="composer-stop-glyph" aria-hidden="true" />
            ) : (
              <HugeiconsIcon icon={ArrowUp02Icon} size={18} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
