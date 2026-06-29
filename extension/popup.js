import { readExcelFile, getExcelAccessStatus } from "./fileStore.js";
import { renderMarkdownToElement } from "./markdownRenderer.js";

const DEFAULT_BACKEND_URL = "https://worklogs-wheat.vercel.app";
const MAX_CHAT_EXCEL_BYTES = 6 * 1024 * 1024;
const MAX_CHAT_EXCEL_BASE64_CHARS = 8_500_000;
const API_ORIGIN = "https://quixyhomeapi.kwixee.co.in";
const PMS_ORIGIN = "https://quixyhome.kwixee.co.in";
const MANAGE_ISSUES_VIEW_ID = "05072022-184836479-5888ab5b-d645-4e86-a937-f2d02d2414c1";
const MY_ISSUES_VIEW_ID = "05072022-184841377-993a07eb-3b63-4ecf-acc8-49f5cf180f3c";
const WORKLOG_APP_ID = "07022021-220225896-25e3fa6f-ac18-4835-8437-f0f460b9062f";
const WORKSPACE_ID = "03012021-192624661-c4d2d235-e371-4983-973f-c82b074f9b21";
const ORGANIZATION_ID = "29102019-093434548-a4fe41b0-1fd0-489a-ac08-a29b98883143";
const LEAVE_APPLICATION_APP_ID = "05062020-161245045-ec6b6933-5899-4b4f-b51f-d273fe01e07d";
const LEAVE_APPLICATION_WORKSPACE_ID = "13032020-124814289-77ce2fcd-ffe2-444f-ab91-cc4596c5cbbb";
const LEAVE_APPLICATION_SERIAL_ELEMENT_ID = "28072020-184101534-7e4d59af-1a1e-4d62-ae55-98d37e956f74";
const EMPLOYEE_MASTER_TABLE_ID = "17052021-230725540-64fa3900-8f24-42d0-a2af-738bcb12bfb6";
const EMPLOYEE_MASTER_FUNCTION_ID = "22072021-015736955-0ac9e1b7-93b7-46b7-8bc1-56ef83448dc3";
const LEAVE_BALANCE_TABLE_ID = "31032020-103841638-57a5ed0e-0871-407b-81f4-071717296418";
const LEAVE_BALANCE_FUNCTION_ID = "12052020-111746884-c0034d27-e061-45cd-b830-4e52e9645b5b";
const LEAVE_CALENDAR_SOURCE_ID = "11072022-110212853-41b30def-53c2-4d22-9703-67fefa42cd0f";
const LEAVE_CALENDAR_REFERENCE_ID = "11072022-111034394-31d0cbbc-afc5-4682-adf6-e968b014a035";
const CHAT_MESSAGES_KEY = "workupdateChatMessages";
const PENDING_WORKLOG_ACTIONS_KEY = "workupdatePendingWorklogActions";
const PENDING_PMS_ACTIONS_KEY = "workupdatePendingPmsActions";
const PENDING_PMS_LOOKUPS_KEY = "workupdatePendingPmsLookups";
const DEBUG_TOOLS_KEY = "workupdateDebugTools";
const MAX_DEBUG_EVENTS = 20;

const messagesElement = document.querySelector("#messages");
const form = document.querySelector("#chatForm");
const input = document.querySelector("#messageInput");
const sendButton = document.querySelector("#sendButton");
const settingsButton = document.querySelector("#settingsButton");
const newChatButton = document.querySelector("#newChatButton");
const chatTab = document.querySelector("#chatTab");
const worklogTab = document.querySelector("#worklogTab");
const chatScreen = document.querySelector("#chatScreen");
const worklogScreen = document.querySelector("#worklogScreen");
const detectTokenButton = document.querySelector("#detectTokenButton");
const tokenStatus = document.querySelector("#tokenStatus");
const worklogForm = document.querySelector("#worklogForm");
const worklogDateInput = document.querySelector("#worklogDateInput");
const worklogResult = document.querySelector("#worklogResult");
const createWorklogButton = document.querySelector("#createWorklogButton");
const debugToolsToggle = document.querySelector("#debugToolsToggle");
const clearDebugButton = document.querySelector("#clearDebugButton");
const toolDebugPanel = document.querySelector("#toolDebugPanel");

const defaultMessages = [
  {
    role: "assistant",
    content: "Hello, I'm your **Worklog Assistant**\nHow can I help you today?",
  },
];

let quixyToken = "";
let currentPmsViewId = "";
let messages = [...defaultMessages];
let pendingWorklogActions = null;
let pendingPmsActions = null;
let pendingPmsLookups = null;
let pmsLoginGate = null;
let pmsLoginPollId = 0;
let cachedQuixyUser = null;
// When the selected Excel file can't be read in the chat path (permission not
// re-granted this session, file moved, etc.), we surface an inline card so the
// user can re-grant from a real click gesture without leaving for Settings.
let excelAccessGate = null;
let debugToolsEnabled = false;
let toolDebugEvents = [];

settingsButton.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

newChatButton.addEventListener("click", startNewChat);
chatTab.addEventListener("click", () => showScreen("chat"));
worklogTab.addEventListener("click", () => showScreen("worklog"));
detectTokenButton.addEventListener("click", detectToken);
worklogForm.addEventListener("submit", createWorklog);
debugToolsToggle?.addEventListener("change", async () => {
  debugToolsEnabled = Boolean(debugToolsToggle.checked);
  await chrome.storage.local.set({ [DEBUG_TOOLS_KEY]: debugToolsEnabled });
  renderToolDebugPanel();
});
clearDebugButton?.addEventListener("click", () => {
  toolDebugEvents = [];
  renderToolDebugPanel();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const content = input.value.trim();
  if (!content || sendButton.disabled) {
    return;
  }

  await sendChatMessage(content);
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

async function sendChatMessage(content) {
  const messageContent = String(content || "").trim();

  if (!messageContent || sendButton.disabled) {
    return;
  }

  setChatBusy(true);
  let assistantMessageIndex = -1;

  try {
    messages.push({ role: "user", content: messageContent });
    await saveChatMessages();
    input.value = "";

    renderMessages("Thinking...");

    const backendUrl = await getBackendUrl();
    const excelContext = await getSelectedExcelForChat();
    updateExcelAccessGate(excelContext.excelAccess);

    assistantMessageIndex = messages.push({
      role: "assistant",
      content: "",
    }) - 1;
    renderMessages();

    let clientToolResults = [];
    let completed = false;

    for (let turn = 0; turn < 4; turn += 1) {
      messages[assistantMessageIndex].content = "";
      renderMessages(turn === 0 ? "Thinking..." : "Reading tool result...");

      const result = await runBackendChatTurn({
        backendUrl,
        excelContext,
        clientToolResults,
        assistantMessageIndex,
      });
      const clientToolRequests = getClientToolRequests(result);

      if (!hasClientToolRequests(clientToolRequests)) {
        completed = true;
        break;
      }

      messages[assistantMessageIndex].content = "Working in PMS...";
      renderMessages();
      clientToolResults = await executeClientToolRequests(clientToolRequests, {
        onStatus(status) {
          messages[assistantMessageIndex].content = status;
          renderMessages();
        },
      });
    }

    if (!completed) {
      throw new Error("The assistant requested too many client-side tool rounds.");
    }

    await saveChatMessages();
    renderMessages();
  } catch (error) {
    if (
      assistantMessageIndex >= 0 &&
      messages[assistantMessageIndex]?.content.trim() === ""
    ) {
      messages.splice(assistantMessageIndex, 1);
    }

    messages.push({
      role: "assistant",
      content: error instanceof Error ? error.message : "Something went wrong.",
    });
    await saveChatMessages();
    renderMessages();
  } finally {
    setChatBusy(false);
    renderMessages();
    input.focus();
  }
}

function showScreen(screen) {
  const isChat = screen === "chat";
  chatTab.classList.toggle("active", isChat);
  worklogTab.classList.toggle("active", !isChat);
  chatScreen.classList.toggle("active", isChat);
  worklogScreen.classList.toggle("active", !isChat);
}

async function startPmsLoginGate() {
  pmsLoginGate = {
    status: "opening",
    text: "Opening PMS so I can read your login session.",
  };
  renderMessages();
  await openOrFocusPms();

  pmsLoginGate = {
    status: "waiting",
    text: "Waiting for PMS login. Complete login in the PMS tab.",
  };
  renderMessages();
  startPmsLoginPolling();
}

function startPmsLoginPolling() {
  stopPmsLoginPolling();
  pmsLoginPollId = window.setInterval(async () => {
    const hasToken = await detectToken({ quiet: true, openIfMissing: false });

    if (!hasToken) {
      return;
    }

    stopPmsLoginPolling();
    pmsLoginGate = {
      status: "ready",
      text: "PMS session detected. Continue to execute the approved PMS operation.",
    };
    renderMessages();
  }, 3000);
}

function stopPmsLoginPolling() {
  if (pmsLoginPollId) {
    window.clearInterval(pmsLoginPollId);
    pmsLoginPollId = 0;
  }
}

function clearPmsLoginGate() {
  stopPmsLoginPolling();
  pmsLoginGate = null;
  renderMessages();
}

async function openOrFocusPms() {
  const tab = await getQuixyTab();

  if (tab?.id) {
    await chrome.tabs.update(tab.id, { active: true });

    if (tab.windowId) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }

    return;
  }

  await chrome.tabs.create({ url: PMS_ORIGIN });
}

async function continueAfterPmsLogin() {
  if (
    (!pendingWorklogActions && !pendingPmsActions && !pendingPmsLookups) ||
    pmsLoginGate?.status !== "ready"
  ) {
    return;
  }

  clearPmsLoginGate();
  renderMessages("Continuing PMS operation...");
  setChatBusy(true);
  const assistantMessageIndex = messages.push({
    role: "assistant",
    content: "Continuing PMS operation...",
  }) - 1;

  try {
    const backendUrl = await getBackendUrl();
    const excelContext = await getSelectedExcelForChat();
    updateExcelAccessGate(excelContext.excelAccess);
    const clientToolRequests = {
      worklogActions: pendingWorklogActions || [],
      pmsActions: pendingPmsActions || [],
      pmsLookups: pendingPmsLookups || [],
    };
    const clientToolResults = await executeClientToolRequests(clientToolRequests, {
      onStatus(status) {
        messages[assistantMessageIndex].content = status;
        renderMessages();
      },
    });
    pendingWorklogActions = null;
    pendingPmsActions = null;
    pendingPmsLookups = null;
    await savePendingPmsOperations();
    messages[assistantMessageIndex].content = "";
    await runBackendChatTurn({
      backendUrl,
      excelContext,
      clientToolResults,
      assistantMessageIndex,
    });
    await saveChatMessages();
    renderMessages();
  } catch {
    if (messages[assistantMessageIndex]?.content.trim() === "") {
      messages.splice(assistantMessageIndex, 1);
    }
    renderMessages();
  } finally {
    setChatBusy(false);
    input.focus();
  }
}

async function detectToken(options = {}) {
  const quiet = Boolean(options.quiet);
  const openIfMissing = options.openIfMissing !== false;

  if (!quiet) {
    setTokenStatus("Checking active PMS tab...");
  }

  detectTokenButton.disabled = true;

  try {
    const tab = await getQuixyTab();

    if (!tab) {
      if (openIfMissing) {
        await chrome.tabs.create({ url: PMS_ORIGIN });
        setTokenStatus("PMS opened. Login there, then click Detect again.");
      } else {
        setTokenStatus("PMS is not open.");
      }
      return false;
    }

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractQuixyToken,
    });

    if (!result?.accessToken) {
      setTokenStatus("No login token found. Login in PMS, then click Detect again.");
      return false;
    }

    quixyToken = result.accessToken;
    currentPmsViewId = result.viewId || "";
    cachedQuixyUser = null;
    await chrome.storage.session.set({ quixyAccessToken: quixyToken });

    const currentUser = await fetchCurrentUserSummary(result);
    setTokenStatus(`Connected as ${currentUser}`);
    return true;
  } catch (error) {
    setTokenStatus(error instanceof Error ? error.message : "Token detection failed.");
    return false;
  } finally {
    detectTokenButton.disabled = false;
  }
}

async function createWorklog(event) {
  event.preventDefault();
  createWorklogButton.disabled = true;
  worklogResult.textContent = "Preparing worklog...";

  try {
    const formData = new FormData(worklogForm);
    const saved = await saveWorklog({
      issueId: String(formData.get("issueId")).trim(),
      worklogDate: String(formData.get("worklogDate")),
      hours: String(formData.get("hours")).trim(),
      category: String(formData.get("category")).trim(),
      description: String(formData.get("description")).trim(),
      onStatus(status) {
        worklogResult.textContent = status;
      },
    });

    worklogResult.textContent = `Created worklog for ${saved.issueId}\nRecord: ${saved.recordId}`;
  } catch (error) {
    worklogResult.textContent =
      error instanceof Error ? error.message : "Worklog creation failed.";
  } finally {
    createWorklogButton.disabled = false;
  }
}

async function runBackendChatTurn({
  backendUrl,
  excelContext,
  clientToolResults,
  assistantMessageIndex,
}) {
  const response = await fetch(`${backendUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: getRecentChatMessages(),
      ...(clientToolResults.length > 0 ? { clientToolResults } : {}),
      currentDate: getLocalDate(),
      timeZone: getLocalTimeZone(),
      debugTools: debugToolsEnabled,
      ...(excelContext.excelFile ? { excelFile: excelContext.excelFile } : {}),
      excelAccess: excelContext.excelAccess,
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "The backend did not return a reply.");
  }

  const result = await readChatStream(
    response,
    (delta) => {
      messages[assistantMessageIndex].content += delta;
      renderMessages();
    },
    addToolDebugEvent,
  );

  if (result.reply && !messages[assistantMessageIndex].content.trim()) {
    messages[assistantMessageIndex].content = result.reply;
  }

  return result;
}

function getClientToolRequests(result) {
  return {
    worklogActions: normalizeWorklogActions(
      result.worklogActions ||
        result.worklogAction ||
        result.worklogDrafts ||
        result.worklogDraft,
    ),
    pmsActions: normalizePmsActions(result.pmsActions || result.pmsAction),
    pmsLookups: normalizePmsLookups(result.pmsLookupRequests || result.pmsLookupRequest),
  };
}

function hasClientToolRequests({ worklogActions = [], pmsActions = [], pmsLookups = [] }) {
  return worklogActions.length > 0 || pmsActions.length > 0 || pmsLookups.length > 0;
}

async function executeClientToolRequests(
  { worklogActions = [], pmsActions = [], pmsLookups = [] },
  { onStatus },
) {
  const normalizedWorklogs = normalizeWorklogActions(worklogActions);
  const normalizedActions = normalizePmsActions(pmsActions);
  const normalizedLookups = normalizePmsLookups(pmsLookups);

  const hasToken = await detectToken({ quiet: true, openIfMissing: false });

  if (!hasToken) {
    pendingWorklogActions = normalizedWorklogs.length ? normalizedWorklogs : null;
    pendingPmsActions = normalizedActions.length ? normalizedActions : null;
    pendingPmsLookups = normalizedLookups.length ? normalizedLookups : null;
    await savePendingPmsOperations();
    await startPmsLoginGate();
    throw new Error("PMS login is required before I can run the requested client-side tool.");
  }

  pendingWorklogActions = null;
  pendingPmsActions = null;
  pendingPmsLookups = null;
  await savePendingPmsOperations();

  const results = [];

  for (let index = 0; index < normalizedWorklogs.length; index += 1) {
    const draft = normalizedWorklogs[index];
    results.push(
      await captureClientToolResult("create_worklog", async () => {
        onStatus(
          normalizedWorklogs.length === 1
            ? `Creating worklog for ${draft.issueId}...`
            : `Creating worklog ${index + 1}/${normalizedWorklogs.length} for ${draft.issueId}...`,
        );
        const saved = await saveWorklog({
          issueId: draft.issueId,
          worklogDate: draft.worklogDate,
          hours: String(draft.hours),
          category: draft.category,
          description: draft.description,
          onStatus,
        });
        return { draft, saved };
      }),
    );
  }

  for (let index = 0; index < normalizedActions.length; index += 1) {
    const action = normalizedActions[index];
    results.push(
      await captureClientToolResult("submit_pms_action", async () => {
        onStatus(
          normalizedActions.length === 1
            ? `Executing ${formatPmsActionName(action.actionName)}...`
            : `Executing PMS action ${index + 1}/${normalizedActions.length}...`,
        );
        const saved = await executeManifestAction(action, { onStatus });
        return { action, saved };
      }),
    );
  }

  for (let index = 0; index < normalizedLookups.length; index += 1) {
    const lookup = normalizedLookups[index];
    results.push(
      await captureClientToolResult("request_pms_lookup", async () => {
        onStatus(
          normalizedLookups.length === 1
            ? `Checking ${formatPmsLookupName(lookup.resolverName)}...`
            : `Checking PMS lookup ${index + 1}/${normalizedLookups.length}...`,
        );
        return executePmsLookup(lookup);
      }),
    );
  }

  return results;
}

async function captureClientToolResult(toolName, execute) {
  try {
    return {
      toolName,
      status: "success",
      output: await execute(),
    };
  } catch (error) {
    return {
      toolName,
      status: "error",
      error: error instanceof Error ? error.message : "Client-side tool failed.",
    };
  }
}

async function executeManifestAction(action, { onStatus }) {
  if (action.actionName === "create_leave_application") {
    return saveLeaveApplication({
      ...action.fields,
      onStatus,
    });
  }

  throw new Error(`Unsupported PMS action: ${action.actionName}`);
}

async function executePmsLookup(lookup) {
  const employeeCode = lookup.params?.employeeCode || (await resolveEmployeeCode());

  if (lookup.resolverName === "getLeaveBalance") {
    return {
      resolverName: lookup.resolverName,
      employeeCode,
      data: await fetchLeaveBalance(employeeCode),
    };
  }

  if (lookup.resolverName === "getLeaveCalendar") {
    return {
      resolverName: lookup.resolverName,
      employeeCode,
      data: await fetchLeaveCalendar(employeeCode),
    };
  }

  throw new Error(`Unsupported PMS lookup: ${lookup.resolverName}`);
}

function normalizeWorklogActions(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.filter(isWorklogAction);
  }

  return isWorklogAction(value) ? [value] : [];
}

function normalizePmsActions(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.filter(isPmsAction);
  }

  return isPmsAction(value) ? [value] : [];
}

function isPmsAction(value) {
  return (
    value &&
    typeof value === "object" &&
    value.actionName === "create_leave_application" &&
    value.fields &&
    typeof value.fields === "object"
  );
}

function normalizePmsLookups(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.filter(isPmsLookup);
  }

  return isPmsLookup(value) ? [value] : [];
}

function isPmsLookup(value) {
  return (
    value &&
    typeof value === "object" &&
    ["getLeaveBalance", "getLeaveCalendar"].includes(value.resolverName) &&
    value.params &&
    typeof value.params === "object"
  );
}

function isWorklogAction(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.issueId === "string" &&
    typeof value.worklogDate === "string" &&
    typeof value.category === "string" &&
    typeof value.description === "string" &&
    Number.isFinite(Number(value.hours))
  );
}

async function readChatStream(response, onDelta, onToolDebug) {
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("text/event-stream")) {
    return response.json();
  }

  const reader = response.body?.getReader();

  if (!reader) {
    const data = await response.json();
    return data;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let rawText = "";
  let result = {
    reply: "",
    worklogAction: null,
    worklogActions: [],
    worklogDraft: null,
    worklogDrafts: [],
    pmsActions: [],
    pmsLookupRequests: [],
  };

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    const text = decoder.decode(value, { stream: true });
    rawText += text;
    buffer += text;
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const event of events) {
      const parsed = parseServerSentEvent(event);

      if (!parsed) {
        continue;
      }

      if (parsed.type === "delta") {
        onDelta(String(parsed.value || ""));
      } else if (parsed.type === "tool_debug") {
        onToolDebug?.(parsed);
      } else if (parsed.type === "done") {
        result = {
          reply: String(parsed.reply || ""),
          worklogAction: parsed.worklogAction || null,
          worklogActions: Array.isArray(parsed.worklogActions)
            ? parsed.worklogActions
            : [],
          worklogDraft: parsed.worklogDraft || null,
          worklogDrafts: Array.isArray(parsed.worklogDrafts)
            ? parsed.worklogDrafts
            : [],
          pmsActions: Array.isArray(parsed.pmsActions) ? parsed.pmsActions : [],
          pmsLookupRequests: Array.isArray(parsed.pmsLookupRequests)
            ? parsed.pmsLookupRequests
            : [],
        };
      } else if (parsed.type === "error") {
        throw new Error(parsed.error || "The backend stream failed.");
      }
    }
  }

  rawText += decoder.decode();

  if (buffer.trim()) {
    const parsed = parseServerSentEvent(buffer);

    if (parsed?.type === "done") {
      result = {
        reply: String(parsed.reply || ""),
        worklogAction: parsed.worklogAction || null,
        worklogActions: Array.isArray(parsed.worklogActions)
          ? parsed.worklogActions
          : [],
        worklogDraft: parsed.worklogDraft || null,
        worklogDrafts: Array.isArray(parsed.worklogDrafts)
          ? parsed.worklogDrafts
          : [],
        pmsActions: Array.isArray(parsed.pmsActions) ? parsed.pmsActions : [],
        pmsLookupRequests: Array.isArray(parsed.pmsLookupRequests)
          ? parsed.pmsLookupRequests
          : [],
      };
    } else if (parsed?.type === "error") {
      throw new Error(parsed.error || "The backend stream failed.");
    } else if (parsed?.type === "tool_debug") {
      onToolDebug?.(parsed);
    }
  }

  if (
    !result.reply &&
    !result.worklogAction &&
    result.worklogActions.length === 0 &&
    !result.worklogDraft &&
    result.worklogDrafts.length === 0 &&
    result.pmsActions.length === 0 &&
    result.pmsLookupRequests.length === 0 &&
    rawText.trim().startsWith("{")
  ) {
    return JSON.parse(rawText);
  }

  return result;
}

function addToolDebugEvent(event) {
  if (!debugToolsEnabled) {
    return;
  }

  toolDebugEvents.push({
    id: event.id || `${Date.now()}-${toolDebugEvents.length}`,
    name: event.name || "tool",
    input: event.input || null,
    output: event.output || null,
    durationMs: event.durationMs,
    createdAt: new Date().toLocaleTimeString(),
  });

  toolDebugEvents = toolDebugEvents.slice(-MAX_DEBUG_EVENTS);
  renderToolDebugPanel();
}

function renderToolDebugPanel() {
  if (!toolDebugPanel || !debugToolsToggle) {
    return;
  }

  debugToolsToggle.checked = debugToolsEnabled;
  toolDebugPanel.hidden = !debugToolsEnabled;

  if (!debugToolsEnabled) {
    return;
  }

  toolDebugPanel.replaceChildren();

  if (toolDebugEvents.length === 0) {
    const empty = document.createElement("p");
    empty.className = "tool-debug-empty";
    empty.textContent = "No tool calls captured yet.";
    toolDebugPanel.appendChild(empty);
    return;
  }

  for (const event of [...toolDebugEvents].reverse()) {
    const details = document.createElement("details");
    details.className = "tool-debug-item";
    details.open = true;

    const summary = document.createElement("summary");
    summary.textContent = `${event.name} (${event.durationMs ?? "?"} ms)`;

    const meta = document.createElement("p");
    meta.className = "tool-debug-meta";
    meta.textContent = event.createdAt;

    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify(
      {
        input: event.input,
        output: event.output,
      },
      null,
      2,
    );

    details.append(summary, meta, pre);
    toolDebugPanel.appendChild(details);
  }
}

function parseServerSentEvent(event) {
  const data = event
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");

  if (!data) {
    return null;
  }

  return JSON.parse(data);
}

async function saveWorklog({ issueId, worklogDate, hours, category, description, onStatus }) {
  onStatus("Preparing worklog...");
  await detectToken({ quiet: true });

  if (!quixyToken) {
    throw new Error("Login token is not available yet.");
  }

  const logDate = toApiDate(worklogDate);
  const { hours: wholeHours, minutes } = splitHours(hours);
  const issue = await fetchIssueDetails(issueId);
  const user = await requestJson(`${API_ORIGIN}/api/User/GetUserDetails`);
  const employee = await fetchEmployeeDetails(user.EmailId);
  const nextWorkingDate = toApiDate(addDays(worklogDate, 1));
  const now = new Date();

  const payload = {
    "var Project Id": asString(issue["Project Id"]),
    "var Issue Record Id": asString(issue["Record Id"]),
    "var Issue Id": asString(issue["Issue Id"]),
    "var Issue Type": asString(issue["Issue Type"]),
    "var Current Assignee": asString(issue.Assignee),
    "var Summary": asString(issue.Summary),
    Action: "Add Worklog",
    "var Logged In User": user.EmailId,
    "Log Date": logDate,
    "Current Date": logDate,
    Category: category,
    "Log Hours": hours,
    Hours: String(wholeHours),
    Minutes: minutes,
    "Billable Hours": hours,
    "Next Working Date": nextWorkingDate,
    "Current Time": formatDateTime(now),
    "Cut Off Time": "2022-12-28T05:30:00.00",
    "Is On Time": "Yes",
    "Worklog Late Entry Notification": "",
    "var Log Efforts": hours,
    "Log Hours Instructions": "",
    "Log Description": description,
    "var Worklog Date": logDate,
    "var Worklog Email Id": null,
    "Issue Id watchers": null,
    Department: employee.Department || "",
    "Official Email Id": employee["Official Email Id"] || user.EmailId,
    Report: "",
    "Watchers List": [],
    "Worklog Date Grid": [],
    _AppId: WORKLOG_APP_ID,
    _AppName: "Worklog",
    _CurrentStepNumber: 1,
    _WorkSpaceId: WORKSPACE_ID,
    _OrganizationId: ORGANIZATION_ID,
    _NextGroupName: "Done",
    _IsCompleted: true,
    _ExternalApiIds: "",
    _InternalApiIds: "",
    _DataFunctionIds: "",
    _UserFunctionIds: "",
    _UserId: user.UserId,
    _Username: user.EmailId,
    _FullName: [user.FirstName, user.LastName].filter(Boolean).join(" "),
    _UpdatedUserId: "",
    _UpdatedUsername: "",
    _UpdatedEmailId: "",
    _UserEmailId: user.EmailId,
    _CreatedLocation: "",
    _NextStepUsers: "",
    _UpdatedLocation: "",
    _WorkFlowAction: "Start - Submit",
  };

  onStatus("Saving worklog...");
  const saved = await requestJson(
    `${API_ORIGIN}/api/App/SaveAppData?appName=Worklog&users=&startDate=null&dueDate=null`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );

  if (!saved.Success) {
    throw new Error(saved.ErrorMessage || "Worklog save failed.");
  }

  return {
    issueId,
    recordId: saved.Data,
  };
}

async function saveLeaveApplication({
  leaveType,
  halfDay,
  halfDayType,
  fromDate,
  toDate,
  reason,
  contactNumber,
  acknowledgment,
  onStatus,
}) {
  onStatus("Preparing leave application...");
  await detectToken({ quiet: true });

  if (!quixyToken) {
    throw new Error("Login token is not available yet.");
  }

  const normalizedHalfDay = leaveType === "Optional Leave" ? "No" : halfDay;
  const normalizedHalfDayType = normalizedHalfDay === "Yes" ? halfDayType : null;

  if (normalizedHalfDay === "Yes" && !normalizedHalfDayType) {
    throw new Error("Half Day Type is required when Half Day is Yes.");
  }

  if (!acknowledgment) {
    throw new Error("Leave application acknowledgment must be accepted before submit.");
  }

  assertLeaveDatePolicy(fromDate, toDate);

  const noOfDays = calculateLeaveNoOfDays(fromDate, toDate, normalizedHalfDay);
  const rawDayCount = calculateInclusiveDayCount(fromDate, toDate);
  const employeeCode = await resolveEmployeeCode();

  onStatus("Resolving employee details...");
  const [applicationId, employee, balance] = await Promise.all([
    fetchNextLeaveApplicationId(),
    fetchEmployeeMaster(employeeCode),
    fetchLeaveBalance(employeeCode),
  ]);

  if (leaveType === "PL" && Number(balance.BalanceLeaves || 0) < noOfDays) {
    throw new Error(
      `PL balance is ${balance.BalanceLeaves || 0}, but this request needs ${noOfDays} day(s).`,
    );
  }

  const now = new Date();
  const payload = {
    "Application Id": applicationId,
    "Application Date": toLeaveUtcMidnight(getLocalDate()),
    "Employee Id": employeeCode,
    "Full Name": employee.FullName || "",
    "Date of Joining": employee.DateOfJoining || "",
    "Employee Name User": null,
    DOB: employee.DOB || "",
    "Employee Code": employeeCode,
    Designation: employee.Designation || "",
    "Attendance Id": null,
    "Attendance Id Grid": [],
    "Rich Text": getLeaveRichTextNote(),
    "Entitled Leaves": balance.EntitledLeaves || "",
    "Used Leaves": balance.UsedLeaves || "",
    "Balance Leaves": balance.BalanceLeaves || "",
    "Optional Balance": balance.OptionalBalance || "",
    "Optional Leaves Track": balance.OptionalLeavesTrack || "",
    "Used Optional": balance.UsedOptional || "",
    "Employee Code Leave Balance": employeeCode,
    "Leave Tyoe": leaveType,
    "Half Day": normalizedHalfDay,
    "Half Day Type": normalizedHalfDayType || "",
    Reason: reason,
    "Contact Number": contactNumber || "",
    "File Upload if any": [],
    "Employee Check Box": Boolean(acknowledgment),
    "Leave Dates New ds": buildDateRangeTriple(fromDate, toDate),
    "No of Days": noOfDays,
    "Half Day number": normalizedHalfDay === "Yes" ? 0.5 : "",
    "Number new ds": rawDayCount,
    "Employee Code new ds": employeeCode,
    "Leave Dates New ds From Date": toLeaveUtcMidnight(fromDate),
    "Leave Dates New ds To Date": toLeaveUtcMidnight(toDate),
    "From Date Calculate": getMonthNumber(fromDate),
    "To Date Calculate": getMonthNumber(toDate),
    "From DateOff Calculate": getDayOfMonth(fromDate),
    "To Dateoff Calculate": getDayOfMonth(toDate),
    "Date Time Stamp": formatDateTime(now),
    "Proceed To Loss Of Pay": "",
    "Manager Name": null,
    "Manager Email Id": null,
    "Manager Employee Id": null,
    "Manager Remarks": "",
    "Manager Checkbox": false,
    "HR Name": null,
    "HR Email Id": null,
    "HR Employee Id": null,
    "HR Date Time Stamp": formatDateTime(now),
    "HR Remarks": "",
    _AppId: LEAVE_APPLICATION_APP_ID,
    _AppName: "Leave Application",
    _CurrentStepNumber: 1,
    _WorkSpaceId: LEAVE_APPLICATION_WORKSPACE_ID,
    _OrganizationId: ORGANIZATION_ID,
    _NextGroupName: "Manager Approval",
    _IsCompleted: false,
    _ExternalApiIds: "",
    _InternalApiIds: "",
    _DataFunctionIds: "",
    _UserFunctionIds: "",
    _UserId: await resolveUserId(),
    _Username: await resolveUsername(),
    _FullName: await resolveFullName(),
    _UpdatedUserId: "",
    _UpdatedUsername: "",
    _UpdatedEmailId: "",
    _UserEmailId: await resolveUserEmail(),
    _CreatedLocation: "",
    _NextStepUsers: "",
    _UpdatedLocation: "",
    _WorkFlowAction: "Start - Submit",
  };

  onStatus("Submitting leave application...");
  const saved = await requestJson(
    `${API_ORIGIN}/api/App/SaveAppData?appName=Leave Application&users=&startDate=null&dueDate=null`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );

  if (!saved.Success) {
    throw new Error(saved.ErrorMessage || "Leave application save failed.");
  }

  return {
    actionName: "create_leave_application",
    label: `${leaveType} leave`,
    recordId: saved.Data,
    applicationId,
  };
}

async function fetchNextLeaveApplicationId() {
  return requestJson(
    `${API_ORIGIN}/api/App/GetNextSerialNumber?appElementId=${LEAVE_APPLICATION_SERIAL_ELEMENT_ID}&appId=${LEAVE_APPLICATION_APP_ID}&organizationId=${ORGANIZATION_ID}`,
  );
}

async function fetchEmployeeMaster(employeeCode) {
  const result = await requestJson(`${API_ORIGIN}/api/DataTable/GetReferencedDataTableData`, {
    method: "POST",
    body: JSON.stringify({
      DataTableId: EMPLOYEE_MASTER_TABLE_ID,
      DataTableFunctionId: EMPLOYEE_MASTER_FUNCTION_ID,
      ReferencedElements: "Date of Joining,Department,Designation,DOB,Full Name",
      DataTableDataReferenceDataDTOs: [
        {
          ReferenceName: "Employee Code",
          IsFocused: true,
          Value: employeeCode,
        },
      ],
    }),
  });

  return mapNameValueRow(result);
}

async function fetchLeaveBalance(employeeCode) {
  const result = await requestJson(`${API_ORIGIN}/api/DataTable/GetReferencedDataTableData`, {
    method: "POST",
    body: JSON.stringify({
      DataTableId: LEAVE_BALANCE_TABLE_ID,
      DataTableFunctionId: LEAVE_BALANCE_FUNCTION_ID,
      ReferencedElements:
        "Balance Leaves,Entitled Leaves,Optional Balance,Optional Leaves Track,Used Leaves,Used Optional",
      DataTableDataReferenceDataDTOs: [
        {
          ReferenceName: "Employee Code",
          IsFocused: true,
          Value: employeeCode,
        },
      ],
    }),
  });

  const row = mapNameValueRow(result);
  return {
    BalanceLeaves: row["Balance Leaves"],
    EntitledLeaves: row["Entitled Leaves"],
    OptionalBalance: row["Optional Balance"],
    OptionalLeavesTrack: row["Optional Leaves Track"],
    UsedLeaves: row["Used Leaves"],
    UsedOptional: row["Used Optional"],
  };
}

async function fetchLeaveCalendar(employeeCode) {
  const result = await requestJson(`${API_ORIGIN}/api/Datasource/GetReferencedDataSourceData`, {
    method: "POST",
    body: JSON.stringify({
      DataSourceId: LEAVE_CALENDAR_SOURCE_ID,
      DataSourceReferenceId: LEAVE_CALENDAR_REFERENCE_ID,
      OutputColumns: "Boolean,Color,Date,Name",
      DataSourceReferenceConditions: [
        {
          DataSourceCollectionConditionLabelName: "Employee Code",
          IsFocused: true,
          Value: employeeCode,
        },
      ],
    }),
  });

  return Array.isArray(result)
    ? result.map((row) => Object.fromEntries(row.map((item) => [item.Name, item.Value])))
    : [];
}

function mapNameValueRow(result) {
  const firstRow = Array.isArray(result) ? result[0] : [];
  return Object.fromEntries(firstRow.map((item) => [item.Name, item.Value]));
}

async function getQuixyTab() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (activeTab?.url?.startsWith(PMS_ORIGIN)) {
    return activeTab;
  }

  const [existingTab] = await chrome.tabs.query({ url: `${PMS_ORIGIN}/*` });
  return existingTab;
}

function extractQuixyToken() {
  const oidcKey = Object.keys(localStorage).find((key) =>
    key.startsWith("oidc.user:https://quixyhomeapp.kwixee.co.in/:angular_spa"),
  );

  if (!oidcKey) {
    return { accessToken: "", email: "", name: "", viewId: "" };
  }

  try {
    const session = JSON.parse(localStorage.getItem(oidcKey) || "{}");
    return {
      accessToken: session.access_token || "",
      email: session.profile?.EmailId || session.profile?.UserName || "",
      name: session.profile?.Name || session.profile?.name || "",
      viewId: location.pathname.match(/\/views\/([^/?#]+)/)?.[1] || "",
    };
  } catch {
    return { accessToken: "", email: "", name: "", viewId: "" };
  }
}

async function fetchCurrentUserSummary(tokenResult) {
  try {
    const user = await requestJson(`${API_ORIGIN}/api/User/GetUserDetails`);
    const fullName = [user.FirstName, user.LastName].filter(Boolean).join(" ").trim();
    return fullName || user.EmailId || tokenResult.name || tokenResult.email || "logged-in user";
  } catch {
    return tokenResult.name || tokenResult.email || "logged-in user";
  }
}

async function fetchCurrentUserDetailsCached() {
  if (!cachedQuixyUser) {
    cachedQuixyUser = await requestJson(`${API_ORIGIN}/api/User/GetUserDetails`);
  }

  return cachedQuixyUser;
}

async function resolveEmployeeCode() {
  const user = await fetchCurrentUserDetailsCached();
  const candidates = [
    user.EmployeeCode,
    user["Employee Code"],
    user.EmployeeId,
    user["Employee Id"],
    user["Employee ID"],
    user.EmpCode,
    user.EmployeeNumber,
    user["Employee Number"],
    user.UserName,
  ]
    .map((value) => (value == null ? "" : String(value).trim()))
    .filter(Boolean);

  const employeeCode = candidates.find((value) => /^E\d+$/i.test(value));

  if (!employeeCode) {
    throw new Error("Could not resolve Employee Code from the logged-in PMS user.");
  }

  return employeeCode.toUpperCase();
}

async function resolveUserId() {
  const user = await fetchCurrentUserDetailsCached();
  return user.UserId || "";
}

async function resolveUsername() {
  const user = await fetchCurrentUserDetailsCached();
  return user.EmailId || user.UserName || "";
}

async function resolveUserEmail() {
  const user = await fetchCurrentUserDetailsCached();
  return user.EmailId || user.UserName || "";
}

async function resolveFullName() {
  const user = await fetchCurrentUserDetailsCached();
  return [user.FirstName, user.LastName].filter(Boolean).join(" ").trim() || user.Name || "";
}

async function fetchIssueDetails(issueId) {
  const candidateViewIds = [
    currentPmsViewId,
    MY_ISSUES_VIEW_ID,
    MANAGE_ISSUES_VIEW_ID,
  ].filter((viewId, index, list) => viewId && list.indexOf(viewId) === index);

  for (const viewId of candidateViewIds) {
    const issue = await fetchIssueFromView(issueId, viewId);

    if (issue) {
      return issue;
    }
  }

  throw new Error(`Issue not found in accessible PMS views: ${issueId}`);
}

async function fetchIssueFromView(issueId, viewId) {
  const filteredResult = await requestJson(
    `${API_ORIGIN}/api/Report/GetViewResult?skip=0&take=100&viewId=${viewId}`,
    {
      method: "POST",
      body: JSON.stringify(buildIssueSearchBody(issueId, viewId, true)),
    },
  );
  const filteredIssue = findIssueInResult(filteredResult, issueId);

  if (filteredIssue) {
    return filteredIssue;
  }

  const unfilteredResult = await requestJson(
    `${API_ORIGIN}/api/Report/GetViewResult?skip=0&take=100&viewId=${viewId}`,
    {
      method: "POST",
      body: JSON.stringify(buildIssueSearchBody(issueId, viewId, false)),
    },
  );

  return findIssueInResult(unfilteredResult, issueId);
}

function buildIssueSearchBody(issueId, viewId, includeIssueFilter) {
  if (viewId === MY_ISSUES_VIEW_ID) {
    return {
      orderByFields: "Issue Id",
      filters: {
        searchString: "",
        columns:
          "Actions,Add Comments,Add Base Line Hours,Add Worklog,Sub Tasks,Add Sub Task,Issue Id,Summary,Sprint Name,Status,Priority,Due Date,Updated On,Estimated Hours,Logged Hours,Remaining Hours,Assignee,Reporter,Resource Type,Status Indicator,Created Date,Record Id,Issue Type,Release,Project Id sprint,Detection Phase,Project Name,Module,Sub Module,Project Id project,Required Builds,Checkin Given Branch,Configurations Made,Manage Sub Tasks,Change issue Assignee,DB scripts,Impacted Features Of The Bug,Bug Scenario,Impact Features Sharepoint Link,POD,Change Status,Update RCA,IssueType,Bug Fixed Date,POD Test Owner,POD Dev Owner,BA Owner,Change Status V1,Issue Summary,Change Status CS",
        groupedColumns: "",
        rowHeight: "Default",
        columnsOrder:
          "Actions,Add Comments,Add Base Line Hours,Add Worklog,Sub Tasks,Add Sub Task,Issue Id,Summary,Sprint Name,Status,Priority,Due Date,Updated On,Estimated Hours,Logged Hours,Remaining Hours,Assignee,Reporter,Resource Type,Status Indicator,Browser,Test Case Id,Created Date,Injection Phase,Support Ticket Number,Record Id,Sprint Rank,Issue Type,Fix Branch,Severity,Iteration,Release,Project Id,Project Id sprint,Detection Phase,Bug Type,Project Name,Module,Sub Module,Project Id project,Required Builds,Checkin Given Branch,Configurations Made,Manage Sub Tasks,Change issue Assignee,If Any Configuration Changes Made,DB scripts,Impacted Features Of The Bug,Bug Scenario,Impact Features Sharepoint Link,Issue Summary,POD,Change Status,Update RCA,IssueType,Change Status V1,Change Status CS,Bug Fixed Date,POD Test Owner,POD Dev Owner,BA Owner",
        resizedColumns: [],
        pageSize: 100,
        filters: [],
        sorting: [],
        paginationStyle: "Modern",
        CustomUserViewFilters: includeIssueFilter ? [issueFilter(issueId)] : [],
      },
    };
  }

  return {
    orderByFields: "",
    filters: {
      searchString: "",
      columns: "Actions,Sub Tasks,Issue Id,Sprint Name,Issue Type,Summary,Status,Assignee",
      groupedColumns: "",
      rowHeight: null,
      columnsOrder:
        "Actions,Sub Tasks,Issue Id,Sprint Name,Issue Type,Summary,Status,Issue Category,Sprint Rank,Reporter,Assignee,Created Date Time,Due Date,Updated On,Dependent Id,Priority,Estimated Hours,Logged Hours,Remaining Hours,Release,Browser,Bug Type,Detection Phase,Fix Branch,Injection Phase,Severity,Required Builds,Checkin Given Branch,Configurations Made,DB scripts,DB scripts exist,Impacted Features Of The Bug,Test Case Id,Project Name,Module,Sub Module,Resource Type,Release DateTime,Created DateTime,Bug Age,Client Name,Reporter Story Points,Assignee Story Points,Task Type,Feature,Sub Feature,Group Name,Bug Scenario,Coding Target Date,Test Cases Target Date,Unit Testing Target Date,Devbox Testing Target Date,System Testing Target Date,Impact Features Sharepoint Link,Issue Reproduced Or Not,Steps To Reproduce,Reason For Not Reproducing,POD,IssueType,Bug Fixed Date,POD Test Owner,POD Dev Owner,BA Owner,DB Type",
      resizedColumns: [],
      pageSize: 100,
      filters: [],
      sorting: [],
      CustomUserViewFilters: includeIssueFilter ? [issueFilter(issueId)] : [],
    },
  };
}

function issueFilter(issueId) {
  return {
    Order: 0,
    ColumnName: "Issue Id",
    ElementType: "TextBox",
    ConditionType: "Equal",
    Value: issueId,
    IsEditable: true,
    IsVisible: false,
    SecondValue: "",
    SelectedValues: [issueId],
  };
}

function findIssueInResult(result, issueId) {
  const rows = JSON.parse(result.results || "[]");
  return rows.find((row) => row["Issue Id"] === issueId) || null;
}

async function fetchEmployeeDetails(email) {
  const result = await requestJson(`${API_ORIGIN}/api/Datasource/GetReferencedDataSourceData`, {
    method: "POST",
    body: JSON.stringify({
      DataSourceId: "09122025-151140038-04a0ffaf-8915-4233-9927-f944eba13fe9",
      DataSourceReferenceId: "09122025-151212613-6e69c429-eda6-4b2d-833f-a0da2f197677",
      OutputColumns: "Department,Official Email Id",
      DataSourceReferenceConditions: [
        {
          DataSourceCollectionConditionLabelName: "Official Email Id",
          IsFocused: true,
          Value: email,
        },
      ],
    }),
  });
  const firstRow = Array.isArray(result) ? result[0] : [];
  return Object.fromEntries(firstRow.map((item) => [item.Name, item.Value]));
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${quixyToken}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/plain, */*",
      Referer: PMS_ORIGIN,
      ...(options.headers || {}),
    },
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${url} failed: ${response.status} ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function renderMessages(statusText = "") {
  messagesElement.innerHTML = "";

  for (const message of normalizeChatMessages(messages)) {
    const bubble = document.createElement("article");
    bubble.className = `message ${message.role}`;
    renderMarkdownToElement(message.content, bubble);
    messagesElement.appendChild(bubble);
  }

  if (shouldShowConfirmationActions()) {
    messagesElement.appendChild(createConfirmationActionsElement());
  }

  if (excelAccessGate) {
    messagesElement.appendChild(createExcelAccessGateElement());
  }

  if (pmsLoginGate) {
    messagesElement.appendChild(createPmsLoginGateElement());
  }

  if (statusText) {
    const status = document.createElement("article");
    status.className = "message status";
    status.textContent = statusText;
    messagesElement.appendChild(status);
  }

  messagesElement.scrollTop = messagesElement.scrollHeight;
}

function shouldShowConfirmationActions() {
  if (sendButton.disabled) {
    return false;
  }

  const chatMessages = normalizeChatMessages(messages);
  const latestMessage = chatMessages[chatMessages.length - 1];

  return latestMessage?.role === "assistant" && isApprovalPrompt(latestMessage.content);
}

function isApprovalPrompt(content) {
  const text = String(content || "").toLowerCase();

  if (!text.trim()) {
    return false;
  }

  const asksForApproval =
    /\b(approve|approval|confirm|confirmed|proceed|go ahead)\b/.test(text);
  const allowsChanges =
    /\b(change|changes|edit|modify|correct|reject|rejected)\b/.test(text);
  const looksCompleted =
    /\b(created|submitted|queued|executed|completed|saved|failed|error)\b/.test(text);

  return asksForApproval && allowsChanges && !looksCompleted;
}

function createConfirmationActionsElement() {
  const card = document.createElement("section");
  card.className = "confirmation-actions";
  card.setAttribute("aria-label", "Action confirmation");

  const approveButton = document.createElement("button");
  approveButton.className = "confirmation-button approve";
  approveButton.type = "button";
  approveButton.textContent = "Approve";
  approveButton.addEventListener("click", () => {
    sendChatMessage("Approved.");
  });

  const rejectButton = document.createElement("button");
  rejectButton.className = "confirmation-button reject";
  rejectButton.type = "button";
  rejectButton.textContent = "Reject";
  rejectButton.addEventListener("click", () => {
    sendChatMessage("Rejected.");
  });

  card.append(approveButton, rejectButton);
  return card;
}

function createPmsLoginGateElement() {
  const card = document.createElement("section");
  card.className = "pms-login-gate";

  const label = document.createElement("p");
  label.className = "pms-login-gate-label";
  label.textContent = "PMS session";

  const text = document.createElement("p");
  text.className = "pms-login-gate-text";
  text.textContent = pmsLoginGate.text;

  const button = document.createElement("button");
  button.className = "pms-login-gate-button";
  button.type = "button";

  if (pmsLoginGate.status === "ready") {
    button.textContent = "Continue";
    button.disabled = false;
    button.addEventListener("click", continueAfterPmsLogin);
  } else if (pmsLoginGate.status === "opening") {
    button.textContent = "Login PMS";
    button.disabled = false;
    button.addEventListener("click", openOrFocusPms);
  } else {
    button.textContent = "Waiting for login";
    button.disabled = true;
  }

  card.append(label, text, button);
  return card;
}

function createExcelAccessGateElement() {
  const card = document.createElement("section");
  card.className = "pms-login-gate";

  const label = document.createElement("p");
  label.className = "pms-login-gate-label";
  label.textContent = "Excel file";

  const text = document.createElement("p");
  text.className = "pms-login-gate-text";
  text.textContent = excelAccessGate.message;

  const button = document.createElement("button");
  button.className = "pms-login-gate-button";
  button.type = "button";

  // Permission can be re-granted right here from the click gesture. Anything
  // else (file moved/deleted, too large) needs the user to re-select in Settings.
  const canGrantInline = ["permission_required", "permission_denied"].includes(
    excelAccessGate.status,
  );

  if (canGrantInline) {
    button.textContent = "Grant access";
    button.addEventListener("click", grantExcelAccessInline);
  } else {
    button.textContent = "Open Settings";
    button.addEventListener("click", () => chrome.runtime.openOptionsPage());
  }

  card.append(label, text, button);
  return card;
}

function updateExcelAccessGate(access) {
  // Only nag when a file is selected but unreadable. "not_selected" and
  // "available" mean nothing to fix, so clear any prior gate.
  const needsAttention =
    access &&
    ["permission_required", "permission_denied", "file_missing", "read_error", "file_too_large"].includes(
      access.status,
    );

  excelAccessGate = needsAttention
    ? { status: access.status, message: access.message || "" }
    : null;
}

async function grantExcelAccessInline() {
  // requestPermission requires a user gesture; this runs inside a click handler.
  const access = await getExcelAccessStatus({ prompt: true });

  if (access.status === "available") {
    excelAccessGate = null;
  } else {
    excelAccessGate = { status: access.status, message: access.message || "" };
  }

  renderMessages();
}

async function loadChatMessages() {
  const stored = await chrome.storage.local.get([
    CHAT_MESSAGES_KEY,
    PENDING_WORKLOG_ACTIONS_KEY,
    PENDING_PMS_ACTIONS_KEY,
    PENDING_PMS_LOOKUPS_KEY,
    "workupdatePendingWorklogDraft",
    DEBUG_TOOLS_KEY,
  ]);
  const storedMessages = stored[CHAT_MESSAGES_KEY];
  const storedActions =
    stored[PENDING_WORKLOG_ACTIONS_KEY] || stored.workupdatePendingWorklogDraft;
  const storedPmsActions = stored[PENDING_PMS_ACTIONS_KEY];
  const storedPmsLookups = stored[PENDING_PMS_LOOKUPS_KEY];
  debugToolsEnabled = Boolean(stored[DEBUG_TOOLS_KEY]);

  if (Array.isArray(storedMessages) && storedMessages.length > 0) {
    messages = normalizeChatMessages(storedMessages);
  }

  if (messages.length === 0) {
    messages = [...defaultMessages];
  }

  if (storedActions && typeof storedActions === "object") {
    const actions = normalizeWorklogActions(storedActions);
    pendingWorklogActions = actions.length > 0 ? actions : null;
  }

  if (storedPmsActions && typeof storedPmsActions === "object") {
    const actions = normalizePmsActions(storedPmsActions);
    pendingPmsActions = actions.length > 0 ? actions : null;
  }

  if (storedPmsLookups && typeof storedPmsLookups === "object") {
    const lookups = normalizePmsLookups(storedPmsLookups);
    pendingPmsLookups = lookups.length > 0 ? lookups : null;
  }

  renderToolDebugPanel();
}

async function saveChatMessages() {
  await chrome.storage.local.set({
    [CHAT_MESSAGES_KEY]: normalizeChatMessages(messages).slice(-50),
  });
}

async function startNewChat() {
  messages = [...defaultMessages];
  pendingWorklogActions = null;
  pendingPmsActions = null;
  pendingPmsLookups = null;
  // Excel access is a file/origin-level fact, not per-conversation, so it is not
  // reset here. A persisted grant carries across new chats and sessions.
  clearPmsLoginGate();
  await chrome.storage.local.remove([
    CHAT_MESSAGES_KEY,
    PENDING_WORKLOG_ACTIONS_KEY,
    PENDING_PMS_ACTIONS_KEY,
    PENDING_PMS_LOOKUPS_KEY,
    "workupdatePendingWorklogDraft",
  ]);
  renderMessages();
  showScreen("chat");
  input.focus();
}

function getLocalDate() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getLocalTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Calcutta";
}

async function getSelectedExcelForChat() {
  // Chat submission may include awaits before this point, so permission prompts
  // are handled by the explicit inline Grant access button instead.
  const excelFile = await readExcelFile({ prompt: false });

  if (excelFile.status !== "ok") {
    return {
      excelFile: null,
      excelAccess: {
        status: excelFile.status,
        name: excelFile.name || "",
        message: excelFile.message || "",
      },
    };
  }

  if (excelFile.arrayBuffer.byteLength > MAX_CHAT_EXCEL_BYTES) {
    return {
      excelFile: null,
      excelAccess: {
        status: "file_too_large",
        name: excelFile.name,
        message: `Selected Excel file is too large (${formatBytes(
          excelFile.arrayBuffer.byteLength,
        )}). Maximum supported size is ${formatBytes(MAX_CHAT_EXCEL_BYTES)}.`,
      },
    };
  }

  const dataBase64 = arrayBufferToBase64(excelFile.arrayBuffer);

  if (dataBase64.length > MAX_CHAT_EXCEL_BASE64_CHARS) {
    return {
      excelFile: null,
      excelAccess: {
        status: "file_too_large",
        name: excelFile.name,
        message: `Selected Excel file is too large after encoding (${formatBytes(
          dataBase64.length,
        )}). Choose a smaller file or export fewer rows.`,
      },
    };
  }

  return {
    excelFile: {
      name: excelFile.name,
      lastModified: excelFile.lastModified,
      dataBase64,
    },
    excelAccess: {
      status: "available",
      name: excelFile.name,
      message: "",
    },
  };
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getRecentChatMessages() {
  return normalizeChatMessages(messages).slice(-20);
}

function normalizeChatMessages(candidateMessages) {
  return candidateMessages.filter(
    (message) =>
      (message.role === "user" || message.role === "assistant") &&
      typeof message.content === "string" &&
      message.content.trim().length > 0,
  );
}

function setChatBusy(isBusy) {
  sendButton.disabled = isBusy;
  input.disabled = isBusy;
}

function setTokenStatus(text) {
  tokenStatus.textContent = text;
}

async function getBackendUrl() {
  const stored = await chrome.storage.sync.get(["backendUrl"]);
  return normalizeUrl(stored.backendUrl || DEFAULT_BACKEND_URL);
}

function normalizeUrl(url) {
  return String(url).trim().replace(/\/+$/, "");
}

function splitHours(value) {
  const totalMinutes = Math.round(Number(value) * 60);
  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  };
}

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function toApiDate(dateValue) {
  return `${dateValue}T18:30:00.00`;
}

function formatDateTime(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:00.00`;
}

function asString(value) {
  return value == null ? "" : String(value);
}

async function savePendingPmsOperations() {
  const updates = {};
  const removals = ["workupdatePendingWorklogDraft"];

  if (pendingWorklogActions) {
    updates[PENDING_WORKLOG_ACTIONS_KEY] = pendingWorklogActions;
  } else {
    removals.push(PENDING_WORKLOG_ACTIONS_KEY);
  }

  if (pendingPmsActions) {
    updates[PENDING_PMS_ACTIONS_KEY] = pendingPmsActions;
  } else {
    removals.push(PENDING_PMS_ACTIONS_KEY);
  }

  if (pendingPmsLookups) {
    updates[PENDING_PMS_LOOKUPS_KEY] = pendingPmsLookups;
  } else {
    removals.push(PENDING_PMS_LOOKUPS_KEY);
  }

  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }

  if (removals.length > 0) {
    await chrome.storage.local.remove(removals);
  }
}

function assertLeaveDatePolicy(fromDate, toDate) {
  if (fromDate > toDate) {
    throw new Error("Leave start date must be on or before the end date.");
  }

  if (getMonthNumber(fromDate) !== getMonthNumber(toDate) || getDayOfMonth(toDate) > 25) {
    throw new Error(
      "Leave cannot cross a month or go past the 25th. Split it into separate applications.",
    );
  }
}

function calculateLeaveNoOfDays(fromDate, toDate, halfDay) {
  return halfDay === "Yes" ? 0.5 : calculateInclusiveDayCount(fromDate, toDate);
}

function calculateInclusiveDayCount(fromDate, toDate) {
  const start = parseIsoDateParts(fromDate);
  const end = parseIsoDateParts(toDate);
  const startUtc = Date.UTC(start.year, start.month - 1, start.day);
  const endUtc = Date.UTC(end.year, end.month - 1, end.day);
  return Math.floor((endUtc - startUtc) / 86_400_000) + 1;
}

function buildDateRangeTriple(fromDate, toDate) {
  const labels = [];
  const cursor = parseIsoDateParts(fromDate);
  const end = parseIsoDateParts(toDate);
  let cursorUtc = Date.UTC(cursor.year, cursor.month - 1, cursor.day);
  const endUtc = Date.UTC(end.year, end.month - 1, end.day);

  while (cursorUtc <= endUtc) {
    labels.push(formatLeaveDateLabel(new Date(cursorUtc)));
    cursorUtc += 86_400_000;
  }

  return [labels[0], labels[labels.length - 1], labels];
}

function toLeaveUtcMidnight(dateValue) {
  const { year, month, day } = parseIsoDateParts(dateValue);
  const utcMillis = Date.UTC(year, month - 1, day, 0, 0, 0) - 330 * 60 * 1000;
  const shifted = new Date(utcMillis);
  const pad = (value) => String(value).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(
    shifted.getUTCDate(),
  )}T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:00.00`;
}

function getMonthNumber(dateValue) {
  return parseIsoDateParts(dateValue).month;
}

function getDayOfMonth(dateValue) {
  return parseIsoDateParts(dateValue).day;
}

function parseIsoDateParts(dateValue) {
  const match = String(dateValue).match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    throw new Error(`Invalid date: ${dateValue}`);
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function formatLeaveDateLabel(date) {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][
    date.getUTCMonth()
  ];
  return `${day}-${month}-${date.getUTCFullYear()}`;
}

function getLeaveRichTextNote() {
  return [
    '<p><span style="color: rgba(255, 0, 0, 1)">For any request the <strong>end date must not go',
    "beyond the 25th of the same month</strong> and <strong>cannot extend into the next month</strong>.</span></p>",
    "<p>Example: If a request spans 17-May-2025 to 11-Jun-2025, split it as App1 17-25 May, App2 26-31 May,",
    "App3 01-11 Jun.</p>",
  ].join(" ");
}

function formatPmsActionName(actionName) {
  if (actionName === "create_leave_application") {
    return "leave application";
  }

  return actionName;
}

function formatPmsLookupName(resolverName) {
  if (resolverName === "getLeaveBalance") {
    return "leave balance";
  }

  if (resolverName === "getLeaveCalendar") {
    return "leave calendar";
  }

  return resolverName;
}

function setDefaultDate() {
  const today = new Date();
  worklogDateInput.value = today.toISOString().slice(0, 10);
}

setDefaultDate();
loadChatMessages().then(renderMessages);
