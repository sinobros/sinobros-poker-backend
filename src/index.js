const https = require('https');
const fs = require('fs');
const express = require('express');
const { randomInt, randomUUID } = require('crypto');
const { init, saveScore } = require('./db');
const { createMatch, joinMatch, applyAction, applyNextHand, publicState } = require('./pokerEngine');
const { getMatch, setMatch, allMatches, getLeaderboard, addLeaderboardEntry } = require('./pokerStore');

const app = express();
const PORT = process.env.PORT || 3000;

const SSL_KEY  = process.env.SSL_KEY || '/Users/robonate/src/backendfor3000/sinobros.key';
const SSL_CERT = process.env.SSL_CERT || '/Users/robonate/src/backendfor3000/fullchain.cer';

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

function recordCompletedMatch(matchId, match) {
  if (match.phase !== 'complete' || !match.winner) return;

  const winnerPlayer = match.players.find(player => player.id === match.winner);
  const loserPlayer = match.players.find(player => player.id !== match.winner);
  if (!winnerPlayer || !loserPlayer) return;

  const alreadyRecorded = getLeaderboard().find(entry => entry.matchId === matchId);
  if (alreadyRecorded) return;

  addLeaderboardEntry({
    matchId,
    winner: winnerPlayer.handle,
    loser: loserPlayer.handle,
    completedAt: Date.now(),
  });
}

function pokerHandler(handler) {
  return (req, res) => {
    try {
      handler(req, res);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  };
}

function generateMatchCode() {
  const start = randomInt(0, 10000);
  for (let offset = 0; offset < 10000; offset++) {
    const matchId = String((start + offset) % 10000).padStart(4, '0');
    if (!getMatch(matchId)) return matchId;
  }
  throw new Error('No match codes available');
}

function normalizeMatchCode(value) {
  const matchId = String(value || '').trim();
  return /^\d{4}$/.test(matchId) ? matchId : null;
}

app.get('/health', (req, res) => {
  res.json({ ok: true, ts: Date.now(), matches: allMatches().length });
});

app.get('/api/leaderboard', (req, res) => {
  res.json({ leaderboard: getLeaderboard() });
});

app.get('/api/matches', (req, res) => {
  res.json({
    matches: allMatches().map(match => ({
      matchId: match.matchId,
      phase: match.phase,
      players: match.players.map(player => ({ handle: player.handle, stack: player.stack })),
    })),
  });
});

app.post('/api/matches', pokerHandler((req, res) => {
  const { handle } = req.body;
  if (!handle) return res.status(400).json({ error: 'handle required' });

  const matchId = generateMatchCode();
  const playerId = randomUUID();
  const match = createMatch(matchId, playerId, handle);
  setMatch(matchId, match);

  return res.status(201).json({ matchId, playerId, state: publicState(match, playerId) });
}));

app.post('/api/matches/:id/join', pokerHandler((req, res) => {
  const matchId = normalizeMatchCode(req.params.id);
  if (!matchId) return res.status(400).json({ error: 'Match code must be 4 digits' });

  const match = getMatch(matchId);
  if (!match) return res.status(404).json({ error: 'Match not found' });

  const { handle } = req.body;
  if (!handle) return res.status(400).json({ error: 'handle required' });

  const playerId = randomUUID();
  joinMatch(match, playerId, handle);
  setMatch(matchId, match);

  return res.json({ playerId, state: publicState(match, playerId) });
}));

app.get('/api/matches/:id', (req, res) => {
  const matchId = normalizeMatchCode(req.params.id);
  if (!matchId) return res.status(400).json({ error: 'Match code must be 4 digits' });

  const match = getMatch(matchId);
  if (!match) return res.status(404).json({ error: 'Match not found' });

  recordCompletedMatch(matchId, match);

  const viewerId = req.query.playerId || null;
  return res.json({ state: publicState(match, viewerId) });
});

app.post('/api/matches/:id/actions', pokerHandler((req, res) => {
  const matchId = normalizeMatchCode(req.params.id);
  if (!matchId) return res.status(400).json({ error: 'Match code must be 4 digits' });

  const match = getMatch(matchId);
  if (!match) return res.status(404).json({ error: 'Match not found' });

  const { playerId, action, amount } = req.body;
  if (!playerId || !action) return res.status(400).json({ error: 'playerId and action required' });

  if (action === 'next-hand') {
    applyNextHand(match, playerId);
  } else {
    applyAction(match, playerId, action, amount);
  }
  setMatch(matchId, match);

  return res.json({ state: publicState(match, playerId) });
}));

app.post('/highscore', (req, res) => {
  const { name } = req.body;
  const score = req.body.score !== undefined ? Number(req.body.score) : req.body.score;

  if (typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'name must be a non-empty string' });
  }
  if (!Number.isInteger(score)) {
    return res.status(400).json({ error: 'score must be an integer' });
  }

  const { rank, topTen } = saveScore(name.trim(), score);

  return res.status(201).json({ rank, topTen });
});

init().then(() => {
  const sslOptions = {
    key:  fs.readFileSync(SSL_KEY),
    cert: fs.readFileSync(SSL_CERT),
  };
  https.createServer(sslOptions, app).listen(PORT, "0.0.0.0", () => {
    console.log(`Highscore API listening on https://0.0.0.0:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
