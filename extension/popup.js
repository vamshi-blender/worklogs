const DEFAULT_BACKEND_URL = "http://localhost:3000";
const messagesElement = document.querySelector("#messages");
const form = document.querySelector("#chatForm");
const input = document.querySelector("#messageInput");
const sendButton = document.querySelector("#sendButton");
const settingsButton = document.querySelector("#settingsButton");

const messages = [
  {
    role: "assistant",
    content: "Ready. I am connected to the backend you configure in extension settings.",
  },
];

settingsButton.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const content = input.value.trim();
  if (!content || sendButton.disabled) {
    return;
  }

  messages.push({ role: "user", content });
  input.value = "";
  renderMessages("Thinking...");
  setBusy(true);

  try {
    const backendUrl = await getBackendUrl();
    const response = await fetch(`${backendUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: messages.slice(-20) }),
    });
    const data = await response.json();

    if (!response.ok || !data.reply) {
      throw new Error(data.error || "The backend did not return a reply.");
    }

    messages.push({ role: "assistant", content: data.reply });
    renderMessages();
  } catch (error) {
    messages.push({
      role: "assistant",
      content: error instanceof Error ? error.message : "Something went wrong.",
    });
    renderMessages();
  } finally {
    setBusy(false);
    input.focus();
  }
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

function renderMessages(statusText = "") {
  messagesElement.innerHTML = "";

  for (const message of messages) {
    const bubble = document.createElement("article");
    bubble.className = `message ${message.role}`;
    bubble.textContent = message.content;
    messagesElement.appendChild(bubble);
  }

  if (statusText) {
    const status = document.createElement("article");
    status.className = "message status";
    status.textContent = statusText;
    messagesElement.appendChild(status);
  }

  messagesElement.scrollTop = messagesElement.scrollHeight;
}

function setBusy(isBusy) {
  sendButton.disabled = isBusy;
  input.disabled = isBusy;
}

async function getBackendUrl() {
  const stored = await chrome.storage.sync.get(["backendUrl"]);
  return normalizeUrl(stored.backendUrl || DEFAULT_BACKEND_URL);
}

function normalizeUrl(url) {
  return String(url).trim().replace(/\/+$/, "");
}

renderMessages();
