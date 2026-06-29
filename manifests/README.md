# Manifests — declarative capability layer (NOT wired in yet)

These files encode what was learned about the Quixy **Leave Application** form
(see [`../docs/quixy-leave-form-analysis.md`](../docs/quixy-leave-form-analysis.md))
as the declarative artifacts described in
[`../docs/approach.md`](../docs/approach.md): **transport primitives**, **named
resolvers**, a **derive helper spec**, and an **action manifest**.

> **Status: artifacts only.** Nothing here is loaded by the AI (`app/`) or executed by
> the extension (`extension/`) yet. They are reviewable, diffable data — a target shape —
> not running code. Wiring an interpreter/executor to them is a later step.

## Layout

```
manifests/
  primitives.yaml                 # Layer A — generic Quixy transport endpoints (reused everywhere)
  derive.yaml                     # spec for the client-side calculation helpers (derive.*)
  resolvers/                      # Layer B — business capabilities (one file each)
    getNextApplicationId.yaml
    getEmployeeMaster.yaml
    getLeaveBalance.yaml
    getLeaveCalendar.yaml
    getEmployeeCodeOptions.yaml
    getAttendanceIdOptions.yaml
  actions/
    create_leave_application.yaml # the action: inputs, resolvers, constants, rules, payload, workflow
```

## How the layers relate

- **Action** (`actions/create_leave_application.yaml`) declares user inputs, references
  resolvers + constants + derive helpers, and renders the final `SaveAppData` payload.
- **Resolvers** (`resolvers/*.yaml`) are named business lookups. Each binds a **primitive**
  to specific GUIDs + a key + an output contract.
- **Primitives** (`primitives.yaml`) are the ~6 generic Quixy endpoints. The whole PMS is
  expected to reuse these; resolvers differ only in parameters.
- **Derive** (`derive.yaml`) is the fixed library of pure functions the payload needs
  (timezone conversion, date-part extraction, day counting). These run client-side; the
  server trusts their output.

## Template / reference syntax (placeholder convention, for a future interpreter)

| Token | Means |
|---|---|
| `{{input.X}}` | a user-supplied field |
| `{{identity.X}}` | logged-in user context (from the auth token) |
| `{{resolver.NAME.FIELD}}` | output of a resolver |
| `{{derive.fn(args)}}` | a calculation helper from `derive.yaml` |
| `{{const.X}}` | a constant from the action's `constants` block |

## Provenance & confidence

Every GUID, field name, and constant here was captured live on 2026-06-28 from three real
submissions (`VM/LAP/30065/66/67`). Items not fully verified are marked `# UNVERIFIED`
in place (e.g. weekend handling in day-count, the source of `Employee Id`/`Contact Number`
prefill, balance-vs-days enforcement). Keys mirror the server **exactly**, including the
misspelling `Leave Tyoe`.
