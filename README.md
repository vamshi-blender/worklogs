# Workupdate AI

This project is a starter AI application with:

- A Next.js backend that can deploy to Vercel
- An `/api/chat` route powered by the OpenAI Agents SDK
- A local web chat tester
- A Chrome extension popup that calls the same backend

## Getting Started

Create a local environment file:

```bash
cp .env.example .env.local
```

Set `OPENAI_API_KEY` in `.env.local`. `OPENAI_MODEL` defaults to `gpt-5.5`.

Then run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to test the backend through the web chat.

## Chrome Extension

1. Run the backend locally with `npm run dev`.
2. Open Chrome and go to `chrome://extensions`.
3. Enable Developer mode.
4. Choose **Load unpacked** and select the `extension` folder.
5. Open the extension popup and chat.

The extension defaults to `http://localhost:3000`. Use the extension options page to switch the backend URL to your Vercel deployment later.

## API

`POST /api/chat`

```json
{
  "messages": [{ "role": "user", "content": "Hello" }]
}
```

Response:

```json
{
  "reply": "Hi! How can I help?"
}
```

The route uses application-managed transcript replay for this first simple chatbot. Future versions can add Agents SDK sessions, hosted tools, function tools, or page-context tools from the extension.

## Deploy On Vercel

Deploy the Next.js app to Vercel and set the same environment variables in the Vercel project settings:

- `OPENAI_API_KEY`
- `OPENAI_MODEL` optional

After deployment, open the extension options page and set the backend URL to the Vercel app URL.
