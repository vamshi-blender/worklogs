// Leave Application manifest — reverse-engineered from the real Quixy form
// (docs/quixy-leave-form-analysis.md) and a live captured submission
// (VM/LAP/30078, 2026-07-18). Every GUID and payload key below is verbatim
// from recorded traffic. Payload keys — including the misspelled
// "Leave Tyoe" — are load-bearing; never "correct" them.
import type { PmsActionManifest, PmsLookupDefinition } from "../types";

const APP_ID = "05062020-161245045-ec6b6933-5899-4b4f-b51f-d273fe01e07d";
const ORGANIZATION_ID =
  "29102019-093434548-a4fe41b0-1fd0-489a-ac08-a29b98883143";
const HRMS_WORKSPACE_ID =
  "13032020-124814289-77ce2fcd-ffe2-444f-ab91-cc4596c5cbbb";

// Fixed policy note the form embeds in every submission.
const RICH_TEXT_NOTE = `<p><span style="color: rgba(255, 0, 0, 1); text-decoration: inherit">For any request the </span><span style="color: rgba(255, 0, 0, 1); text-decoration: inherit"><strong>end date must not go beyond the 25th of the same month</strong></span><span style="color: rgba(255, 0, 0, 1); text-decoration: inherit"> and </span><span style="color: rgba(255, 0, 0, 1); text-decoration: inherit"><strong>cannot extend into the next month</strong></span><span style="color: rgba(255, 0, 0, 1); text-decoration: inherit">.</span></p><p><span style="color: rgba(255, 0, 0, 1); text-decoration: inherit"><strong>Example:</strong></span><span style="color: rgba(255, 0, 0, 1); text-decoration: inherit"><br></span><span style="color: rgba(255, 0, 0, 1); text-decoration: inherit"> If a request spans 17-May-2025 to 11-Jun-2025, split it as:</span></p><ul><li style="color: rgba(255, 0, 0, 1); text-decoration: inherit"><span style="color: rgba(255, 0, 0, 1); text-decoration: inherit"><strong>App 1:</strong></span><span style="color: rgba(255, 0, 0, 1); text-decoration: inherit"> 17-May to 25-May</span></li><li style="color: rgba(255, 0, 0, 1); text-decoration: inherit"><span style="color: rgba(255, 0, 0, 1); text-decoration: inherit"><strong>App 2:</strong></span><span style="color: rgba(255, 0, 0, 1); text-decoration: inherit"> 26-May to 31-May</span></li><li style="color: rgba(255, 0, 0, 1); text-decoration: inherit"><span style="color: rgba(255, 0, 0, 1); text-decoration: inherit"><strong>App 3:</strong></span><span style="color: rgba(255, 0, 0, 1); text-decoration: inherit"> 01-Jun to 11-Jun<span style="font-size: 10pt">​</span></span></li></ul>`;

export const leaveLookups: Record<string, PmsLookupDefinition> = {
  getEmployeeInfo: {
    description:
      "Employee master record for the logged-in user: full name, department, designation, date of joining, date of birth.",
    queryable: false, // execution plumbing for now (per scope decision)
    source: {
      kind: "dataTableRow",
      dataTableId: "17052021-230725540-64fa3900-8f24-42d0-a2af-738bcb12bfb6",
      functionId: "22072021-015736955-0ac9e1b7-93b7-46b7-8bc1-56ef83448dc3",
      referencedElements: [
        "Date of Joining",
        "Department",
        "Designation",
        "DOB",
        "Full Name",
      ],
      keyReference: "Employee Code",
      keyRef: "user.employeeCode",
    },
  },
  getLeaveBalance: {
    description:
      "The logged-in employee's leave balances: entitled, used and remaining PL, plus optional-leave balance. Balances already reflect pending (unapproved) applications.",
    queryable: true,
    source: {
      kind: "dataTableRow",
      dataTableId: "31032020-103841638-57a5ed0e-0871-407b-81f4-071717296418",
      functionId: "12052020-111746884-c0034d27-e061-45cd-b830-4e52e9645b5b",
      referencedElements: [
        "Balance Leaves",
        "Entitled Leaves",
        "Optional Balance",
        "Optional Leaves Track",
        "Used Leaves",
        "Used Optional",
      ],
      keyReference: "Employee Code",
      keyRef: "user.employeeCode",
    },
  },
  getLeaveCalendar: {
    description:
      "Days the logged-in employee already has leave/WFH applications on (date + leave type). Useful to avoid double-applying.",
    queryable: true,
    source: {
      kind: "datasourceRows",
      dataSourceId: "11072022-110212853-41b30def-53c2-4d22-9703-67fefa42cd0f",
      referenceId: "11072022-111034394-31d0cbbc-afc5-4682-adf6-e968b014a035",
      outputColumns: ["Boolean", "Color", "Date", "Name"],
      conditionLabel: "Employee Code",
      keyRef: "user.employeeCode",
    },
  },
  getLeaveApplicationStatus: {
    description:
      "The employee's submitted leave applications with their current workflow status (Submitted / approved / rejected), dates, and approving manager. Supports server-side filters (status, leave type, application id, dates) and column projection — filter and project instead of fetching everything.",
    queryable: true,
    source: {
      kind: "reportGrid",
      reportId: "05072022-184910475-87bc6d9c-055c-42a0-9823-2f5e03cbe36a",
      orderByFields: "Application date desc",
      top: 50,
      // Field names, types and the status value set are verbatim from the
      // report's filter panel + a captured filtered GetGridReportData call
      // (2026-07-20). Only field types verified live (text Equal/Contains,
      // date Custom range) are exposed.
      filterableFields: [
        {
          name: "Application Status",
          type: "text",
          values: [
            "Approved",
            "CANCELLED",
            "HR ACCEPTANCE PENDING",
            "HR ACCEPTED",
            "HR Rejected",
            "HR REJECTED",
            "HR Resubmitted",
            "MANAGER APPROVAL PENDING",
            "Manager Rejected",
            "MANAGER REJECTED",
            "Manager Resubmitted",
            "Recommended",
            "Submitted",
          ],
        },
        {
          name: "Leave Type",
          type: "text",
          values: ["PL", "LOP", "Optional Leave"],
        },
        {
          name: "Application Id",
          type: "text",
          requiresValueResolution: true,
        },
        { name: "Reason", type: "text" },
        { name: "Application date", type: "date" },
        { name: "Leave Start Date", type: "date" },
        { name: "Leave End Date", type: "date" },
      ],
      // Exact row keys of the report's JSON output (captured live).
      availableColumns: [
        "Application Id",
        "Application date",
        "Application Status",
        "Leave Type",
        "Leave Start Date",
        "Leave End Date",
        "Number of Days",
        "Date Range",
        "Reason",
        "Employee Name",
        "Employee Code",
        "Manager Name",
        "Manager Email Id",
      ],
    },
  },
};

export const leaveApplicationManifest: PmsActionManifest = {
  title: "Apply for leave",
  description:
    "Submit a Quixy Leave Application (PL, LOP, or Optional Leave), routed to the manager for approval.",
  appId: APP_ID,
  appName: "Leave Application",
  serialAppElementId: "28072020-184101534-7e4d59af-1a1e-4d62-ae55-98d37e956f74",
  resolvers: {
    employee: "getEmployeeInfo",
    balance: "getLeaveBalance",
  },
  inputs: [
    {
      name: "leaveType",
      label: "Leave Type",
      type: "enum",
      options: ["PL", "LOP", "Optional Leave"],
      required: true,
      description: "Kind of leave being applied for.",
    },
    {
      name: "halfDay",
      label: "Half Day",
      type: "enum",
      options: ["Yes", "No"],
      required: true,
      description:
        "Whether this is a half-day leave. Optional Leave must be full-day.",
    },
    {
      name: "halfDayType",
      label: "Half Day Type",
      type: "enum",
      options: ["First Half", "Second Half"],
      required: false,
      description: "Which half of the day; required when halfDay is Yes.",
    },
    {
      name: "fromDate",
      label: "Leave start date",
      type: "date",
      required: true,
      description: "First day of leave, YYYY-MM-DD (IST calendar date).",
    },
    {
      name: "toDate",
      label: "Leave end date",
      type: "date",
      required: true,
      description:
        "Last day of leave, YYYY-MM-DD. Same as start date for single/half day.",
    },
    {
      name: "reason",
      label: "Reason",
      type: "string",
      required: true,
      maxLength: 2000,
      description: "Reason for the leave.",
    },
    {
      name: "contactNumber",
      label: "Contact Number",
      type: "string",
      required: false,
      maxLength: 15,
      description:
        "Contact number during leave; defaults to the number on file.",
    },
    {
      name: "acknowledgment",
      label: "Employee acknowledgment",
      type: "boolean",
      required: true,
      description:
        "The form's employee-acknowledgment checkbox. Pass true — the user's approval of this submission in the extension's approval UI is the acknowledgment; no separate confirmation should be requested in chat.",
    },
  ],
  rules: [
    {
      kind: "forceValue",
      field: "halfDay",
      when: { field: "leaveType", equals: "Optional Leave" },
      value: "No",
      message:
        "Optional Leave must be a full-day leave — half-day is not allowed. Set halfDay to No.",
    },
    {
      kind: "requiredIf",
      field: "halfDayType",
      when: { field: "halfDay", equals: "Yes" },
      message:
        "halfDayType (First Half or Second Half) is required for a half-day leave.",
    },
    {
      kind: "sameMonthRange",
      fromField: "fromDate",
      toField: "toDate",
      maxEndDay: 25,
      message:
        "Company policy: the leave range must stay within one calendar month and the end date must be on or before the 25th of that month. Split longer requests into multiple applications.",
    },
    {
      kind: "maxEffectiveDays",
      when: { field: "leaveType", equals: "PL" },
      limitRef: "balance.Balance Leaves",
      message:
        "The requested PL days exceed the remaining PL balance. Reduce the days or apply LOP.",
    },
    {
      kind: "maxEffectiveDays",
      when: { field: "leaveType", equals: "Optional Leave" },
      limitRef: "balance.Optional Balance",
      message:
        "The requested days exceed the remaining Optional Leave balance.",
    },
    {
      kind: "mustBeTrue",
      field: "acknowledgment",
      message:
        "The user must explicitly confirm the application details before submitting (employee acknowledgment checkbox).",
    },
  ],
  // Verbatim envelope of the captured live submission. null / "" / []
  // distinctions are preserved exactly as the real form sent them.
  payload: {
    "Application Id": { ref: "serial" },
    "Application Date": { ref: "derive.applicationDateUtc" },
    "Employee Id": { ref: "user.employeeCode" },
    "Full Name": { ref: "employee.Full Name" },
    "Date of Joining": { ref: "employee.Date of Joining", format: "quixyDateTime" },
    "Employee Name User": { const: null },
    DOB: { ref: "employee.DOB", format: "quixyDateTime" },
    "Employee Code": { ref: "user.employeeCode" },
    Designation: { ref: "employee.Designation" },
    "Attendance Id": { const: null },
    "Attendance Id Grid": { const: [] },
    "Rich Text": { const: RICH_TEXT_NOTE },
    "Entitled Leaves": { ref: "balance.Entitled Leaves" },
    "Used Leaves": { ref: "balance.Used Leaves" },
    "Balance Leaves": { ref: "balance.Balance Leaves" },
    "Leave Tyoe": { ref: "input.leaveType" },
    "Half Day": { ref: "input.halfDay" },
    "Half Day Type": { ref: "derive.halfDayType" },
    "Leave Dates New ds": { ref: "derive.datesTriple" },
    "No of Days": { ref: "derive.effectiveDays" },
    "Contact Number": { ref: "derive.contactNumber" },
    "Optional Balance": { ref: "balance.Optional Balance" },
    "Employee Code Leave Balance": { ref: "user.employeeCode" },
    Reason: { ref: "input.reason" },
    "File Upload if any": { const: [] },
    "Half Day number": { ref: "derive.halfDayNumber" },
    "Employee Code new ds": { ref: "user.employeeCode" },
    "Number new ds": { ref: "derive.rawDays" },
    "Proceed To Loss Of Pay": { const: "" },
    "Optional Leaves Track": { ref: "balance.Optional Leaves Track" },
    "Used Optional": { ref: "balance.Used Optional" },
    "Employee Check Box": { const: true },
    "Leave Dates New ds From Date": { ref: "derive.fromUtc" },
    "Leave Dates New ds To Date": { ref: "derive.toUtc" },
    "From Date Calculate": { ref: "derive.fromMonth" },
    "To Date Calculate": { ref: "derive.toMonth" },
    "From DateOff Calculate": { ref: "derive.fromDay" },
    "To Dateoff Calculate": { ref: "derive.toDay" },
    "Manager Name": { const: null },
    "Manager Email Id": { const: null },
    "Manager Employee Id": { const: null },
    "Date Time Stamp": { ref: "derive.nowUtcMinute" },
    "Manager Remarks": { const: "" },
    "Manager Checkbox": { const: false },
    "HR Name": { const: null },
    "HR Email Id": { const: null },
    "HR Employee Id": { const: null },
    "HR Date Time Stamp": { ref: "derive.nowUtcMinute" },
    "HR Remarks": { const: "" },
    _AppId: { const: APP_ID },
    _AppName: { const: "Leave Application" },
    _CurrentStepNumber: { const: 1 },
    _WorkSpaceId: { const: HRMS_WORKSPACE_ID },
    _OrganizationId: { const: ORGANIZATION_ID },
    _NextGroupName: { const: "Manager Approval" },
    _IsCompleted: { const: false },
    _ExternalApiIds: { const: "" },
    _InternalApiIds: { const: "" },
    _DataFunctionIds: { const: "" },
    _UserFunctionIds: { const: "" },
    _UserId: { ref: "user.userId" },
    _Username: { ref: "user.emailId" },
    _FullName: { ref: "user.fullName" },
    _UpdatedUserId: { const: "" },
    _UpdatedUsername: { const: "" },
    _UpdatedEmailId: { const: "" },
    _UserEmailId: { ref: "user.emailId" },
    // The real form sends browser geolocation here; the extension
    // intentionally sends "" (like _UpdatedLocation) since it has no
    // location permission. To be confirmed during end-to-end verification.
    _CreatedLocation: { const: "" },
    _NextStepUsers: { const: "" },
    _UpdatedLocation: { const: "" },
    _WorkFlowAction: { const: "Start - Submit" },
  },
  submitPath:
    "/api/App/SaveAppData?appName=Leave Application&users=&startDate=null&dueDate=null",
};
