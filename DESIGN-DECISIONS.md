# StoryFuse product decisions — Prototype 0.3

## Confirmed direction

- Launch order: Discord first, then standalone website, then mobile.
- Room discovery: public and private rooms.
- Identity: Discord login only; Discord user ID is the stable account key.
- Hosting: lowest practical cost, with minimal operations overhead.

## 0.3 architecture

```text
Discord user / browser
        |
        v
React + Vite client
        |
        +---- HTTPS OAuth routes ----> Discord OAuth2
        |
        +---- Socket.IO ------------> Node.js / Express game server
                                              |
                                              +-- in-memory room state (prototype)
                                              +-- PostgreSQL schema (next persistence step)
```

The server is authoritative for membership, phase transitions, deadlines, submissions, votes, tie resolution, and scoring. Clients receive anonymous submission records while a game is active. Author IDs/names are only included after the game reaches the final reveal.

## Room policy

- Public rooms appear in the public room list.
- Private rooms are joined using a six-character room code.
- Room host starts the game and controls manual phase transitions.
- Rooms support players and spectators. Spectators may vote but may not submit.
- Active room size is intentionally not globally capped by the product concept; a configurable per-room cap should be added before open beta to protect service resources.

## Affordability strategy

Start with one Node service and one managed PostgreSQL database. Keep web client and API in one repository and avoid microservices. Use a free/low-cost managed tier for closed testing, but choose an always-on tier before public Discord sessions if sleep/cold-start behavior harms real-time play. Add capacity only after observing actual concurrency.

## Security and privacy invariants

- Never send author IDs or author names before final reveal.
- Validate Discord identity on the server; never trust a client-supplied user ID.
- Enforce one sentence per player per round, one vote per member per round, and player self-vote prevention on the server.
- Do not place the Discord client secret in frontend code.
- Before public launch: secure cookies, CSRF protection, persistent sessions, rate limiting, input moderation, reporting tools, abuse controls, and automated tests are required.
