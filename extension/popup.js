const DEFAULT_BACKEND_URL = "http://localhost:3000";
const API_ORIGIN = "https://quixyhomeapi.kwixee.co.in";
const PMS_ORIGIN = "https://quixyhome.kwixee.co.in";
const MANAGE_ISSUES_VIEW_ID = "05072022-184836479-5888ab5b-d645-4e86-a937-f2d02d2414c1";
const MY_ISSUES_VIEW_ID = "05072022-184841377-993a07eb-3b63-4ecf-acc8-49f5cf180f3c";
const WORKLOG_APP_ID = "07022021-220225896-25e3fa6f-ac18-4835-8437-f0f460b9062f";
const WORKSPACE_ID = "03012021-192624661-c4d2d235-e371-4983-973f-c82b074f9b21";
const ORGANIZATION_ID = "29102019-093434548-a4fe41b0-1fd0-489a-ac08-a29b98883143";

const messagesElement = document.querySelector("#messages");
const form = document.querySelector("#chatForm");
const input = document.querySelector("#messageInput");
const sendButton = document.querySelector("#sendButton");
const settingsButton = document.querySelector("#settingsButton");
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

let quixyToken = "";
let currentPmsViewId = "";

const messages = [
  {
    role: "assistant",
    content: "Ready. I am connected to the backend you configure in extension settings.",
  },
];

settingsButton.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

chatTab.addEventListener("click", () => showScreen("chat"));
worklogTab.addEventListener("click", () => showScreen("worklog"));
detectTokenButton.addEventListener("click", detectToken);
worklogForm.addEventListener("submit", createWorklog);

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const content = input.value.trim();
  if (!content || sendButton.disabled) {
    return;
  }

  messages.push({ role: "user", content });
  input.value = "";
  renderMessages("Thinking...");
  setChatBusy(true);

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

async function detectToken(options = {}) {
  const quiet = Boolean(options.quiet);

  if (!quiet) {
    setTokenStatus("Checking active PMS tab...");
  }

  detectTokenButton.disabled = true;

  try {
    const tab = await getQuixyTab();

    if (!tab) {
      await chrome.tabs.create({ url: PMS_ORIGIN });
      setTokenStatus("PMS opened. Login there, then click Detect again.");
      return;
    }

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractQuixyToken,
    });

    if (!result?.accessToken) {
      setTokenStatus("No login token found. Login in PMS, then click Detect again.");
      return;
    }

    quixyToken = result.accessToken;
    currentPmsViewId = result.viewId || "";
    await chrome.storage.session.set({ quixyAccessToken: quixyToken });

    const currentUser = await fetchCurrentUserSummary(result);
    setTokenStatus(`Connected as ${currentUser}`);
  } catch (error) {
    setTokenStatus(error instanceof Error ? error.message : "Token detection failed.");
  } finally {
    detectTokenButton.disabled = false;
  }
}

async function createWorklog(event) {
  event.preventDefault();
  createWorklogButton.disabled = true;
  worklogResult.textContent = "Preparing worklog...";

  try {
    await detectToken({ quiet: true });

    if (!quixyToken) {
      throw new Error("Login token is not available yet.");
    }

    const formData = new FormData(worklogForm);
    const issueId = String(formData.get("issueId")).trim();
    const logDate = toApiDate(String(formData.get("worklogDate")));
    const hoursValue = String(formData.get("hours")).trim();
    const { hours, minutes } = splitHours(hoursValue);
    const issue = await fetchIssueDetails(issueId);
    const user = await requestJson(`${API_ORIGIN}/api/User/GetUserDetails`);
    const employee = await fetchEmployeeDetails(user.EmailId);
    const nextWorkingDate = toApiDate(addDays(String(formData.get("worklogDate")), 1));
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
      Category: String(formData.get("category")).trim(),
      "Log Hours": hoursValue,
      Hours: String(hours),
      Minutes: minutes,
      "Billable Hours": hoursValue,
      "Next Working Date": nextWorkingDate,
      "Current Time": formatDateTime(now),
      "Cut Off Time": "2022-12-28T05:30:00.00",
      "Is On Time": "Yes",
      "Worklog Late Entry Notification": "",
      "var Log Efforts": hoursValue,
      "Log Hours Instructions": "",
      "Log Description": String(formData.get("description")).trim(),
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

    worklogResult.textContent = "Saving worklog...";
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

    worklogResult.textContent = `Created worklog for ${issueId}\nRecord: ${saved.Data}`;
  } catch (error) {
    worklogResult.textContent =
      error instanceof Error ? error.message : "Worklog creation failed.";
  } finally {
    createWorklogButton.disabled = false;
  }
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
    ConditionType: "Contains",
    Value: issueId,
    IsEditable: true,
    IsVisible: false,
    SecondValue: "",
    SelectedValues: [""],
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
renderMessages();
