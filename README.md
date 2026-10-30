# StoryFuse Prototype 0.3

StoryFuse is a collaborative multiplayer story-writing and voting game. Prototype 0.3 follows the chosen product direction: Discord first, then website and mobile; public and private rooms; Discord-only accounts; and low-cost hosting.

## What's new in 0.3

- Discord OAuth2 sign-in (`identify` scope)
- Authenticated Socket.IO backend
- Create public or private rooms; private rooms use six-character invite codes
- Join public rooms or join by private room code
- Player and spectator roles
- Server-side one-sentence-per-player and one-vote-per-member enforcement
- Server-side self-vote rejection for players; spectator voting allowed
- Anonymous entries during play and author reveal after the final round
- Host controls and server-managed phase deadlines
- PostgreSQL schema draft for the persistence layer

## Project layout

- `src/` — Vite/React client, including the original local gameplay demo and the new Discord lobby UI
- `server/src/` — Express, Discord OAuth and Socket.IO real-time server
- `server/db/schema.sql` — proposed PostgreSQL schema for persistent production data
- `server/README.md` — backend setup and event reference

## Local setup

See [`server/README.md`](server/README.md) for Discord application setup. Start the API from `server/` and the web client from the project root. Copy `server/.env.example` to `server/.env` and configure the Discord credentials first.

For Activity development, copy the root `.env.example` to `.env`, set `VITE_DISCORD_CLIENT_ID` to the same Discord application ID as the server, and configure the Discord Developer Portal Activity URL Mapping to the deployed client URL. On Netlify, set `VITE_API_URL` to the public HTTPS URL of the deployed `server/` service before rebuilding. The web client automatically uses the Embedded App SDK only when it is running inside a Discord iframe.

Build verification:

```text
npm install
npm run build
cd server
npm install
npm run build
```

The current build is ready for a hosted web OAuth beta and contains the Activity authentication foundation. A real Discord launch still requires Developer Portal Activity configuration and URL Mapping, plus persistent storage and production deployment configuration described in [`server/README.md`](server/README.md).

The local rules/demo area is still available for trying the original game loop without signing in. The Discord lobby uses the new backend.

## Product roadmap

1. **0.3 — Discord-first multiplayer foundation:** OAuth, rooms, server-authoritative gameplay events, and a usable live lobby scaffold.
2. **0.4 — Discord Activity:** Embedded App SDK initialization, Activity launch context, Discord server install/invite flow, slash commands, and in-Discord launch.
3. **0.5 — Persistence and production hardening:** PostgreSQL integration, reconnect recovery, moderation/reporting, rate limits, audit logs, and tests.
4. **0.6 — Public website:** standalone browser client on the same API and account system.
5. **0.7+ — Mobile:** responsive PWA first; native wrapper only after usage justifies it.

## Hosting direction

Keep the API and database on low-cost managed infrastructure. For a small alpha, use a single always-on Node service and managed PostgreSQL with free/low-cost tiers where available. Avoid Kubernetes and separate microservices. Confirm current provider limits and pricing before choosing a production host. Discord Activities require public HTTPS and the Discord Developer Portal Activity configuration.

## Not production-ready yet

The realtime server currently stores active rooms in memory. Restarting it clears active games. The PostgreSQL schema is a design artifact, not connected storage. Discord OAuth is implemented, but the Embedded App SDK/Activity launch flow and bot/slash-command installation are not yet implemented. The live lobby UI is a first integration scaffold; the original full game screen remains a local demo. Do not advertise 0.3 as a launched or fully integrated Discord Activity.
