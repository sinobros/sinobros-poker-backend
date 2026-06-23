# SinoBros Poker Backend

Node REST backend for the SinoBros Heads-Up Texas Hold'em table.

The static frontend lives in `sinobros/sinobros.github.io` and calls this API from GitHub Pages. This backend is designed to run over HTTPS on port `8787` for whatever domain points at the host.

## Run

The server defaults to HTTPS port `8787` and binds to `0.0.0.0` so it is reachable from outside the host on any domain that points at it.

Required environment variables:

- `SSL_KEY`: path to the private key PEM for the served domain
- `SSL_CERT`: path to the certificate PEM for the served domain

Optional environment variables:

- `PORT`: listen port, default `8787`
- `HOST`: bind host, default `0.0.0.0`

```bash
SSL_KEY=/path/to/privkey.pem SSL_CERT=/path/to/fullchain.pem npm start
```

```bash
curl https://your-domain.example:8787/health
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
