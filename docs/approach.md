# User:
Context: 
I have an AI assistant named Donna that performs actions in our internal Project Management Software (PMS) through API calls.
The architecture currently works like this:

* A user gives Donna an instruction in natural language.
* Donna determines the intended action.
* Donna generates the API payload.
* A tool executes the API request.
Example:
If I tell Donna:
"Create a bug for login timeout issue with high priority"
Donna understands the intent, prepares the payload, and uses the tool to create the issue.
This approach works well.
Current Problem
For some PMS functionalities, implementation becomes extremely tedious.
Example: Worklog creation
To implement this, I had to:

1. Ask Claude Code to observe browser Network Tab activity while I manually created a worklog.
2. Explain each step and API call.
3. Identify:
   * Which API calls happen in sequence
   * Which values stay constant
   * Which values must be fetched dynamically from the system
   * Which values should come from the user's prompt
4. Write logic to reproduce the same flow programmatically.
This took a disproportionate amount of effort for just one feature.
The Bigger Challenge
Worklog is only one functionality.
Donna eventually needs to handle many PMS actions such as:

* Create issues
* Change issue status
* Close issues
* Apply leave
* Check my worklogs
* Approve requests
* Submit forms
* Update records
* And other workflow actions
Most of these workflows are not a single API call.
Typically they involve:

1. Multiple pre-API calls to gather required metadata
2. Resolving IDs, defaults, permissions, available options, workflow states, etc.
3. Building the final payload
4. Executing the action API
5. A task can even include multi step workflows
For example:
To submit a worklog, Donna may first need to:

* Fetch project details
* Get issue metadata
* Resolve worklog configuration
* Fetch user context
* Get allowed values/options
* Then construct the final payload
My New Approach
Instead of manually explaining every workflow, I plan to let Claude Code:

* Operate the pre-production PMS application
* Perform actions itself using fabricated/test data
* Observe network requests
* Infer the workflow
* Understand required dependencies
* Generate documentation that becomes Donna's operational knowledge
Essentially, Claude would learn the application's behavior and prepare reusable knowledge for Donna.
My Core Question
How should I architect and group the mandatory pre-API calls required for final actions and how to maintain the payload for each API call?
I want a scalable approach.
Instead of hardcoding every workflow manually, I want a system where Donna can understand:

* What prerequisite data is needed for an action
* Which API calls are mandatory
* Which values are constant
* Which values should be dynamically fetched
* Which values come from user input
* How to compose the final payload
What I am looking for
Please suggest an architecture or abstraction for handling these pre-action dependency chains.
Questions I want answered:

1. How should these pre-API calls be modeled?
   * Pipelines?
   * Dependency graphs?
   * Action planners?
   * Capability maps?
2. How can Donna dynamically discover or reuse these workflows instead of hardcoding everything?
3. How should knowledge be stored?
   * JSON schemas?
   * Workflow DSL?
   * Tool metadata?
   * Playbooks?
4. How can I reduce the amount of "vibe coding" and manual explanation needed for every new PMS feature?

Project Context (how my system is currently working):

```
The AI's Tools
The agent (app/api/chat/route.ts:382-463) has 3 active tools:

1. create_worklog (lines 363–380)
The action tool. Takes only 5 fields validated by Zod:

issueId — regex Q[A-Z]{2}-\d+ (e.g. QKA-53833)
worklogDate — YYYY-MM-DD
hours — positive decimal, max 24
category — one of 207 hardcoded enum values (lines 72–208)
description — 1–2000 chars
On execute, it just pushes the input into a worklogActions[] array (line 370) — it doesn't call any API itself. It returns { status: "queued_for_extension_execution" } to the AI.

2. get_excel_metadata (lines 385–405)
Returns workbook structure: sheet names, row/column boundaries, and limits. The AI calls this first before reading data to know which sheet to target.

3. get_range_as_csv (lines 406–426)
Takes sheetName + A1 range (e.g. A1:I39), returns that slice of the Excel file as CSV text. Capped at 120 rows × 20 columns.

There is also a disabled 4th tool read_excel_data (lines 429–461, commented out) — replaced by the more targeted get_range_as_csv.

The Full Flow

1. User types message in Chrome extension popup
        ↓
2. Extension POSTs to /api/chat (route.ts:266)
   Body: { messages[], currentDate, timeZone, excelFile?, excelAccess?, debugTools }
        ↓
3. Backend formats a single prompt string (route.ts:528-565):
   - Injects current date + timezone
   - Injects Excel workbook context (or "no file selected")
   - Appends the full chat transcript
        ↓
4. OpenAI Agent runs (gpt-5.5 model)
   - May call get_excel_metadata → then get_range_as_csv to read worklog data
   - Infers the 5 worklog fields from conversation + Excel
   - DOES NOT call create_worklog yet (review rule, line 249)
   - Presents the 5 fields to user for approval
        ↓
5. User approves ("looks good", "go ahead", etc.)
        ↓
6. Agent calls create_worklog tool
   - Payload generated HERE by the AI: { issueId, worklogDate, hours, category, description }
   - Tool pushes to worklogActions[] — no HTTP call made
        ↓
7. SSE stream sends "done" event (line 496-505)
   { type: "done", reply: "...", worklogAction: {...}, worklogActions: [...] }
        ↓
8. Extension receives worklogActions array
   - Checks for Quixy Bearer token (from localStorage of open Quixy tab)
   - If missing: shows login gate, queues actions
   - If present: calls saveWorklog() for each action
        ↓
9. saveWorklog() in extension makes 3 preparatory API calls:
   a. GET  /api/User/GetUserDetails          → userId, email, name
   b. POST /api/Report/GetViewResult         → issue metadata (projectId, recordId, summary, assignee)
   c. POST /api/Datasource/GetReferencedDataSourceData → employee department
        ↓
10. PAYLOAD CONSTRUCTED in extension (popup.js ~lines 675-729)
    Merges AI output (issueId, date, hours, category, description)
    with fetched metadata (projectId, recordId, assignee, userId, dept, etc.)
    ~50 fields total
        ↓
11. POST to Quixy API:
    https://quixyhomeapi.kwixee.co.in/api/App/SaveAppData?appName=Worklog
    Headers: Authorization: Bearer <token>
    Body: the ~50-field payload
        ↓
12. Extension shows confirmation with record ID
Key Design Point
The AI only generates the minimal 5-field payload (issueId, worklogDate, hours, category, description). All the PMS metadata (project IDs, record IDs, workflow fields, user IDs, auth tokens) is fetched and merged by the Chrome extension at execution time. This keeps the backend stateless and ensures auth tokens never touch the server.
```

& 
```Step 1 — What the AI generates (the "AI payload")
The AI's create_worklog tool accepts exactly 5 fields (route.ts:210-222):
Field	How AI determines it
issueId	Taken directly from the user (e.g. QKA-53833), only uppercased
worklogDate	Resolved from "today/yesterday" using injected currentDate, or read from Excel
hours	Parsed from user input or Excel; converted to decimal (e.g. 1h 30m → 1.5)
category	Mapped from user's wording to one of 207 hardcoded enum values
description	Written by AI from the user's stated task or inferred from an Excel row
The AI does not call any Quixy API. It just queues these 5 fields in memory and sends them back to the Chrome extension in the SSE "done" event.
Step 2 — Pre-API calls the extension makes (before the final save)
extension/popup.js:659-673 — saveWorklog() fires 3 API calls first:
Call 1 — Get issue details (popup.js:793-833)
POST /api/Report/GetViewResult?skip=0&take=100&viewId=<viewId>
Tries up to 3 views in order:
currentPmsViewId — the view ID of whatever page the user has open in Quixy
MY_ISSUES_VIEW_ID — hardcoded
MANAGE_ISSUES_VIEW_ID — hardcoded
For each view it first tries with an issueId filter, then without if not found. Returns the row that has matching Issue Id, extracting: Project Id, Record Id, Issue Id, Issue Type, Assignee, Summary.
Call 2 — Get logged-in user (popup.js:670)
GET /api/User/GetUserDetails
Returns: UserId, EmailId, FirstName, LastName
Call 3 — Get employee department (popup.js:895-913)
POST /api/Datasource/GetReferencedDataSourceData
Body: { DataSourceId: "09122025-...", DataSourceReferenceId: "09122025-...", 
        OutputColumns: "Department,Official Email Id",
        DataSourceReferenceConditions: [{ ColumnName: "Official Email Id", Value: <email> }] }
Returns: Department, Official Email Id. The DataSourceId and DataSourceReferenceId are hardcoded GUIDs.
Step 3 — Full payload construction (popup.js:675-729)
The final payload merges AI values + fetched values + hardcoded constants:
From AI (5 fields):
Category ← category
Log Hours / Hours / Minutes / Billable Hours / var Log Efforts ← split from hours
Log Date / Current Date / var Worklog Date ← worklogDate
Log Description ← description
var Issue Id ← issueId
From issue API call:
var Project Id, var Issue Record Id, var Issue Type, var Current Assignee, var Summary
From user API call:
var Logged In User, _UserId, _Username, _FullName, _UserEmailId
From employee API call:
Department, Official Email Id
Hardcoded constants:
Action: "Add Worklog" — always fixed
"Cut Off Time": "2022-12-28T05:30:00.00" — fixed legacy timestamp
"Is On Time": "Yes" — always yes
_AppId: WORKLOG_APP_ID — 07022021-220225896-...
_WorkSpaceId: WORKSPACE_ID — 03012021-192624661-...
_OrganizationId: ORGANIZATION_ID — 29102019-093434548-...
_AppName: "Worklog", _CurrentStepNumber: 1, _NextGroupName: "Done", _IsCompleted: true, _WorkFlowAction: "Start - Submit"
Several empty/null fields: Report, Watchers List, Worklog Date Grid, _ExternalApiIds, etc.
Step 4 — The final API call (popup.js:732-738)
POST https://quixyhomeapi.kwixee.co.in/api/App/SaveAppData?appName=Worklog&users=&startDate=null&dueDate=null
Headers:
  Authorization: Bearer <token extracted from Quixy tab's localStorage>
  Content-Type: application/json
Body: <the full ~30-field payload above>
Response: { Success: true, Data: "<recordId>" } — the extension shows this record ID to the user as confirmation.
```

# AI:
This is a well-trodden problem in agent design, and the good news is your instinct is right: the answer is **not** to make Donna smarter at runtime, but to make the knowledge declarative. Here's the architecture I'd recommend, mapped directly onto your Quixy/worklog example.

## Core idea: Action Manifests + a Resolver Registry

Separate the system into three layers:

**1. Action Manifests (declarative, data not code).** Each PMS capability ("create worklog", "apply leave", "close issue") is a JSON/YAML document describing: the user-input slots, the prerequisite lookups, the constants, and a payload template. No imperative code per action.

**2. Resolver Registry (small, shared, code).** Your pre-API calls are far less unique than they appear. Looking at your worklog flow, the three prep calls are really three *generic* resolvers: `getUserContext()`, `lookupRecordByField(viewIds, field, value)`, `datasourceLookup(dsId, refId, conditions, outputColumns)`. Apply-leave and approve-request will almost certainly reuse these same primitives with different parameters. You write a resolver once; manifests reference it by name with parameters. Expect to converge on maybe 6–10 resolvers total for the whole PMS, not one per feature.

**3. A deterministic Executor (the interpreter).** The extension stops containing per-feature logic like `saveWorklog()`. Instead it has one generic engine: load manifest → run resolvers (topologically, in dependency order) → render payload template → execute final call. Adding a new feature means adding a manifest file, zero new executor code.

## What a manifest looks like

Your entire Step 2–4 flow becomes:

```yaml
action: create_worklog
version: 3
intent_description: "Log work hours against an issue"

user_inputs:                      # what Donna's tool schema exposes
  issueId:   { type: string, pattern: "Q[A-Z]{2}-\\d+" }
  worklogDate: { type: date }
  hours:     { type: number, min: 0, max: 24 }
  category:  { type: enum, source: "datasource:worklog_categories" }  # see below
  description: { type: string, maxLen: 2000 }

resolvers:
  user:     { use: getUserContext }
  issue:    { use: lookupRecordByField
              with: { viewIds: [$currentView, MY_ISSUES, MANAGE_ISSUES],
                      field: "Issue Id", value: "{{input.issueId}}" }
              outputs: [ProjectId, RecordId, IssueType, Assignee, Summary] }
  employee: { use: datasourceLookup
              with: { dsId: "09122025-...", refId: "09122025-...",
                      conditions: [{ col: "Official Email Id", value: "{{user.EmailId}}" }],
                      outputs: [Department, "Official Email Id"] }
              dependsOn: [user] }      # explicit edge → execution order

constants:
  Action: "Add Worklog"
  Cut Off Time: "2022-12-28T05:30:00.00"
  _AppId: "07022021-..."
  _WorkFlowAction: "Start - Submit"
  # ...the rest of your hardcoded block

payload_template:                  # the final SaveAppData body
  Category: "{{input.category}}"
  Log Hours: "{{derive.splitHours(input.hours).hours}}"
  var Project Id: "{{issue.ProjectId}}"
  _UserId: "{{user.UserId}}"
  Department: "{{employee.Department}}"
  # ...etc

execute:
  method: POST
  url: "/api/App/SaveAppData?appName=Worklog"
  success: { path: "Data", as: recordId }
```

The dependency graph you asked about (question 1) falls out of this for free: `dependsOn` plus `{{x.y}}` references in resolver params define the DAG. You don't need a workflow engine like Temporal — a topological sort over 3–6 nodes is twenty lines of code. Pipelines are too rigid (resolvers like `user` and `issue` can run in parallel); a full planner is overkill at execution time.

## Where the AI sits (and where it doesn't)

This is the most important design decision: **use the LLM at two points only, and keep it out of the middle.**

- **Runtime (Donna):** her job shrinks to intent classification + slot filling. The manifests' `user_inputs` blocks *are* her tool schemas — you can autogenerate the Zod definitions from manifests, so adding a manifest automatically gives Donna a new tool. She never sees resolver calls, GUIDs, or the 50-field payload. This keeps her fast, cheap, and reliable, and preserves your nice property that tokens/metadata never touch the backend.
- **Authoring time (Claude Code):** this is where your "Claude operates the app and learns it" idea lands. Its output artifact is *a manifest*, not code. That's what makes the approach scalable — the manifest is reviewable, diffable, versionable, and testable, unlike vibe-coded glue logic.

## Automating manifest authoring (your question 4)

The trick that kills most of the manual explanation work is **differential recording**:

1. Claude Code performs the same action in pre-prod **2–3 times with deliberately varied inputs** (different issue, different hours, different user if possible), capturing HAR traces each time.
2. It then diffs the final payloads across runs. The classification you currently do by hand becomes mechanical: fields identical across all runs → **constants**; fields that vary exactly with what was typed → **user inputs**; fields that vary but match values seen in earlier responses in the same trace → **resolved fields** (and the matching response tells you *which* prerequisite call produces them, giving you the resolver wiring automatically).
3. Claude Code maps each resolved field's source call onto an existing resolver in the registry if the URL/shape matches, or flags it as a new resolver candidate for your review.
4. It emits a draft manifest + a test script that replays the manifest in pre-prod and asserts the response matches a manual run.

Steps 2–3 are the part that took you "disproportionate effort" for worklog, and they're almost entirely automatable. Your human role becomes reviewing a generated manifest and approving a PR, not reverse-engineering network tabs.

A few practical refinements worth building in:

**Move enums out of code.** Your 207 hardcoded categories will drift. If categories come from a Quixy datasource, make the enum a resolver-backed lookup that's cached and refreshed periodically — note the `source: datasource:...` hint in the example above. Same for workflow states, leave types, etc.

**Version manifests and validate on save.** Quixy will change its API shape under you. Each manifest carries a version; your test harness replays every manifest against pre-prod nightly (or on demand) and diffs the constructed payload against a fresh recording. When a field classification breaks, you regenerate just that manifest rather than debugging extension code.

**Multi-step workflows (approve request, transitions)** fit the same model — a manifest just gets multiple `execute` steps, each able to reference outputs of previous steps (`{{step1.recordId}}`). Resist the urge to support conditionals/loops until a real action forces it; most PMS workflows are linear with branching only at the *intent* level, which Donna already handles.

**Storage:** a git repo of manifests is genuinely the right answer over a database — you get review, history, rollback, and CI testing for free. The extension fetches the manifest bundle at startup (or bundles it at build time).

So, answering your four questions directly: (1) model pre-calls as named resolvers composed into a per-action dependency graph declared in a manifest; (2) Donna doesn't discover workflows at runtime — Claude Code discovers them at authoring time via differential HAR recording, and Donna just gets a new auto-generated tool; (3) store knowledge as versioned JSON/YAML manifests with a template language, in git; (4) the vibe-coding disappears because the per-feature deliverable changes from "code + explanation" to "a generated, machine-checkable manifest."

If you want, I can sketch the executor's interpreter loop (topo-sort + template rendering, ~100 lines for your extension) or the differential-diff algorithm Claude Code would use to classify fields.

# User:
Sounds cool. But I have a doubt. While filling the form manually, I'm not entirely prepared about the data to fill. I decide what data to fill after seeing the data available. for example, if i want to choose an assignee, first we need to check the available options and then choose one. But the approach how can we search for this data? i mean, the AI can't see the resolver data and I think the assignee (only for this example) might comes under resolver. For example I tell the AI all the details and then ask, who assignees are available, then the AI should tell the list. i will not do single shot prompting, it mostly will be conversation with the AI and will gradually come to the verdict on what data to use for the final API payload.

# AI:
Good catch — and this doesn't break the architecture, it just reveals that you have **two kinds of resolvers**, and I collapsed them into one:

1. **Execution resolvers** — data the user never cares about (record IDs, GUIDs, `_WorkSpaceId`, department lookup). These stay hidden, run at execution time, deterministic. Everything from my previous answer.
2. **Option resolvers** — data the user makes *decisions* with (assignees, sprints, leave types, statuses an issue can transition to). These must be visible to Donna mid-conversation, because the conversation *is* the form-filling process.

The fix is to make option resolvers queryable by Donna through one generic tool, driven by the same manifests.

## Declare options on the input slot

Extend the manifest's `user_inputs` so a slot can say where its choices come from:

```yaml
user_inputs:
  issueId:
    type: string
    pattern: "Q[A-Z]{2}-\\d+"

  assignee:
    type: reference
    options:
      use: getProjectMembers            # a resolver, same registry
      with: { projectId: "{{issue.ProjectId}}" }
      requires: [issueId]               # can't list assignees until we know the issue
      display: ["FullName", "Role"]     # what Donna shows the user
      value: "UserId"                   # what actually goes into the payload
      searchable: true
```

Two things to notice. First, the option resolver lives in the same resolver registry — `getProjectMembers` is probably reused by "create issue", "reassign issue", "approve request". Second, `requires` captures the conversational dependency you described: if the user asks "who can I assign this to?" before mentioning an issue, the tool returns a structured "I need the issue first" and Donna naturally asks for it. That's exactly how a human fills the form — some dropdowns are empty until earlier fields are set.

## One generic tool, not N tools

Don't generate a tool per dropdown — Donna gets a single tool:

```
query_options(action, field, search?, filters?)
→ { options: [{ value, label, meta }], total, truncated }
```

The runtime looks up the manifest, checks `requires` against the slots filled so far, runs the option resolver, and returns a **compact** list (id + label, paginated, server-side search if the list is big — you don't want 400 employees flooding the context window). Because it's manifest-driven, every new action you author automatically gets conversational option-browsing for free; no new tools, no new code.

## The conversation becomes slot-filling over a draft

Donna's runtime keeps a **draft state** per pending action — basically the form, partially filled:

```
User:  I want to log work on QKA-53833... actually first, who's it assigned to and who else is on that project?
Donna: → query_options(create_worklog, assignee)        [issueId already known → resolver runs]
       "It's currently assigned to Priya. Other members: Arjun (Dev), Kavya (QA), Ravi (Lead)..."
User:  Hmm, what categories do we have for code review work?
Donna: → query_options(create_worklog, category, search="review")
       "There's 'Code Review', 'Peer Review – Design', 'PR Review & Merge'."
User:  Code Review, 2 hours, today. Go with that.
Donna: [presents the 5-field draft for approval — your existing review rule, unchanged]
```

When the user picks an option conversationally, Donna fills the slot with the `value` (the ID), while talking to the user in `label` terms. A nice side benefit: at queue time the runtime can validate the chosen value against the option resolver's output, so Donna can never hallucinate an assignee ID — it either came from a `query_options` result or it's rejected.

## What changes vs. what doesn't

The execution path is untouched: once slots are full and approved, the executor runs the hidden execution resolvers, renders the template, fires the final call. The draft/option layer sits purely on the conversational side.

For your Claude Code authoring pipeline, this adds one classification step: when diffing recordings, a field whose value matches an entry from an earlier *list-shaped* response (a dropdown-population call like `GetViewResult` returning many rows, or a datasource returning options) is a candidate **option-backed user input**, not an execution resolver. The tell is in the UI behavior too — if Claude Code had to click a dropdown and the click triggered the fetch, that fetch is an option resolver and the field is user-facing. That's mechanically detectable from the HAR + DOM interaction log, so the manifests come out of authoring with `options` blocks already drafted.

So the mental model becomes: **manifests describe a form** — its fields, where each field's choices come from, what's hidden plumbing, and how the form submits. Donna is the conversational form-filler; the executor is the submit button.

# User:
can i use the option resolver (eg: `getProjectMembers`) separately? for example if i want to see who all are there in the project, I will generally open a new issue creation page and look at the list of assignees, as there is no option in the PMS for me to look at all the project members.  One more example is, I use the create issue screen to check what are the available active sprints. Can I do this with our approach too? I do not want to trigger any other API/execution or option resolver  (as much as possible), i only want to run  the API/resolver to fetch the available sprints for a said project (resolvers needed to get the project details should be run as needed). What do you say?

# AI:
Yes — and this is actually the architecture telling you it wants a small promotion. Right now option resolvers are *attached* to an action's input slot (`assignee` belongs to `create_worklog`). But what you're describing is using a resolver with no action in mind at all: "just show me the sprints." So the clean move is to make resolvers **first-class, independently addressable capabilities**, and let action slots merely *reference* them.

## Promote resolvers to a queryable catalog

Define each resolver once, on its own, with its own dependency chain:

```yaml
# resolvers/getActiveSprints.yaml
resolver: getActiveSprints
description: "Active sprints for a project"
inputs:
  projectId: { type: string }
resolves:
  - need: projectId
    from: { use: resolveProject, with: { name: "{{input.projectName}}" } }
    when: projectId is absent          # only runs if not already provided
fetch:
  method: POST
  url: "/api/Report/GetViewResult"
  body: { ... }
output:
  list: true
  display: ["SprintName", "StartDate", "EndDate", "Status"]
  value: "SprintId"
```

The `assignee` slot in a manifest then just points at it:

```yaml
assignee:
  options: { use: getProjectMembers, with: { projectId: "{{issue.ProjectId}}" } }
```

Same resolver, two entry points. No duplication.

## Donna gets a second, action-free tool

Alongside `query_options(action, field, ...)`, add a sibling that takes no action context:

```
lookup(resolver, params?, search?)
→ { items: [{ value, label, meta }], total, truncated }
```

So "what sprints are active on the Caddie project?" becomes `lookup("getActiveSprints", { projectName: "Caddie" })`. Donna isn't pretending to start a create-issue flow; she's calling a named data capability directly. This mirrors exactly what you do as a human — you abuse the create-issue screen as a lookup because the PMS has no dedicated view, but Donna doesn't have to inherit that limitation. The resolver *is* the dedicated view you wish existed.

## Your two constraints, handled by design

**"Run only the resolver I asked for."** Because the resolver is self-contained, calling `lookup` runs that resolver and nothing else — no payload template, no execute step, none of the action's *other* resolvers. The hidden execution resolvers (`getUserContext`, the department datasource lookup, the GUIDs) belong to the action's execute path, which `lookup` never touches. You get exactly the sprint fetch, full stop.

**"Run dependency resolvers as needed."** That's the `resolves` + `when` block. If the user already gave a projectId, the `resolveProject` step is skipped; if they gave a name, it runs *just* enough to get the ID, then fetches sprints. The chain is the minimal closure needed to satisfy the one thing you asked for — never the whole action graph. So `getActiveSprints` with a name triggers at most two calls (resolve project → fetch sprints), and with an ID, exactly one.

## One thing to decide deliberately

Some resolvers are cheap and side-effect-free (sprints, members, categories) — safe to expose via `lookup` freely. A few might be expensive or sensitive. So put a flag on the resolver:

```yaml
resolver: getActiveSprints
queryable: true        # may be called standalone by lookup()
cacheable: 300s        # browsing the same list repeatedly shouldn't refetch
```

Mark the pure lookups `queryable: true`; leave execution-only resolvers (anything that constructs IDs for a write) `queryable: false` so Donna can't invoke them out of context. Caching matters here because conversational browsing means the user will ask "show me sprints" then "ok now members" then "wait, sprints again" — you don't want three round-trips.

For your Claude Code authoring pipeline, this costs nothing extra: every option-backed field it already discovers (the dropdown-population fetches) is *automatically* a `queryable: true` resolver. You're just deciding, at review time, "is this list-fetch also useful as a standalone lookup?" — and for sprints, members, categories, the answer is almost always yes. The same recordings that built your action manifests have already mapped these.

So the mental model sharpens to three tiers: **lookups** (browse anything, action-free, minimal dependency chain) → **slot options** (the same lookups, scoped to a form field) → **execution resolvers** (hidden plumbing, never browsable). Donna moves freely in the top tier during conversation, commits choices into slots in the middle tier, and the executor runs the bottom tier only at submit.

# User:
will/should the option resolvers be reused across manifests? because, in different forms of the application, the resolvers might look similar, but underneath, there might be a small change. For example, in issue creation we are pulling the list of user who are assigned to the project, and in another screen where HR needs to give awards, only list of employees who didn't get award for the last 3 months should be shown. In both the places we are pulling employees, but the list is different and we cannot reuse them just because they are fetching employees. But in some cases we might need reusable resolvers. Does this change the architecture?

# AI:
Your intuition is exactly right, and the principle that resolves it is: **the unit of reuse is the query contract, not the entity it returns.** "Fetches employees" is not a contract — it's a noun. `getProjectMembers` and `getAwardEligibleEmployees` return the same *kind* of thing but answer different questions, apply different business rules, and would break each other if merged. They are two resolvers. So no, this doesn't force a redesign — but it does sharpen the model by making explicit a layer that was previously implicit, and by setting a deliberate policy on *where* reuse lives.

## Reuse lives at the transport layer, not the business layer

Split what I earlier called "resolvers" into two tiers:

**Transport primitives (Layer A).** The raw mechanics of talking to Quixy: `datasourceLookup(dsId, refId, conditions, outputs)`, `getViewResult(viewId, filters)`, `getUserDetails()`. These are dumb, business-free, and *heavily* reused — you'll converge on maybe 5–8 for the entire PMS, mapping to Quixy's generic endpoint families. This is where DRY pays off.

**Named resolvers (Layer B).** A business capability = a primitive + bound parameters + specific filters + an output contract + an honest name. `getProjectMembers` and `getAwardEligibleEmployees` are both Layer B. They might share the *same* Layer-A primitive underneath, but they are distinct capabilities.

So your two employee lists reuse the mechanics and diverge on the meaning:

```yaml
# resolvers/getProjectMembers.yaml
resolver: getProjectMembers
inputs: { projectId: { type: string } }
via:
  use: getViewResult
  with:
    viewId: PROJECT_MEMBERS_VIEW
    filters: [{ col: "Project Id", value: "{{input.projectId}}" }]
output: { list: true, display: ["FullName","Role"], value: "UserId" }

# resolvers/getAwardEligibleEmployees.yaml
resolver: getAwardEligibleEmployees
inputs: { asOfDate: { type: date } }
via:
  use: datasourceLookup            # could even be the same primitive
  with:
    dsId: "..."; refId: "..."
    conditions:
      - { col: "Last Award Date", op: "<", value: "{{derive.minusMonths(input.asOfDate,3)}}" }
    outputs: ["EmployeeName","EmployeeId"]
output: { list: true, display: ["EmployeeName"], value: "EmployeeId" }
```

The "no award in 3 months" rule lives *inside* the resolver that owns it. That's the whole point — the manifest field for the award form just says `options: { use: getAwardEligibleEmployees }` and never has to know about the 3-month logic. Encapsulating the business rule in a named resolver is what stops it leaking upward.

## The heuristic: parameter vs. new resolver

When you hit a "small change underneath," decide with this test — **is the varying thing a caller's data input, or an embedded business rule?**

Reuse the same resolver when the only differences are *values the caller supplies* (a different `projectId`), the endpoint and filter *structure* are identical, and the output contract matches.

Mint a new resolver when any of these differ: the endpoint/view/datasource; the filter logic encodes a rule the other caller would never want to toggle; the output columns or `value` field differ; or the caching/permission profile differs.

The practical day-to-day version is the **honest-name test**: if you can't give both variants the same truthful name, they're different resolvers. "Project members" and "award-eligible employees" fail the test → two resolvers. This is precisely your instinct ("we cannot reuse them just because they fetch employees"), now stated as a rule.

The gray zone is "same endpoint, one extra filter." Resist the temptation to build a mega-resolver `getEmployees(filters)` and push the filter up to the caller — that creates a leaky abstraction where every caller must understand flags that only matter to some of them, and one caller's change risks breaking another. Err toward a distinct named resolver, and let Layer-B proliferate. Concentrate reuse at Layer A, where the contract is purely mechanical and stable.

## Why proliferation is cheap

Two reassurances, because "lots of resolvers" sounds expensive and isn't:

**Donna pays nothing at runtime.** She never *chooses* between `getProjectMembers` and `getAwardEligibleEmployees`. The manifest slot names exactly one. Resolver count is an authoring-time concern, not runtime cognitive load — her tool surface stays `query_options` + `lookup`, regardless of how many resolvers exist behind them.

**Churn stays localized.** Layer-A primitives change only when Quixy changes its generic endpoints (rare). Layer-B resolvers change when a business rule changes (and only the affected one). When HR redefines award eligibility to 6 months, you edit one resolver and its replay test, touching nothing else.

## What this means for Claude Code's authoring pass

One added rule for the differential recorder: **match at the primitive level, mint at the business level.** When it records the award screen and sees a fetch whose endpoint+filters don't byte-match any existing resolver, it should reuse the Layer-A primitive it recognizes (`datasourceLookup`) but draft a *new* Layer-B resolver rather than wiring the field to `getProjectMembers` just because both return people. Near-matches (same endpoint, extra condition) get flagged for your review with a one-line "reuse `X`, or new resolver?" prompt — that judgment is the small human residue you can't fully automate, and it's exactly the call you'd want to make consciously anyway.

So the honest summary: this adds one explicit layer (transport primitives) beneath resolvers and one policy (reuse the query contract, fork on business rules). The manifest, executor, and Donna's runtime are unchanged. It's a refinement that makes the system *more* scalable, not a rethink — and it formalizes the very distinction you already sensed was missing.