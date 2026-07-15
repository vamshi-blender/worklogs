# Agents SDK integration — handoff context

## Architecture

- Root (`/`): Next.js app, deployed to Vercel. This is where the OpenAI Agents SDK (`@openai/agents`, TypeScript) must be implemented — as a server-side API route (e.g. `app/api/chat/route.ts`). Never in the extension.
- `chrome-extension/`: separate Vite/CRXJS package, its own `package.json`, built independently and loaded as an unpacked extension. It has no backend of its own — it's a pure client that calls the Next.js API over HTTP.
- Why the SDK can't live in the extension: it needs `OPENAI_API_KEY` at runtime, and extension bundles are fully unpackable by anyone — a key shipped there is a public key. The SDK is designed for a server you control.

## Dev vs. prod connectivity

- Local dev: run the Next.js app from the project root (`npm run dev`, not from inside `chrome-extension/`) → serves at `http://localhost:3000`.
- Prod: same Next.js app deployed on Vercel at its own domain.
- The extension must be able to point at either, via a setting in its UI (no rebuild/code change to switch) — same pattern already used for `mode.ts`/`theme.ts` (chrome.storage.sync-backed setting, applied live, exposed in the Settings popover in `ModeSwitcher.tsx`).
- Manifest currently declares no `host_permissions` — must add both origins (`http://localhost:3000/*` and the Vercel domain) or `fetch` calls from extension pages will be blocked.
- The Next.js API route needs CORS headers allowing the extension's origin (`chrome-extension://<id>`).

## Current extension state (as of handoff)

- `Composer.onSend` in `ChatLayout.tsx` currently triggers a client-side mock reply (fake typing via `setTimeout`), not a real fetch. This is the integration point to replace.
- Message rendering already models `pending` → `streaming` → `done` states (`MessageList.tsx`) — built to match SDK streaming output, just needs a real stream source instead of the mock timer.
