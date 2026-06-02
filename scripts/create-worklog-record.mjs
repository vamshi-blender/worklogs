import { readFileSync } from "node:fs";

const tokenFromLocalFile = readLocalToken();
const BEARER_TOKEN =
  tokenFromLocalFile || process.env.QUIXY_BEARER_TOKEN || "PASTE_BEARER_TOKEN_HERE";

const API_ORIGIN = "https://quixyhomeapi.kwixee.co.in";
const ISSUE_VIEW_ID = "05072022-184836479-5888ab5b-d645-4e86-a937-f2d02d2414c1";
const WORKLOG_APP_ID = "07022021-220225896-25e3fa6f-ac18-4835-8437-f0f460b9062f";
const WORKSPACE_ID = "03012021-192624661-c4d2d235-e371-4983-973f-c82b074f9b21";
const ORGANIZATION_ID = "29102019-093434548-a4fe41b0-1fd0-489a-ac08-a29b98883143";

const ISSUE_ID = process.env.WORKLOG_ISSUE_ID || "QKA-49715";
const LOG_DATE = process.env.WORKLOG_DATE || "2026-05-30T18:30:00.00";
const NEXT_WORKING_DATE =
  process.env.WORKLOG_NEXT_WORKING_DATE || "2026-06-01T18:30:00.00";
const CURRENT_TIME = process.env.WORKLOG_CURRENT_TIME || "2026-06-01T18:30:00.00";
const CATEGORY = process.env.WORKLOG_CATEGORY || "API Testing one";
const LOG_HOURS = process.env.WORKLOG_HOURS || "0.25";
const LOG_DESCRIPTION =
  process.env.WORKLOG_DESCRIPTION || "manual API replay test - created from script";

if (BEARER_TOKEN === "PASTE_BEARER_TOKEN_HERE") {
  throw new Error(
    "Add your bearer token in scripts/worklog-token.local.txt, QUIXY_BEARER_TOKEN, or replace PASTE_BEARER_TOKEN_HERE.",
  );
}

const issue = await fetchIssueDetails(ISSUE_ID);
const user = await fetchCurrentUserDetails();
const employee = await fetchEmployeeDetails(user.EmailId);
const { hours, minutes } = splitHours(LOG_HOURS);

const payload = {
  "var Project Id": asString(issue["Project Id"]),
  "var Issue Record Id": asString(issue["Record Id"]),
  "var Issue Id": asString(issue["Issue Id"]),
  "var Issue Type": asString(issue["Issue Type"]),
  "var Current Assignee": asString(issue.Assignee),
  "var Summary": asString(issue.Summary),
  Action: "Add Worklog",
  "var Logged In User": user.EmailId,
  "Log Date": LOG_DATE,
  "Current Date": LOG_DATE,
  Category: CATEGORY,
  "Log Hours": LOG_HOURS,
  Hours: String(hours),
  Minutes: minutes,
  "Billable Hours": LOG_HOURS,
  "Next Working Date": NEXT_WORKING_DATE,
  "Current Time": CURRENT_TIME,
  "Cut Off Time": "2022-12-28T05:30:00.00",
  "Is On Time": "Yes",
  "Worklog Late Entry Notification": "",
  "var Log Efforts": LOG_HOURS,
  "Log Hours Instructions": "",
  "Log Description": LOG_DESCRIPTION,
  "var Worklog Date": LOG_DATE,
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

const response = await requestText(
  `${API_ORIGIN}/api/App/SaveAppData?appName=Worklog&users=&startDate=null&dueDate=null`,
  {
    method: "POST",
    body: JSON.stringify(payload),
  },
);

console.log("Fetched issue:", {
  issueId: payload["var Issue Id"],
  projectId: payload["var Project Id"],
  recordId: payload["var Issue Record Id"],
  issueType: payload["var Issue Type"],
  summary: payload["var Summary"],
});
console.log("Fetched user:", {
  userId: payload._UserId,
  email: payload._UserEmailId,
  fullName: payload._FullName,
  department: payload.Department,
});
console.log("Save response:");
console.log(JSON.stringify(parseMaybeJson(response), null, 2));

async function fetchIssueDetails(issueId) {
  const body = {
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
      CustomUserViewFilters: [
        {
          Order: 0,
          ColumnName: "Issue Id",
          ElementType: "TextBox",
          ConditionType: "Contains",
          Value: issueId,
          IsEditable: true,
          IsVisible: false,
          SecondValue: "",
          SelectedValues: [""],
        },
      ],
    },
  };

  const result = await requestJson(
    `${API_ORIGIN}/api/Report/GetViewResult?skip=0&take=100&viewId=${ISSUE_VIEW_ID}`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
  const rows = JSON.parse(result.results || "[]");
  const issue = rows.find((row) => row["Issue Id"] === issueId) || rows[0];

  if (!issue) {
    throw new Error(`Issue not found: ${issueId}`);
  }

  return issue;
}

async function fetchCurrentUserDetails() {
  return requestJson(`${API_ORIGIN}/api/User/GetUserDetails`);
}

async function fetchEmployeeDetails(email) {
  const result = await requestJson(
    `${API_ORIGIN}/api/Datasource/GetReferencedDataSourceData`,
    {
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
    },
  );
  const firstRow = Array.isArray(result) ? result[0] : [];
  return Object.fromEntries(
    firstRow.map((item) => [item.Name, item.Value]),
  );
}

async function requestJson(url, options = {}) {
  return parseMaybeJson(await requestText(url, options));
}

async function requestText(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${BEARER_TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/plain, */*",
      Referer: "https://quixyhome.kwixee.co.in/",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${url} failed: ${response.status} ${text}`);
  }

  return text;
}

function splitHours(value) {
  const totalMinutes = Math.round(Number(value) * 60);
  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  };
}

function parseMaybeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function asString(value) {
  return value == null ? "" : String(value);
}

function readLocalToken() {
  try {
    return readFileSync(new URL("./worklog-token.local.txt", import.meta.url), "utf8").trim();
  } catch {
    return "";
  }
}
