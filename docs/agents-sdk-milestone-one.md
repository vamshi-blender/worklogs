# Agents SDK Milestone One

Milestone one connects the Donna Chrome extension to a server-side OpenAI Agents SDK runner in the root Next.js application.

## Implemented

- One focused Donna agent running only on the server
- Explicit model selection through `OPENAI_MODEL`
- Incremental NDJSON response streaming
- Current-conversation continuity through OpenAI response chaining
- Chat transcript and response ID persistence in `chrome.storage.local`
- Configurable backend URL persisted in `chrome.storage.sync`
- A server-side `get_server_time` tool
- A client-side `get_current_page_context` tool
- Explicit approval before the extension reads page content
- Fixed client-tool allowlist and argument validation
- Resumable agent runs for client-side tool execution
- Cancellation, error, retry, and new-chat behavior
- Agents SDK tracing through its default server-side tracing path
- Production API disablement until authentication and durable pending-run storage exist

## Local setup

1. Copy `.env.example` settings into `.env.local` without replacing the existing OpenAI key unless rotating it.
2. Run the root server:

   ```bash
   npm run dev
   ```

3. Build the extension:

   ```bash
   cd chrome-extension
   npm run build
   ```

4. Load `chrome-extension/dist` as an unpacked extension.
5. Open Donna Settings and copy the displayed extension origin.
6. Add that exact origin to `ALLOWED_EXTENSION_ORIGINS` in `.env.local`, for example:

   ```text
   ALLOWED_EXTENSION_ORIGINS=chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef
   ```

7. Restart the root development server after changing `.env.local`.
8. Keep the Donna backend setting at `http://localhost:3000`.

Multiple extension origins can be supplied as a comma-separated list.

## HTTP protocol

### Start or continue a turn

`POST /api/chat`

```json
{
  "message": "Summarize the page I am viewing.",
  "previousResponseId": "resp_optional"
}
```

### Resume a browser tool

`POST /api/chat/resume`

```json
{
  "runId": "server_generated_uuid",
  "toolCallId": "model_tool_call_id",
  "approved": true,
  "result": {
    "url": "https://example.com",
    "title": "Example Domain",
    "selectedText": "",
    "visibleText": "Example content",
    "truncated": false
  }
}
```

Both endpoints return newline-delimited JSON events. The extension consumes:

- `response.started`
- `response.delta`
- `client_tool.request`
- `response.paused`
- `response.completed`
- `response.error`

The extension never receives serialized Agents SDK run state.

## Security boundaries

- `OPENAI_API_KEY` remains in the root server environment.
- Browser tools are implemented as fixed local functions. The server cannot send JavaScript for the extension to execute.
- Page content requires per-call approval.
- Page text is limited to 12,000 characters and tool results are size-limited again on the server.
- Cross-origin requests require an exact extension-origin allowlist entry.
- The production route returns `503` unless `ENABLE_PRODUCTION_CHAT=true`.

`ENABLE_PRODUCTION_CHAT` must remain false until the API has user authentication, authorization, rate limiting, and durable pending-run storage. The current pending-run map is intentionally suitable only for local development because Vercel instances do not share process memory.

## Deferred

- Long-term memory across separate chats
- Server-side durable chat history
- Multiple specialist agents
- Write-capable browser tools
- Production authentication and rate limiting
- Durable storage for interrupted agent runs
- Cross-device conversation synchronization
