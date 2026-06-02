"use client";

import { FormEvent, useMemo, useRef, useState } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "I am ready. Ask me something simple, then we can start adding browser-aware tools.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const visibleMessages = useMemo(
    () => messages.filter((message) => message.content.trim().length > 0),
    [messages],
  );

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const content = input.trim();
    if (!content || isSending) {
      return;
    }

    const nextMessages = [...messages, { role: "user" as const, content }];
    setMessages(nextMessages);
    setInput("");
    setError("");
    setIsSending(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.slice(-20),
        }),
      });
      const data = (await response.json()) as { reply?: string; error?: string };

      if (!response.ok || !data.reply) {
        throw new Error(data.error ?? "The assistant did not return a reply.");
      }

      setMessages((current) => [
        ...current,
        { role: "assistant", content: data.reply ?? "" },
      ]);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Something went wrong.";

      setError(message);
    } finally {
      setIsSending(false);
      formRef.current?.querySelector("textarea")?.focus();
    }
  }

  return (
    <main className="min-h-dvh bg-[#f7f4ed] text-[#241f1a]">
      <section className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-5 py-5 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between border-b border-[#241f1a]/15 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#7b5b2d]">
              Workupdate AI
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal sm:text-4xl">
              Extension assistant lab
            </h1>
          </div>
          <div className="hidden border-l border-[#241f1a]/15 pl-6 text-right text-sm text-[#6f665b] sm:block">
            Agents SDK
            <br />
            Vercel backend
          </div>
        </header>

        <div className="grid flex-1 gap-6 py-6 lg:grid-cols-[280px_1fr]">
          <aside className="flex flex-col justify-between border-b border-[#241f1a]/15 pb-5 text-sm text-[#5f584f] lg:border-b-0 lg:border-r lg:pb-0 lg:pr-6">
            <div className="space-y-5">
              <p>Local operator surface for early assistant runs.</p>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
                <StatusItem label="Backend" value="/api/chat" />
                <StatusItem label="Model" value="OPENAI_MODEL" />
                <StatusItem label="Runtime" value="Node route" />
              </div>
            </div>
            <p className="mt-6 text-xs leading-5 text-[#81776b]">
              Session history is replayed by the app for this first version.
            </p>
          </aside>

          <div className="flex min-h-[640px] flex-col overflow-hidden border border-[#241f1a]/20 bg-[#fffaf0] shadow-[12px_12px_0_#241f1a]">
            <div className="flex items-center justify-between border-b border-[#241f1a]/15 bg-[#efe4cf] px-4 py-3">
              <span className="text-sm font-semibold">Chat preview</span>
              <span className="h-2.5 w-2.5 bg-[#1f8f62]" aria-hidden="true" />
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
              {visibleMessages.map((message, index) => (
                <article
                  className={`max-w-[82%] border px-4 py-3 text-sm leading-6 ${
                    message.role === "user"
                      ? "ml-auto border-[#241f1a] bg-[#241f1a] text-[#fffaf0]"
                      : "border-[#d6c9b7] bg-white text-[#241f1a]"
                  }`}
                  key={`${message.role}-${index}-${message.content.slice(0, 12)}`}
                >
                  {message.content}
                </article>
              ))}

              {isSending ? (
                <article className="w-fit border border-[#d6c9b7] bg-white px-4 py-3 text-sm text-[#6f665b]">
                  Thinking...
                </article>
              ) : null}
            </div>

            {error ? (
              <div className="border-t border-[#b65032]/25 bg-[#fff1e9] px-4 py-3 text-sm text-[#8f2f19]">
                {error}
              </div>
            ) : null}

            <form
              ref={formRef}
              onSubmit={submitMessage}
              className="grid gap-3 border-t border-[#241f1a]/15 bg-[#efe4cf] p-4 sm:grid-cols-[1fr_auto]"
            >
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                rows={2}
                placeholder="Ask the first version of your assistant..."
                className="max-h-40 min-h-14 resize-y border border-[#241f1a]/25 bg-[#fffaf0] px-4 py-3 text-sm leading-6 outline-none transition focus:border-[#241f1a]"
              />
              <button
                type="submit"
                disabled={isSending || !input.trim()}
                className="h-14 border border-[#241f1a] bg-[#d95f2b] px-6 text-sm font-bold text-white transition hover:bg-[#bd4d20] disabled:cursor-not-allowed disabled:bg-[#c5b9a7] disabled:text-[#6f665b]"
              >
                Send
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}

function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#241f1a]/15 bg-[#fffaf0] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7b5b2d]">
        {label}
      </p>
      <p className="mt-2 font-mono text-xs text-[#241f1a]">{value}</p>
    </div>
  );
}
