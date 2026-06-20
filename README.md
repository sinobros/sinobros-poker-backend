# SinoBros Poker Backend

Node REST backend for the SinoBros Heads-Up Texas Hold'em table.

The static frontend lives in `sinobros/sinobros.github.io` and calls this API from GitHub Pages. This backend is designed to run on a separate server/domain such as `https://poker-api.sinobros.org`.

## Run locally

```bash
npm start
```

Default port: `8787`.

```bash
curl http://localhost:8787/health
```

## Test

```bash
npm test
```

## API

- `GET /health`
- `POST /api/matches` with `{ "handle": "Nate" }`
- `POST /api/matches/:id/join` with `{ "handle": "Tom" }`
- `GET /api/matches/:id?playerId=...`
- `POST /api/matches/:id/actions` with `{ "playerId": "...", "action": "call" }`
- `GET /api/leaderboard`

## Notes

- Uses built-in Node modules only; no install step is required.
- Uses REST polling instead of WebSockets for simple static frontend integration.
- Keeps match state in memory and snapshots to `backend/data/poker-state.json` at runtime.
- Server is authoritative for deck order, hole cards, board cards, betting state, showdown, and pot awards.
- Prototype CORS currently allows all origins.
