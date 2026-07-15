# Agentic System Requirements

This document summarizes the capabilities an intelligent, reliable agentic system should include, based on the official OpenAI Agents SDK documentation.

The central principle is:

> Strong model + focused instructions + reliable tools + relevant context + controlled autonomy + continuous evaluation

A smart agentic system is not simply a powerful model connected to many tools. It must be able to plan, obtain trustworthy information, use tools correctly, preserve useful state, verify its work, and stop or request approval when appropriate.

## Must-have capabilities

### 1. Focused agent contract

Every agent must have:

- A specific role and responsibility
- Clear instructions and constraints
- Explicit success criteria
- Only the tools needed for its responsibility
- A defined output format

Start with one focused agent. Split it into multiple agents only when responsibilities, tools, models, guardrails, or approval policies genuinely differ.

Reference: [Agent definitions](https://developers.openai.com/api/docs/guides/agents/define-agents)

### 2. Explicit model selection

Production systems should choose models deliberately instead of relying on the SDK's current default.

- Use a high-capability model for ambiguous planning, difficult reasoning, and final synthesis.
- Use smaller models for measured, bounded tasks such as classification, extraction, and formatting.
- Select reasoning effort through evaluations rather than assuming that more reasoning is always better.
- Pin production workloads when stable and reproducible behavior is important.

OpenAI's current guidance recommends `gpt-5.6` as the flagship general-purpose default.

References: [Models and providers](https://developers.openai.com/api/docs/guides/agents/models), [latest model guidance](https://developers.openai.com/api/docs/guides/latest-model)

### 3. Grounded tools

Agents must obtain authoritative information and perform real operations through well-designed tools rather than relying entirely on model memory.

Possible tool surfaces include:

- Application function tools
- Internal APIs and databases
- File search and retrieval
- Web search
- MCP servers
- Other agents exposed as bounded tools

Tool definitions should have concise descriptions, strict parameter schemas, validated inputs, predictable outputs, timeouts, and explicit error behavior. Expose only tools relevant to the current task.

Reference: [Using tools](https://developers.openai.com/api/docs/guides/tools)

### 4. Agent execution loop

The runtime must support the complete agent loop:

1. Call the active agent's model.
2. Inspect its output.
3. Execute requested tools.
4. Return tool results to the model.
5. Process handoffs when ownership changes.
6. Stop on a final answer, approval pause, guardrail failure, runtime error, or configured limit.

Every run should enforce maximum turns, maximum tool calls, timeouts, and cancellation behavior.

Reference: [Running agents](https://developers.openai.com/api/docs/guides/agents/running-agents)

### 5. Conversation state

Choose one primary state strategy for each conversation:

- Application-managed history
- Agents SDK sessions
- OpenAI Conversations
- Response chaining

Do not accidentally combine replayed local history with server-managed state, because doing so can duplicate context. SDK sessions are a strong default when the application needs durable memory, resumable approvals, and control over storage.

Reference: [Running agents](https://developers.openai.com/api/docs/guides/agents/running-agents)

### 6. Structured outputs

Use schema-validated structured output whenever downstream code consumes an agent's result.

Structured outputs are particularly important for:

- Routing decisions
- Tool arguments
- Workflow state
- Classifications
- Plans and task lists
- Data extraction
- Approval requests

Important application decisions should not depend on parsing uncontrolled prose. Structured boundaries also reduce opportunities for malicious instructions to flow between workflow stages.

References: [Agent definitions](https://developers.openai.com/api/docs/guides/agents/define-agents), [safety in building agents](https://developers.openai.com/api/docs/guides/agent-builder-safety)

### 7. Guardrails

The system must validate behavior at the appropriate boundaries:

- Input guardrails for user requests
- Output guardrails before content leaves the system
- Tool guardrails around arguments and tool results
- Policy checks for sensitive domains and actions

Agent-level guardrails do not cover every nested tool call. Validation should be placed next to the tool that creates a side effect.

Reference: [Guardrails and human review](https://developers.openai.com/api/docs/guides/agents/guardrails-approvals)

### 8. Human approval gates

The agent must pause before consequential or difficult-to-reverse actions, including:

- Sending messages or publishing content
- Editing or deleting external data
- Purchases and financial actions
- Account or permission changes
- Shell commands with meaningful side effects
- Disclosing sensitive information
- Expanding the task materially beyond the user's request

An approval should resume the same saved run rather than starting a new conversation turn. The agent that proposes an important action should not be able to approve that action itself.

Reference: [Guardrails and human review](https://developers.openai.com/api/docs/guides/agents/guardrails-approvals)

### 9. Least-privilege security

Each agent should receive only the tools, credentials, data, and permissions required for its role.

Security requirements include:

- Keep secrets and internal dependencies in runtime context rather than model context.
- Never place untrusted user or retrieved content directly into developer instructions.
- Treat external documents, websites, tool output, and MCP content as untrusted.
- Validate structured data moving between agents and tools.
- Require approval for sensitive MCP and write operations.
- Apply tenant and user authorization inside tools, not only in prompts.
- Avoid sending unnecessary private data to models or external services.

Reference: [Safety in building agents](https://developers.openai.com/api/docs/guides/agent-builder-safety)

### 10. Tracing and observability

Every production run should be observable. Capture:

- Model calls
- Tool calls and relevant results
- Handoffs
- Guardrail outcomes
- Approval interruptions
- Errors and retries
- Latency
- Token usage and cost
- Model, prompt, tool, and workflow versions

The Agents SDK includes built-in tracing for its normal server-side execution path. Traces should be used both for debugging individual failures and for constructing evaluation datasets.

Reference: [Integrations and observability](https://developers.openai.com/api/docs/guides/agents/integrations-observability)

### 11. Evaluations

An agentic system cannot be made reliably smarter without measuring it.

Maintain representative datasets and graders for:

- Task completion
- Factual correctness and grounding
- Tool selection
- Tool argument correctness
- Handoff and routing quality
- Policy compliance
- Approval behavior
- Final-answer usefulness
- Latency and cost

Run evaluations whenever models, prompts, tools, routing logic, retrieval, or guardrails change. Use trace grading to understand why the system succeeded or failed rather than evaluating only its final answer.

References: [Evaluate agent workflows](https://developers.openai.com/api/docs/guides/agent-evals), [trace grading](https://developers.openai.com/api/docs/guides/trace-grading)

## Good-to-have capabilities

### Retrieval over trusted knowledge

Use retrieval for business documentation, policies, product knowledge, and other information that must be fresh or attributable.

A strong retrieval layer should support:

- Source and document metadata
- Freshness and tenant filters
- Query rewriting
- Hybrid semantic and keyword search where appropriate
- Relevance thresholds
- Citations or provenance in the final response
- Evaluation of retrieval quality separately from answer quality

Reference: [Retrieval](https://developers.openai.com/api/docs/guides/retrieval)

### Layered memory

Keep different kinds of memory separate:

- **Conversation state:** recent turns and unfinished work
- **User memory:** durable preferences and explicitly retained facts
- **Knowledge:** organizational documents and reference material
- **Operational state:** task progress, approvals, tool results, and created artifacts

Memory should have clear retention, deletion, privacy, and tenant-isolation policies. Do not treat the entire conversation transcript as permanent memory.

### Purposeful multi-agent orchestration

Use one of two primary patterns:

- **Agents as tools:** A manager remains responsible for the final answer and calls specialists for bounded work.
- **Handoffs:** A specialist takes ownership of the conversation or workflow branch.

Manager-style orchestration is usually preferable when specialists perform research, classification, summarization, or verification and one agent must synthesize the final result.

Reference: [Orchestration and handoffs](https://developers.openai.com/api/docs/guides/agents/orchestration)

### Independent verification

For important answers and actions, introduce an explicit verification step that checks:

- Whether required evidence was collected
- Whether tool results support the conclusion
- Whether the requested work was completed
- Whether constraints and policies were followed
- Whether unresolved uncertainty is disclosed

The verification stage should not merely repeat the original generation prompt.

### Model routing

Route tasks by measured difficulty and risk:

- Use the flagship model for planning, ambiguous intent, complex synthesis, and high-risk decisions.
- Use smaller models for high-volume, bounded transformations only after evaluations show acceptable performance.
- Escalate to a stronger model when confidence, evidence, or validation checks fail.

### Dynamic instructions and local runtime context

Instructions may depend on the authenticated user, tenant, product configuration, or workflow stage. Generate dynamic instructions through a controlled callback rather than stitching arbitrary strings together.

Keep database clients, loggers, authenticated identities, secrets, and helper functions in local runtime context. Only expose facts to the model when it needs them for reasoning.

Reference: [Agent definitions](https://developers.openai.com/api/docs/guides/agents/define-agents)

### Streaming and resumability

Streaming improves perceived responsiveness, but a streamed run is not complete until the runtime reports completion. If a stream pauses for approval or is cancelled, preserve and resume its state rather than silently starting a new turn.

Reference: [Running agents](https://developers.openai.com/api/docs/guides/agents/running-agents)

### Sandboxed execution

If an agent can run commands, install packages, execute generated code, or modify files, place that work in a sandbox with:

- Resource limits
- Network restrictions
- Filesystem boundaries
- Credential isolation
- Execution timeouts
- Auditable artifacts

### Prompt and tool versioning

Record the exact prompt, model, tool schema, policy, and workflow versions used for every trace. Versioning is essential for reproducing failures and comparing evaluation runs.

### Operational resilience

Production systems should also include:

- Retries with exponential backoff for transient failures
- Idempotency for write operations
- Circuit breakers for failing dependencies
- Rate limiting and abuse protection
- Token, cost, latency, and turn budgets
- Graceful partial-failure behavior
- Durable queues for long-running tasks
- Cancellation and timeout propagation

## Recommended initial architecture

For the current Next.js and TypeScript project, begin with the TypeScript Agents SDK and a single manager agent.

```text
User
  |
  v
Authentication and request policy
  |
  v
Manager agent - GPT-5.6
  |-- Knowledge and retrieval tools
  |-- Read-only business tools
  |-- Specialist agents as tools
  `-- Approval-gated action tools
  |
  v
Structured final response
  |
  v
Trace + evaluation data + user feedback
```

Do not begin with a large agent swarm. Add specialists only after traces and evaluations demonstrate that isolation improves quality, policy enforcement, or maintainability.

Possible later specialists include:

- **Research specialist:** Retrieves, compares, and cites evidence.
- **Planning specialist:** Produces a structured execution plan.
- **Action specialist:** Performs explicitly authorized operations.
- **Verification specialist:** Independently checks evidence and outcomes.

## Implementation priority

Build the system in this order:

1. Define the use case, success criteria, risk boundaries, and evaluation examples.
2. Implement one focused agent with explicit model selection.
3. Add a small set of authoritative, read-only tools.
4. Add structured outputs and application-level validation.
5. Add durable conversation state.
6. Add tracing, version metadata, and failure reporting.
7. Create evaluation datasets and graders.
8. Add retrieval for domain knowledge.
9. Add approval-gated action tools.
10. Add specialist agents only where evaluation results justify them.
11. Optimize model routing, prompts, latency, and cost.

## Core design rule

The system should know:

- When it has enough evidence to answer
- When it needs to use a tool
- When it should verify its work
- When it should ask for clarification
- When it requires human approval
- When it must stop

Maximum autonomy is not the same as maximum intelligence. A genuinely smart agentic system combines capable reasoning with evidence, controls, observability, and a measurable improvement loop.

## Official OpenAI references

- [Agents SDK overview](https://developers.openai.com/api/docs/guides/agents)
- [Agent definitions](https://developers.openai.com/api/docs/guides/agents/define-agents)
- [Models and providers](https://developers.openai.com/api/docs/guides/agents/models)
- [Running agents](https://developers.openai.com/api/docs/guides/agents/running-agents)
- [Orchestration and handoffs](https://developers.openai.com/api/docs/guides/agents/orchestration)
- [Guardrails and human review](https://developers.openai.com/api/docs/guides/agents/guardrails-approvals)
- [Results and state](https://developers.openai.com/api/docs/guides/agents/results)
- [Using tools](https://developers.openai.com/api/docs/guides/tools)
- [Integrations and observability](https://developers.openai.com/api/docs/guides/agents/integrations-observability)
- [Evaluate agent workflows](https://developers.openai.com/api/docs/guides/agent-evals)
- [Trace grading](https://developers.openai.com/api/docs/guides/trace-grading)
- [Safety in building agents](https://developers.openai.com/api/docs/guides/agent-builder-safety)
- [Retrieval](https://developers.openai.com/api/docs/guides/retrieval)
- [Latest model guidance](https://developers.openai.com/api/docs/guides/latest-model)
