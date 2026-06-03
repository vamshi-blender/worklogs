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
const CHAT_MESSAGES_KEY = "workupdateChatMessages";
const PENDING_WORKLOG_ACTIONS_KEY = "workupdatePendingWorklogActions";
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
let pmsLoginGate = null;
let pmsLoginPollId = 0;
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

  messages.push({ role: "user", content });
  await saveChatMessages();
  input.value = "";

  renderMessages("Thinking...");
  setChatBusy(true);
  let assistantMessageIndex = -1;

  try {
    const backendUrl = await getBackendUrl();
    const excelContext = await getSelectedExcelForChat();
    updateExcelAccessGate(excelContext.excelAccess);
    const response = await fetch(`${backendUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: getRecentChatMessages(),
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

    assistantMessageIndex = messages.push({
      role: "assistant",
      content: "",
    }) - 1;
    renderMessages();

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

    const returnedActions = normalizeWorklogActions(
      result.worklogActions ||
        result.worklogAction ||
        result.worklogDrafts ||
        result.worklogDraft,
    );

    if (returnedActions.length > 0) {
      await saveChatMessages();
      await executeAiWorklogActions(returnedActions);
    } else {
      await saveChatMessages();
    }
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
    input.focus();
  }
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

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
      text: "PMS session detected. Continue to execute the approved worklog action(s).",
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
  if (!pendingWorklogActions || pmsLoginGate?.status !== "ready") {
    return;
  }

  clearPmsLoginGate();
  renderMessages(`Creating ${formatWorklogCount(pendingWorklogActions)}...`);
  setChatBusy(true);

  try {
    await createWorklogsFromAiActions(pendingWorklogActions);
    pendingWorklogActions = null;
    await savePendingWorklogActions();
    renderMessages();
  } catch {
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

async function executeAiWorklogActions(actionOrActions) {
  const actions = normalizeWorklogActions(actionOrActions);

  if (actions.length === 0) {
    return;
  }

  const hasToken = await detectToken({ quiet: true, openIfMissing: false });

  if (!hasToken) {
    pendingWorklogActions = actions;
    await savePendingWorklogActions();
    await startPmsLoginGate();
    return;
  }

  pendingWorklogActions = null;
  await savePendingWorklogActions();
  await createWorklogsFromAiActions(actions);
}

async function createWorklogsFromAiActions(actionOrActions) {
  const drafts = normalizeWorklogActions(actionOrActions);

  if (drafts.length === 0) {
    return;
  }

  messages.push({
    role: "assistant",
    content:
      drafts.length === 1
        ? `Creating worklog for ${drafts[0].issueId}...`
        : `Creating ${drafts.length} worklogs...`,
  });
  await saveChatMessages();
  renderMessages();

  const savedRecords = [];

  try {
    for (let index = 0; index < drafts.length; index += 1) {
      const draft = drafts[index];
      const prefix =
        drafts.length === 1 ? "" : `Worklog ${index + 1}/${drafts.length}: `;
      const saved = await saveWorklog({
        issueId: draft.issueId,
        worklogDate: draft.worklogDate,
        hours: String(draft.hours),
        category: draft.category,
        description: draft.description,
        onStatus(status) {
          messages[messages.length - 1] = {
            role: "assistant",
            content: `${prefix}${status}`,
          };
          renderMessages();
        },
      });

      savedRecords.push(saved);
    }

    messages[messages.length - 1] = {
      role: "assistant",
      content: formatCreatedWorklogsMessage(savedRecords),
    };
    await saveChatMessages();
  } catch (error) {
    const partialMessage =
      savedRecords.length > 0
        ? `\n\nCreated before the failure:\n${savedRecords
            .map((saved, index) => `${index + 1}. ${saved.issueId} - ${saved.recordId}`)
            .join("\n")}`
        : "";
    messages[messages.length - 1] = {
      role: "assistant",
      content:
        error instanceof Error
          ? `I could not create all requested worklogs: ${error.message}${partialMessage}`
          : `I could not create all requested worklogs.${partialMessage}`,
    };
    await saveChatMessages();
    throw error;
  }
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

function formatWorklogCount(draftOrDrafts) {
  const count = normalizeWorklogActions(draftOrDrafts).length;
  return count === 1 ? "worklog" : `${count} worklogs`;
}

function formatCreatedWorklogsMessage(savedRecords) {
  if (savedRecords.length === 1) {
    const [saved] = savedRecords;
    return `Worklog created for ${saved.issueId}. Record: ${saved.recordId}`;
  }

  const rows = savedRecords.map(
    (saved, index) => `${index + 1}. ${saved.issueId} - ${saved.recordId}`,
  );

  return `Created ${savedRecords.length} worklogs:\n\n${rows.join("\n")}`;
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
    "workupdatePendingWorklogDraft",
    DEBUG_TOOLS_KEY,
  ]);
  const storedMessages = stored[CHAT_MESSAGES_KEY];
  const storedActions =
    stored[PENDING_WORKLOG_ACTIONS_KEY] || stored.workupdatePendingWorklogDraft;
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
  // Excel access is a file/origin-level fact, not per-conversation, so it is not
  // reset here. A persisted grant carries across new chats and sessions.
  clearPmsLoginGate();
  await chrome.storage.local.remove([
    CHAT_MESSAGES_KEY,
    PENDING_WORKLOG_ACTIONS_KEY,
    "workupdatePendingWorklogDraft",
  ]);
  renderMessages();
  showScreen("chat");
  input.focus();
}

async function savePendingWorklogActions() {
  if (pendingWorklogActions) {
    await chrome.storage.local.set({
      [PENDING_WORKLOG_ACTIONS_KEY]: pendingWorklogActions,
    });
    await chrome.storage.local.remove("workupdatePendingWorklogDraft");
    return;
  }

  await chrome.storage.local.remove([
    PENDING_WORKLOG_ACTIONS_KEY,
    "workupdatePendingWorklogDraft",
  ]);
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

function setDefaultDate() {
  const today = new Date();
  worklogDateInput.value = today.toISOString().slice(0, 10);
}

setDefaultDate();
loadChatMessages().then(renderMessages);
