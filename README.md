# SinoBros Poker Backend

Node REST backend for the SinoBros Heads-Up Texas Hold'em table.

The static frontend lives in `sinobros/sinobros.github.io` and calls this API from GitHub Pages. This backend is designed to run on `https://golfmat.ch:8787`.

## Run

The server defaults to `https://golfmat.ch:8787` and binds to `0.0.0.0` so it is reachable from outside the host.

Required environment variables:

- `SSL_KEY`: path to the private key PEM for `golfmat.ch`
- `SSL_CERT`: path to the certificate PEM for `golfmat.ch`

Optional environment variables:

- `PORT`: listen port, default `8787`
- `HOST`: bind host, default `0.0.0.0`
- `PUBLIC_DOMAIN`: domain used in logs and URL parsing, default `golfmat.ch`

```bash
SSL_KEY=/path/to/privkey.pem SSL_CERT=/path/to/fullchain.pem npm start
```

```bash
curl https://golfmat.ch:8787/health
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
