# Among Jose

Among Jose is a text-only multiplayer party game inspired by social deduction games. The web client is built with Next.js 15, TypeScript, TailwindCSS, shadcn-style UI components, Framer Motion, Zustand, and Socket.IO.

## What is included

- Lobby flow with room codes
- Up to 8 players per room
- Private prompt assignment
- Anonymous answer reveal
- Text chat during reveal/discussion/voting/results
- Vote and results flow
- Scoreboard and round history
- Host migration when host disconnects
- Reconnect support with persistent room state during an active game
- 200+ prompt pairs in the prompt bank

## Important deployment note

Vercel does not host a Socket.IO WebSocket server directly. The Next.js frontend is Vercel-compatible, but the realtime Socket.IO service needs to run on an always-on Node host such as Render, Railway, Fly.io, or a small VPS. Vercel’s docs state that Functions do not support acting as a WebSocket server, and Socket.IO’s Next.js guide warns that Vercel is not a valid deployment target for WebSockets. 

## Local development

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env.local` and set:

```bash
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
PORT=3001
CLIENT_ORIGIN=http://localhost:3000
```

3. Start both the Next.js app and the realtime server:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Realtime server only

```bash
npm run realtime
```

## Vercel deployment

1. Push the repo to GitHub.
2. Import the repo into Vercel.
3. Set `NEXT_PUBLIC_SOCKET_URL` to the public URL of your deployed realtime server.
4. Deploy the Next.js app normally.

## Realtime deployment

Deploy `server/index.ts` to Render, Railway, Fly.io, or any Node host that supports WebSockets.

Environment variables:

- `PORT` – server port
- `CLIENT_ORIGIN` – allowed browser origin for CORS
- `NEXT_PUBLIC_SOCKET_URL` – browser-facing Socket.IO endpoint used by the Next.js app

## Architecture

- `src/app` – App Router pages
- `src/components/game` – game screens and lobby UI
- `src/components/ui` – shadcn-style reusable components
- `src/shared` – shared Socket.IO types and game models
- `server` – Socket.IO realtime engine and room lifecycle manager

## Notes

The server uses in-memory room state for simplicity and fast gameplay. That keeps a room alive during an active session and makes reconnects work, but it is single-instance state. For horizontal scaling, add a Redis adapter and a persistent store for room snapshots.
