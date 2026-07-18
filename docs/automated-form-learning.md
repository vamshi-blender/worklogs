# Automated form learning — a Claude Code × Playwright playbook

A generic, repeatable method for an AI agent driving a real browser (Playwright MCP or
similar) to **learn an unknown web form well enough to reproduce it programmatically** —
its data dependencies, field model, business rules, write contract, and navigation. It is
written for low-code/metadata-driven business apps (the kind where forms, dropdowns, and
workflows are defined as data on the server), but the principles generalise to most CRUD
web apps.

The deliverable of a learning run is a **per-form analysis document** (+ optionally a
machine-readable field map) that a downstream system can turn into an executable spec.

---

## 0. The core insight that shapes everything

> **Most of a form's behaviour is invisible to the network. Only two moments talk to the
> server: initial load and final submit. Everything in between — selecting a value,
> toggling an option, picking a date, recomputing a derived field — is client-side logic
> driven by a definition the server already sent.**

This single observation dictates the whole strategy:

| To learn… | …watch | …because |
|---|---|---|
| the **schema + rules** | the **load** response (the form definition) | the server ships the full spec up front |
| the **data dependencies** (dropdown sources, auto-fill) | the **load-time XHR calls** | prerequisite lookups fire here |
| **dependent / conditional behaviour** (show/hide/enable, computed fields) | the **DOM**, not the network | these are local rules; they fire no request |
| the **write contract** (the real payload) | the **submit** request body | this is the only authoritative output |

A naive recorder that only diffs network traffic will **miss every conditional field and
every calculation**, because they never hit the wire. You must combine **network capture**
(load + submit) with **DOM observation** (interactions).

---

## 1. Prerequisites & ground rules

- **Use a non-production / sandbox tenant** whenever possible. A learning run *submits real
  data*; the final write creates records and may trigger notifications, approvals, emails,
  or downstream automation.
- **Treat the final submit as irreversible and outward-facing.** Fill everything, then
  confirm with a human before the first real write of a new form, and have a
  cleanup/withdraw plan. Once the write contract is captured, prefer **replay against the
  API** over re-driving the UI for subsequent experiments.
- **Capture the auth model once.** Note how the app authorises requests (bearer token in a
  header, cookie, etc.) and where the token lives. Record what user context is carried *in*
  the token vs fetched via a separate call — it changes which "user" lookups are real
  dependencies.
- **Save large responses to files and parse with scripts.** Form definitions can be
  hundreds of KB; don't try to eyeball them. Pull specific fields with a JSON query.
- **Snapshot for refs, screenshot for state.** Use the accessibility snapshot to get stable
  element references to click/type; use screenshots to confirm visual state (calendars,
  highlights, disabled styling) that the a11y tree may not convey.

---

## 2. The learning procedure (phases)

### Phase A — Load & capture the definition
1. Navigate to the form; wait for it to fully render (title/content settle).
2. Dump all non-static network requests. Identify and **save the form-definition call**
   (the big one describing sections, fields, rules, workflow). In metadata-driven apps this
   *is* the manifest — parse it instead of inferring.
3. From the definition, extract for **every** field: internal key, display label, type,
   default, mandatory flag, hidden/disabled flags, and any attached validations/rules.

> **Key ≠ label.** The payload uses an internal field name (which may be **misspelled** or
> legacy); the UI shows a friendly label. Always capture **both** and map them — the
> downstream payload must use the literal internal key, never the label.

### Phase B — Classify the load-time data calls
List every data XHR fired on load and classify each into a small set of **generic
primitives**. Expect to converge on only a handful for the whole application. Typical axes:
- **Option-list vs dependent-value**: does the call return *keys* (to populate a dropdown)
  or *values* (to auto-fill fields once a key is known)?
- **By source type**: same operation may exist against different backends (e.g. a "data
  table" vs a "datasource"); the request shape differs but the role is the same.

Record, for each: the endpoint, the request shape, the **identifiers/GUIDs** that
parameterise it, the key it's filtered on, and the columns it returns. These GUIDs all come
from the definition — which means a generic executor can reissue any of them.

### Phase C — Explore interactively (drive every branch)
This is where conditional logic is discovered. **A single happy-path run is not enough** —
it will silently miss fields that only appear under certain choices.
1. For each **enum/radio/dropdown**: open it, record its options, and note whether opening
   it fired a network call (static enum in the definition) or a fetch (an option resolver).
2. **Select each distinct value** and observe DOM deltas: fields that appear/disappear,
   become enabled/disabled, get auto-set, or change other fields' allowed values.
3. For **derived fields** (totals, counts, durations): change the inputs and record the
   computation rule (e.g. how a duration maps to a number, how a flag halves a quantity).
4. For **pickers** (dates, references): note constraints (ranges, min/max, blocked values)
   and whether the picker is restricted or merely *annotated* with existing data.
5. **After each interaction, re-check the network.** Confirm whether it was client-side
   (the common case) or triggered a fetch (a real dependency to model).

Maintain a matrix: *control → each value → resulting visible/enabled field set + computed
outputs*. That matrix is the conditional-rule model.

### Phase D — Differential submit (vary inputs across runs)
Submit the form **multiple times with deliberately varied inputs** — different option
selections, and critically **different conditional branches** (e.g. each enum value, the
on/off state of any flag that gates other fields). Capture each submit payload.

Then **diff the payloads** to classify every field:

| Bucket | Tell-tale in the diff | Example role |
|---|---|---|
| **User input** | varies exactly with what was entered/selected | the actual choices |
| **Computed** | varies but is a deterministic function of inputs | totals, day-of-month, encoded dates |
| **Auto-filled (resolved)** | constant for a given key, matches a value seen in a load response | profile/master data pulled by a lookup |
| **Constant** | identical across all runs | app/workspace ids, fixed flags, embedded notes |
| **Workflow / identity control** | identical-ish; step number, next-stage name, action verb, user id | the routing envelope |
| **Runtime-generated** | varies every run, matches nothing typed and nothing in any response | new record ids, timestamps |

> Add the **runtime-generated** bucket explicitly. A diff-only classifier will otherwise
> mislabel fresh ids/timestamps as "user input" because they change every run.

### Phase E — Determine the mandatory set (it has layers)
"Required" is not one list. Separate at least:
1. **Statically required now** — fields with a required-validation that are visible at the
   current step.
2. **Conditionally required** — required only under a rule (e.g. a sub-field that's
   mandatory only when a parent flag is set). These come from the **rules**, not the static
   validation list — reading validations alone misses them.
3. **Required at a later workflow step** — fields marked required but hidden until a future
   stage; they belong to that stage, not this submit.
4. **API-plumbing** — control fields the endpoint needs to route/persist that aren't "form
   fields" at all (app id, workspace id, org id, user id, action verb, step number).

Then, to find the **true API minimum**, **replay** the write with fields stripped one group
at a time and observe what the API rejects. (Do this against the API, not the UI, and only
in a sandbox.)

### Phase F — Map the workflow (if multi-step)
If the write payload carries workflow control (a current-step number, a next-stage name, a
completed flag, an action verb), the form is one step of a longer process. Record the
**action verb** for this transition; later stages (approve/reject/return) are typically the
**same record id** re-submitted with a **different verb** and additional fields populated.
Drive a later stage to confirm whether it's the same write endpoint or a different one.

### Phase G — Record navigation & access path
For each form/report, capture **how a user reaches it** (see §4). This is cheap to collect
during a run and invaluable for user manuals / knowledge bases.

---

## 3. The field-classification taxonomy (reuse across forms)

Every payload field should end a learning run tagged with:
- **source**: `user_input` | `computed` | `resolved` | `constant` | `workflow` | `runtime`
- **key** (internal) and **label** (display)
- **type** and any **enum options** (and whether the enum is static or resolver-backed)
- **required**: `always` | `conditional(<rule>)` | `later_step` | `no`
- **visibility/enabled rule** (if conditional)
- **transform** (if computed/encoded — e.g. timezone offset, decimal split, date→component)
- for `resolved`: which **lookup primitive + key** produces it
- for `workflow`: its role (step, verb, stage, id)

This taxonomy is the bridge between "what we observed" and "an executable spec".

---

## 4. Navigation & menu mapping (for KБ / user manuals)

While learning a form, also record where it sits in the app's navigation so the knowledge
base can tell a human (or the agent) how to get there.

For each screen capture:
- **URL** and any stable **id** in it (app id / report id).
- **Menu path** as a breadcrumb: `Workspace/Module → Section → (Sub-section) → Item`, and
  which item is highlighted when the screen is open.
- **Screen kind**: data-entry **form** vs **report/list** vs dashboard.

> **Watch for a common trap:** the *form* that creates a record and the *report* that lists
> those records often live in **different menu branches** under the same module. A user
> manual must point to both, separately — "to apply, go here; to check status, go there."
> Capture the create-path and the view/status-path as distinct entries.

Suggested table to keep per module:

| Screen | Kind | Menu path | URL / id |
|---|---|---|---|
| <create form> | form | Module → Section → Item | `…/addrecord/<appId>` |
| <status/list> | report | Module → OtherSection → Item | `…/report/<reportId>` |

---

## 5. Tooling notes (Playwright-MCP specifics)

- **Network**: list requests filtered to the API host/path; fetch a single request's
  request-body / response-body by index; **save big bodies to files** (within an allowed
  root) and parse with a script.
- **DOM**: take an accessibility **snapshot** to get element refs; target a sub-tree to keep
  snapshots small. When refs churn after re-render, re-snapshot or fall back to a CSS/text
  selector (e.g. by `title`/`aria-label`).
- **State**: **screenshot** to verify visual-only state (calendar highlights, disabled
  controls, selected ranges).
- **Multi-tab / multi-screen**: list tabs and select by index to compare a form with its
  report side by side.
- **Stability**: after navigation, explicitly wait for the page to settle before
  snapshotting; pickers and async sections render late.

---

## 6. Pitfalls checklist

- [ ] Did you **drive every conditional branch**, or only the happy path? (Missing branches
      = missing fields/rules.)
- [ ] Did you separate **client-side** interactions from **real fetches** by re-checking the
      network after each action?
- [ ] Are you using the **internal field keys** (possibly misspelled) and not the labels?
- [ ] Did you capture **encoding transforms** (timezone, number formatting) rather than the
      display values?
- [ ] Did you classify **runtime-generated** fields, not fold them into user input?
- [ ] Is "mandatory" broken into **static / conditional / later-step / API-plumbing**?
- [ ] Did you note the **workflow action verb** and whether more steps follow?
- [ ] Did you record the **navigation path** for both the create form and its status/report?
- [ ] Did you confirm a real write only in a **sandbox**, with consent, and a cleanup plan?
- [ ] For the **true API minimum**, did you plan a **replay** (strip-and-POST) rather than
      assuming the full UI payload is all required?
