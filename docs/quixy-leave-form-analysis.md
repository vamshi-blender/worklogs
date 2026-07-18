# Quixy "Leave Application" form — complete reverse-engineering notes

> Captured 2026-06-28 by driving the real form (Playwright) and recording every network
> call, then submitting **three** real applications — **PL** (half-day), **LOP**
> (full-day, multi-day), **Optional Leave** (full-day, single) — to diff their payloads
> and observe dependent-field behaviour. This is the first fully worked example of the
> differential-recording idea in [approach.md](approach.md): one form mapped end to end —
> load APIs, interaction APIs, field model, mandatory rules, dependent/conditional rules,
> calculation rules, and the final write payload for every branch.

| | |
|---|---|
| **App name** | Leave Application |
| **appId** | `05062020-161245045-ec6b6933-5899-4b4f-b51f-d273fe01e07d` |
| **Open form** | `GET https://quixyhome.kwixee.co.in/addrecord/<appId>` |
| **Final write** | `POST https://quixyhomeapi.kwixee.co.in/api/App/SaveAppData?appName=Leave Application&users=&startDate=null&dueDate=null` |
| **Workflow** | Start → **Submit** → *Manager Approval* → *HR* (multi-step) |
| **Records created in this session** | `VM/LAP/30065` (PL ½), `VM/LAP/30066` (LOP), `VM/LAP/30067` (Optional) — all pending Manager Approval |

---

## 0. Headline findings (the important stuff)

1. **The form definition IS the manifest.** Quixy returns the entire form spec — fields,
   types, mandatory flags, dropdown enums, conditional show/hide/disable rules,
   calculation rules, and the workflow — as one JSON document. We do not have to infer it.
2. **Only two moments touch the network: page load and Submit.** Every interaction in
   between (select leave type, toggle half-day, pick dates, compute "No of Days") is
   **100% client-side**, driven by rules embedded in that definition. Confirmed across all
   three leave types — selecting a value or a date range fired **zero** API calls.
3. **The data layer is just 4 generic endpoints** (section 3), parameterised by GUIDs that
   live in the definition. These are the "Layer A transport primitives" from approach.md.
4. **Mandatory-ness is per-workflow-step and partly rule-driven**, not a single static
   list (section 5).
5. **Leave balance reflects *pending* applications.** After submitting the ½-day PL,
   reopening the form showed Availed = 0.5 / Balance = 13 immediately — before any
   approval. So the balance data table counts submitted-but-unapproved leave.

---

## 1. Load-time API inventory

Ignoring auth / branding / translation / menu boilerplate, the form-relevant calls on a
fresh load are:

| Call | Method | Purpose |
|------|--------|---------|
| `App/GetApp?appId=…` | GET | the app/form definition |
| `App/GetAppWithPermissions` | POST | **the form definition scoped to the user** — the ~227 KB doc with `AppSections`, `Rules`, `Workflow`, `WorkflowButtons`. This is the authoritative schema. |
| `App/GetNextSerialNumber?appElementId=…&appId=…&organizationId=…` | GET | generates **Application Id** = `VM/LAP/30065` (server-side counter) |
| `DataTable/GetDataTableDataByReference` ×5 | POST | **option lists** — valid key values for data-table-backed fields (autocomplete source) |
| `DataTable/GetReferencedDataTableData` ×2 | POST | **dependent values** — given a key, return its columns (auto-fill) |
| `Datasource/GetReferencedDataSourceConditionData` ×2 | POST | option keys from a *datasource* (datasource equivalent of the option-list call) |
| `Datasource/GetReferencedDataSourceData` ×1 | POST | datasource rows given conditions — here the leave/holiday **calendar** |
| `App/GetAppComments`, `App/GetPaymentGateWayDetails`, `App/TransactionCountforGuestUser` | — | side panels / gating, not form data |

**Auth.** Every call carries `Authorization: Bearer <JWT>` taken from the SPA. The JWT
embeds the user context the worklog flow fetches separately: `UserId`, `EmailId`,
`OrganizationId`, `TimeZone: India Standard Time`, `DateFormat: dd/MM/yyyy`,
`UserRoles: Employee`. So on this form there is **no** separate `GetUserDetails` call —
identity comes from the token.

---

## 2. The data sources this form binds to

The generic calls above resolve to four logical sources, all keyed on the logged-in
user's **Employee Code = E1469**:

| Logical source | GUID (`DataTableId` / `DatasourceId`) | Primitive | Key → returns |
|---|---|---|---|
| **Employee master** | `17052021-…64fa3900` | B (referenced) | Employee Code → Date of Joining, Department, Designation, DOB, Full Name |
| **Leave balance** | `31032020-…57a5ed0e` | B (referenced) | Employee Code → Balance/Entitled/Used Leaves, Optional Balance, Optional Leaves Track, Used Optional |
| **Attendance / comp-off** | `13032020-…a3747833` | A (option list) | Attendance Id → returns `VM/COMP/…` ids |
| **Leave calendar** | `11072022-…41b30def` (Datasource) | D (rows) | Employee Code → list of `{Date, Name=leave type, Color, Boolean}` — the user's existing PL / Optional / WFH days |

The **leave calendar** (D) is what colours days in the date picker. We observed the days
we had just applied for (Jun 30, Jul 6–7) appear **green** when reopening the picker —
i.e. the calendar marks days that already have an application.

---

## 3. The 4 generic data primitives ("Layer A")

Every data fetch is one of four shapes. A/C return **keys** (dropdown options); B/D return
**values** (dependent fields / rows). Given the GUIDs (all in the definition), a generic
executor can issue any of these.

### A. `DataTable/GetDataTableDataByReference` — *option list from a data table*
```jsonc
// request
{ "DataTableId":"…", "DataTableFunctionId":"…",
  "ReferencedElements":"col,col,…",
  "DataTableDataReferenceDataDTOs":[{ "ReferenceName":"Employee Code", "IsFocused":true, "Value":"" }] }
// response  (Value:"" → full list; Value:"E14" → filtered)
[ { "AppData":"E1001" }, { "AppData":"E1002" }, … ]   // key column only
```

### B. `DataTable/GetReferencedDataTableData` — *dependent columns for a chosen key*
```jsonc
// request  (Value = the selected key)
{ "DataTableId":"…", "DataTableFunctionId":"…",
  "ReferencedElements":"Department,Designation,…",
  "DataTableDataReferenceDataDTOs":[{ "ReferenceName":"Employee Code", "IsFocused":true, "Value":"E1469" }] }
// response
[[ {"Name":"Department","Value":"Product"}, {"Name":"Designation","Value":"Business Analyst"}, … ]]
```
This is what **auto-fills** the Basic Employee Info + Leave Balance sections.

### C. `Datasource/GetReferencedDataSourceConditionData` — datasource version of (A)
```jsonc
{ "DatasourceId":"…", "DataSourceReferenceId":"…",
  "DataSourceCollectionConditionLabelName":"Employee Code", "Value":"" }
// → [ { "AppData":"E1469" }, … ]
```

### D. `Datasource/GetReferencedDataSourceData` — datasource version of (B), returns rows
```jsonc
{ "DataSourceId":"…", "DataSourceReferenceId":"…",
  "OutputColumns":"Boolean,Color,Date,Name",
  "DataSourceReferenceConditions":[{ "DataSourceCollectionConditionLabelName":"Employee Code", "Value":"E1469" }] }
// → [[ {"Name":"Date","Value":"2025-08-24T18:30:00"}, {"Name":"Name","Value":"PL"}, {"Name":"Color","Value":"#008000"}, … ], … ]
```

---

## 4. Field model (every field on the form)

`req` = has a `RequiredField` validation in the definition · `hid` = Hidden / IsHiddenField ·
`dis` = Disabled / IsDisable.

| Label | Payload key | Type | req | hid | dis | Notes |
|---|---|---|---|---|---|---|
| Application Id | `Application Id` | Autogenerate | ✔ | | ✔ | server serial (`GetNextSerialNumber`) |
| Application Date | `Application Date` | Date | | | ✔ | = today |
| Employee Id | `Employee Id` | TextBox | ✔ | | | from user context |
| Employee Name | `Full Name` | TextBox | | | ✔ | auto-fill (employee master) |
| Date of Joining | `Date of Joining` | Date | | | ✔ | auto-fill |
| Employee Name User | `Employee Name User` | TextBox | | ✔ | ✔ | hidden helper |
| DOB | `DOB` | Date | | ✔ | ✔ | auto-fill, hidden |
| Employee Code | `Employee Code` | DataTableRef | | ✔ | ✔ | the join key (= E1469) |
| Designation | `Designation` | TextBox | | ✔ | ✔ | auto-fill |
| Attendance Id (+ Grid) | `Attendance Id`, `Attendance Id Grid` | DataTableRef / Grid | | ✔ | | comp-off linkage |
| Rich Text | `Rich Text` | RichText | | | | **constant** policy note (see §6) |
| Entitled Leaves | `Entitled Leaves` | Number | | | ✔ | auto-fill |
| Availed Leaves | `Used Leaves` | Number | | | ✔ | auto-fill |
| Leave Balance | `Balance Leaves` | Number | | | ✔ | auto-fill |
| **Leave Type** | **`Leave Tyoe`** *(sic)* | DropDown | ✔ | | | **user**; static enum `PL │ LOP │ Optional Leave` |
| **Half Day** | `Half Day` | Radio | ✔ | | | **user**; `Yes │ No` |
| Half Day Type | `Half Day Type` | DropDown | | | | **user**, *conditional* (see §7); enum `First Half │ Second Half` |
| **Leave Dates(From & To)** | `Leave Dates New ds` | DateRange | ✔ | | | **user** |
| No of Days | `No of Days` | Number | | | | **computed** |
| Contact Number | `Contact Number` | PhoneNumber | | | | prefilled, editable; `PhoneNumber` validation |
| Optional Balance | `Optional Balance` | Number | | | ✔ | auto-fill |
| Employee Code Leave Balance | `Employee Code Leave Balance` | DataTableRef | | ✔ | | join key for balance table |
| **Reason** | `Reason` | TextArea | ✔ | | | **user** |
| File Upload if any | `File Upload if any` | FileUpload | | | | optional |
| Half Day number | `Half Day number` | Number | | ✔ | | computed (0.5 / "") |
| Employee Code new ds | `Employee Code new ds` | DateRange | | | | helper |
| Number new ds | `Number new ds` | Number | | ✔ | | computed = raw day count |
| Proceed To Loss Of Pay | `Proceed To Loss Of Pay` | Radio | | ✔ | | hidden; did **not** surface in any of our 3 runs (likely shown only when PL requested > balance) |
| Optional Leaves Track | `Optional Leaves Track` | Number | | ✔ | | auto-fill |
| Used Optional | `Used Optional` | Number | | ✔ | | auto-fill |
| **(acknowledgment)** | `Employee Check Box` | CheckBox | ✔ | | | **user**; must be ticked |
| Leave Dates New ds From/To Date | `…From Date`,`…To Date` | Date | | | | computed (UTC ISO of range ends) |
| From/To Date Calculate | `From Date Calculate`,`To Date Calculate` | Calculate | | ✔ | | computed = **month number** of from/to |
| From/To DateOff Calculate | `From DateOff Calculate`,`To Dateoff Calculate` | Calculate | | ✔ | | computed = **day-of-month** of from/to |
| Manager Name/Email/Employee Id | `Manager …` | Text/Email | | ✔ | | filled at **Manager Approval** step |
| Date Time Stamp | `Date Time Stamp` | DateTime | | ✔ | | submit timestamp |
| Manager Remarks / Manager Checkbox | `Manager Remarks`,`Manager Checkbox` | Text/CheckBox | (✔) | ✔ | | `Manager Checkbox` is `RequiredField` **but hidden** → required only at the Manager Approval step |
| HR Name/Email/Employee Id/Date/Remarks | `HR …` | Text/Email/DateTime | | ✔ | | filled at **HR** step |

---

## 5. Mandatory fields — the precise answer

There are **three** distinct layers of "required", and they must not be conflated:

**(a) Statically required at the Submit step** (`RequiredField` validation, currently visible):
`Application Id` (auto), `Employee Id` (auto), **`Leave Tyoe`**, **`Half Day`**,
**`Leave Dates New ds`**, **`Reason`**, **`Employee Check Box`**.

**(b) Conditionally required (rule-driven, NOT a static validation):**
`Half Day Type` — required only when `Half Day = Yes`. Its UI asterisk comes from a
business rule, so reading `AppElementValidations` alone misses it; you must read the
`Rules` block.

**(c) Required at a *later* workflow step:** `Manager Checkbox` is `RequiredField` but
hidden at Submit; it becomes required when the record reaches Manager Approval. ⇒
**mandatory-ness is per-step**, gated by `_WorkFlowAction` / current step.

**Not captured by the form-element list at all — but the API needs them:** the control
block `_AppId`, `_AppName`, `_WorkSpaceId`, `_OrganizationId`, `_UserId`,
`_WorkFlowAction`, `_CurrentStepNumber`, `_NextGroupName`, `_IsCompleted`. These route and
persist the record.

**Still unverified:** the *true API minimum* (which of the ~70 fields can be omitted and
still get `Success:true`). Knowing that requires **replay testing** (strip a field → POST
→ observe) — not yet done.

---

## 6. Business rules observed

1. **Half-day ⇒ 0.5.** `Half Day = Yes` sets `No of Days = 0.5` and `Half Day number = 0.5`.
2. **Conditional field.** `Half Day Type` is shown only for half-day leaves.
3. **Optional Leave forbids half-day.** Selecting `Leave Type = Optional Leave` **disables
   the Half Day radio and locks it to "No"** → `Half Day Type` and `Half Day number` stay
   empty. (A conditional *disable* rule keyed on leave type.)
4. **Range always required, even for one day.** Apply stays disabled until both Start and
   End are set; for a single/half day you click the same date twice.
5. **Month-boundary policy — advisory, computed, but NOT blocked in the UI.** A red
   instructional `Rich Text` note says *"end date must not go beyond the 25th of the same
   month and cannot extend into the next month; split the request."* The picker let us pick
   Jun 30 and submit anyway. BUT the hidden `…Date Calculate` (month) and `…DateOff
   Calculate` (day-of-month) fields exist **precisely to let a workflow/validation enforce
   this** (e.g. require `From Date Calculate == To Date Calculate` and `DateOff ≤ 25`). So:
   not enforced on this form, likely enforced downstream — Donna should treat it as a hard
   pre-check before submit.
6. **Optional Leave is count-limited, not date-limited.** The picker is the same free
   calendar for Optional Leave; eligibility is governed by `Optional Balance` (= 2 left),
   not by restricting selectable dates. The balance is **not** decremented on the form —
   that happens server-side / in the workflow.
7. **Balance counts pending applications** (see §0.5).

---

## 7. Payload diff across the three leave types

Same ~70-field envelope every time; only the marked rows differ. (`From Date` shown in the
UTC = IST−5:30 form actually sent.)

| key | PL ½-day `30065` | LOP full multi `30066` | Optional single `30067` |
|---|---|---|---|
| `Leave Tyoe` | `PL` | `LOP` | `Optional Leave` |
| `Half Day` | `Yes` | `No` | `No` *(locked)* |
| `Half Day Type` | `First Half` | `""` | `""` |
| `Half Day number` | `0.5` | `""` | `""` |
| `Leave Dates New ds` | `["30-Jun-2026","30-Jun-2026",["30-Jun-2026"]]` | `["06-Jul-2026","07-Jul-2026",["06-Jul-2026","07-Jul-2026"]]` | `["13-Jul-2026","13-Jul-2026",["13-Jul-2026"]]` |
| `No of Days` | `0.5` | `2` | `1` |
| `Number new ds` | `1` | `2` | `1` |
| `…From Date` (UTC) | `2026-06-29T18:30:00.00` | `2026-07-05T18:30:00.00` | `2026-07-12T18:30:00.00` |
| `…To Date` (UTC) | `2026-06-29T18:30:00.00` | `2026-07-06T18:30:00.00` | `2026-07-12T18:30:00.00` |
| `From / To Date Calculate` | `6 / 6` | `7 / 7` | `7 / 7` | ← **month** of from/to |
| `From / To DateOff Calculate` | `30 / 30` | `6 / 7` | `13 / 13` | ← **day-of-month** of from/to |
| `Application Id` | `VM/LAP/30065` | `VM/LAP/30066` | `VM/LAP/30067` |

Everything else is identical across runs, and classifies as:

- **From user:** `Leave Tyoe`, `Half Day`, `Half Day Type`, `Leave Dates New ds`,
  `Reason`, `Employee Check Box`, `Contact Number`.
- **Computed client-side:** `No of Days`, `Half Day number`, `Number new ds`,
  `…From/To Date`, `…Date Calculate` (month), `…DateOff Calculate` (day), `Date Time Stamp`.
- **Auto-filled from data tables:** `Date of Joining`, `DOB`, `Designation`, `Full Name`,
  `Employee Code`, `Entitled Leaves`, `Used Leaves`, `Balance Leaves`, `Optional Balance`,
  `Optional Leaves Track`, `Used Optional`.
- **Constants from the definition:** `Application Id` (serial), `Rich Text` note, `_AppId`,
  `_AppName`, `_WorkSpaceId`, `_OrganizationId`, the empty `_*ApiIds`/`_*FunctionIds`.
- **Workflow + identity:** `_CurrentStepNumber:1`, `_NextGroupName:"Manager Approval"`,
  `_IsCompleted:false`, `_WorkFlowAction:"Start - Submit"`, `_UserId`, `_Username`,
  `_UserEmailId`, `_FullName`; Manager/HR fields null at submit.

### Submit response shape
```jsonc
{ "Success":true, "StatusCode":0, "Data":"<new _AppDataId>",
  "AppData":"{ …full record incl. _id, _CreatedDate, _WorkFlowStatus:true… }" }
```

---

## 8. Gotchas a payload builder MUST respect

- **Misspelled keys are load-bearing.** The real key is `Leave Tyoe`, not "Leave Type".
  Use the literal `FieldName`s from the definition; never "correct" them.
- **Timezone: dates are stored UTC = IST − 5:30.** Jul 13 (IST) → `2026-07-12T18:30:00.00`;
  Application Date 28/06 → `2026-06-27T18:30:00.00`. Get this wrong and the leave lands a
  day off.
- **Dual date representation.** `Leave Dates New ds` keeps a *local* triple
  `[from, to, [all-days-in-range]]` while `…From/To Date` carry the UTC ISO form. Both go
  in the payload. `No of Days` (effective, 0.5 for half day) ≠ `Number new ds` (raw day
  count, 1).
- **`_WorkFlowAction:"Start - Submit"`** is the verb that drives the transition. Later steps
  (approve / reject) will use *different* verbs on the same record id.
- **Conditional rules change which fields are populated** (`Half Day Type`/`number` empty
  for full-day and forced-empty for Optional). A builder must run the rules, not just fill
  slots.

---

## 9. Mapping to the Donna architecture (approach.md)

- **Manifest authoring shortcut:** parse `GetAppWithPermissions` → fields, enums, mandatory
  flags, conditional show/hide/disable rules, calc rules, and the workflow come for free.
  HAR diffing is then only needed to (a) confirm fetch ordering and (b) classify each
  data-table call as option-list (A/C) vs auto-fill (B/D).
- **Resolvers = the 4 primitives**, parameterised by definition GUIDs.
  - *Option resolvers* (Donna may browse): A, C — e.g. list employee codes, comp-off ids.
  - *Execution/dependent resolvers* (hidden auto-fill): B, D.
- **Static enums** (Leave Type, Half Day Type) are **not** resolvers — inline in the
  definition; Donna reads them straight from the manifest, no call.
- **Calculation rules** (½ ⇒ 0.5; month/day extraction; UTC conversion) are the `derive.*`
  helpers approach.md flagged — port them as a fixed, tested library, because the server
  trusts whatever the client computes.
- **Conditional disable/visibility** (Optional ⇒ no half-day) must be modelled, or Donna
  could build an invalid payload (e.g. half-day Optional Leave).
- **Soft business rule** (≤25th / no month-cross) → Donna enforces as a pre-submit check
  using the `…Calculate` fields, since the API/UI won't reject it here.
- **Multi-step workflow** is explicit in the payload (`_NextGroupName`, step number, action
  verb) — approve/reject are later transitions on the same record id with different
  `_WorkFlowAction`.

---

## 9a. Navigation & menu position (for KB / user manuals)

Two related screens live in **different branches** of the same module — a user manual must
point to each separately (one to *apply*, one to *check status*).

| Screen | Kind | Menu path | URL |
|---|---|---|---|
| **Leave Application** (the form) | data-entry form | **Leave Attendance → Requisitions → Leave Application** | `…/addrecord/05062020-161245045-ec6b6933-5899-4b4f-b51f-d273fe01e07d` |
| **Leave Applications Status** | datasource report (list) | **Leave Attendance → Status of Applications → Leave Applications** | `…/datasources/datasourcereports/05072022-184910475-87bc6d9c-055c-42a0-9823-2f5e03cbe36a` |

Sibling items observed in the same branches (useful map of the module):
- Under **Requisitions**: WFH Engg Status Tracker, Add Balance to WFH, WFH Plan, Work From
  Home, Approving Authority, **Leave Application**, On Duty Application, Missed Punch.
- Under **Status of Applications**: Missed Punch Application Status, Comp Off Application
  Status, **Leave Applications**, On Duty Applications.

### The status report screen
`Leave Applications Status` is a **datasource report** — a grid (group / filter / export /
column-chooser / pagination), not a form. Columns: Application date, Application Status,
Employee Name, Manager Email Id, Leave Type, Leave Start Date, Leave End Date, Number of
Days, Application Id. Newly submitted leaves appear here with status **"Submitted"** and the
approver's email (the *Manager Approval* assignee). This is the read-side counterpart to the
form's write-side — and a natural standalone **lookup** ("what's the status of my leaves?").

> **Balance reflects pending leaves — confirmed for optional balance too.** After submitting
> the Optional Leave, reopening the form showed **Optional Balance = 1** (was 2) and a fresh
> `Application Id` (`VM/LAP/30068`). So submitting decrements the relevant balance in the
> backing data table immediately, before any approval.

---

## 10. Open questions for the next forms

1. Is the `Rules` block in `GetAppWithPermissions` machine-readable enough to
   auto-generate the calc/conditional logic (½⇒0.5, Optional⇒disable half-day, month/day
   extraction)? → needs a pass over `AppSections[].AppElements[].*` + a top-level `Rules`.
2. What do **Manager Approval / HR** steps look like as API calls — same `SaveAppData` with
   a different `_WorkFlowAction`, or a separate endpoint? (Drive an approval next.)
3. When does the hidden **`Proceed To Loss Of Pay`** radio surface? Hypothesis: when PL
   requested exceeds `Balance Leaves`. (Test by requesting > 13 PL days.)
4. How are large **option lists** (all employees) paginated / searched server-side? Needed
   before Donna browses big lists into context.
5. Confirm the **true API-minimum** payload via replay (strip fields → POST).
