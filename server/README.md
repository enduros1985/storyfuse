# StoryFuse 0.3 realtime service

This is the first Discord-authenticated multiplayer backend scaffold. It adds Discord OAuth login, Embedded App SDK token exchange, authenticated Socket.IO connections, public/private rooms, room codes, host controls, live state broadcasts, server-side sentence/vote validation, anonymous in-game entries, and final author reveal.

## Run locally

1. Install Node.js 20 or newer.
2. In `server/`, copy `.env.example` to `.env` and fill in a Discord application Client ID, Client Secret, and Redirect URI.
3. In the Discord Developer Portal, add the exact redirect URI `http://localhost:3001/auth/discord/callback` under OAuth2 Redirects. Enable the application and use the `identify` scope only for this prototype.
4. Run `npm install` and `npm run dev` in `server/`.
5. In a second terminal, run the Vite client from the repository root (`npm install`, `npm run dev`).
6. Open `http://localhost:3001/auth/discord` to sign in. The callback returns to the Vite origin.

API health check: `http://localhost:3001/health`.

## Render deployment

The repository root contains a Render Blueprint that points Render at this directory. If configuring the service manually, use `server` as the root directory, `npm install && npm run build` as the build command, `npm start` as the start command, and `/health` as the health check path. Render supplies the `PORT` environment variable automatically; the server listens on it.

Discord interaction endpoint: `POST http://localhost:3001/discord/interactions`. Set this URL in the Developer Portal under Interactions Endpoint URL after the server is deployed over HTTPS. The endpoint validates Discord's Ed25519 signature using `DISCORD_PUBLIC_KEY`, answers Discord's ping, and currently handles a basic `story` chat-input command.

To register `/story`, add a bot token to `DISCORD_BOT_TOKEN`. Set `DISCORD_GUILD_ID` for an instant test command in one server, then run `npm run register:commands`. Omit the guild ID to register globally; global command propagation can take longer. The Activity's automatically-created Launch entry point is separate from this optional `/story` command.

The Activity client posts its one-time SDK authorization code to `POST /api/token`. The server exchanges it with Discord and returns the access token for `authenticate()`, plus a one-hour signed socket credential. The socket credential avoids relying on third-party cookies inside Discord's embedded browser. Regular web OAuth continues to use the HTTP-only session cookie.

## Discord installation readiness

This repository implements Discord web OAuth (`identify`), Embedded App SDK authentication (`identify` and `applications.commands`), and multiplayer rooms. The client and API still need deployment and Developer Portal Activity URL Mapping and enablement before it can be launched as an Activity. Discord requires a URL Mapping before Activity functionality can be enabled ([Discord Activity setup](https://support-dev.discord.com/hc/en-us/articles/21204423970071-Introducing-the-Embedded-App-SDK)).

For browser OAuth, add the exact value of `DISCORD_REDIRECT_URI` to OAuth2 Redirects. Keep the client secret only in the server environment. `DISCORD_PUBLIC_KEY` is only used by the optional interactions endpoint. For deployment, use HTTPS, set `NODE_ENV=production`, provide a random `SESSION_SECRET` of at least 32 characters, and set `CLIENT_ORIGIN` to the deployed client URL. Configure the deployed client with `VITE_API_URL` and `VITE_DISCORD_CLIENT_ID`; configure the API's `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `PUBLIC_ORIGIN`, and `DISCORD_REDIRECT_URI`. For split client/API hosts, set `COOKIE_SECURE=true` and `COOKIE_SAMESITE=None` for browser OAuth.

## Discord Activity launch checklist

1. Deploy the Vite client and realtime API to public HTTPS origins.
2. Set `VITE_DISCORD_CLIENT_ID` to the Discord application ID and `VITE_API_URL` to the API origin, then rebuild and deploy the client.
3. Set the server's `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `CLIENT_ORIGIN`, `PUBLIC_ORIGIN`, `DISCORD_REDIRECT_URI`, and a strong `SESSION_SECRET`. `DISCORD_REDIRECT_URI` must exactly match an OAuth2 redirect configured in the Developer Portal for the browser sign-in path.
4. In the Developer Portal, add a URL Mapping for the deployed client, then enable Activities under **Activities → Settings**. The mapped client origin must be the same origin used to build the client.
5. Launch the Activity from Discord's App Launcher and check authorization, room creation, joining from a second Discord account, writing, voting, and final reveal. Confirm `/health` responds on the deployed API.

The browser OAuth callback is only the standalone web login path; Activity authentication uses the Embedded App SDK authorization code.

## Socket events

Client -> server: `room:create`, `room:join`, `room:leave`, `game:start`, `submission:create`, `vote:create`, `host:close-writing`, `host:close-voting`, `host:next-round`.

Server -> client: `session:user`, `room:state`, `room:notice`, `rooms:changed`.

The client must connect to the Socket.IO server with credentials enabled. Room state intentionally omits author IDs and names until `phase === "finished"`. Never add author IDs to public payloads or logs visible to participants.

## Important prototype limits

- Room state is in memory and disappears when the server restarts. `db/schema.sql` is the PostgreSQL persistence target; it is not wired up yet.
- The Discord Activity authentication and socket connection are wired in source but have not yet been validated against the deployed Developer Portal Activity configuration.
- This is a development scaffold, not production-hardened authentication. Before launch, add HTTPS-only secure cookies, CSRF protection, session revocation, persistent storage, rate limits, origin allowlists, structured logging, moderation/reporting, and automated tests.
- The existing Vite screen remains the local rules/gameplay demo. The real-time server is exposed as an API/socket layer for the next client wiring pass.
