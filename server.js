import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createMatch, joinMatch, applyAction, applyNextHand, publicState } from './engine.js';
import { getMatch, setMatch, allMatches, getLeaderboard, addLeaderboardEntry } from './store.js';

const PORT = process.env.PORT || 8787;

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  res.end(payload);
}

function cors(res) {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  res.end();
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function route(method, pathname) {
  const parts = pathname.split('/').filter(Boolean);
  // GET /health
  if (method === 'GET' && pathname === '/health') return ['health'];
  // GET /api/leaderboard
  if (method === 'GET' && pathname === '/api/leaderboard') return ['leaderboard'];
  // GET /api/matches
  if (method === 'GET' && pathname === '/api/matches') return ['matches_list'];
  // POST /api/matches
  if (method === 'POST' && pathname === '/api/matches') return ['matches_create'];
  // POST /api/matches/:id/join
  if (method === 'POST' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'matches' && parts[3] === 'join')
    return ['matches_join', parts[2]];
  // POST /api/matches/:id/actions
  if (method === 'POST' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'matches' && parts[3] === 'actions')
    return ['matches_action', parts[2]];
  // GET /api/matches/:id
  if (method === 'GET' && parts.length === 3 && parts[0] === 'api' && parts[1] === 'matches')
    return ['matches_get', parts[2]];
  return null;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost`);
  const pathname = url.pathname;

  if (req.method === 'OPTIONS') return cors(res);

  const matched = route(req.method, pathname);
  if (!matched) return json(res, 404, { error: 'Not found' });

  const [handler, matchId] = matched;

  try {
    switch (handler) {
      case 'health':
        return json(res, 200, { ok: true, ts: Date.now(), matches: allMatches().length });

      case 'leaderboard':
        return json(res, 200, { leaderboard: getLeaderboard() });

      case 'matches_list':
        return json(res, 200, {
          matches: allMatches().map(m => ({
            matchId: m.matchId,
            phase: m.phase,
            players: m.players.map(p => ({ handle: p.handle, stack: p.stack })),
          })),
        });

      case 'matches_create': {
        const body = await readBody(req);
        if (!body.handle) return json(res, 400, { error: 'handle required' });
        const id = randomUUID();
        const playerId = randomUUID();
        const match = createMatch(id, playerId, body.handle);
        setMatch(id, match);
        return json(res, 201, { matchId: id, playerId, state: publicState(match, playerId) });
      }

      case 'matches_join': {
        const match = getMatch(matchId);
        if (!match) return json(res, 404, { error: 'Match not found' });
        const body = await readBody(req);
        if (!body.handle) return json(res, 400, { error: 'handle required' });
        const playerId = randomUUID();
        joinMatch(match, playerId, body.handle);
        setMatch(matchId, match);
        return json(res, 200, { playerId, state: publicState(match, playerId) });
      }

      case 'matches_get': {
        const match = getMatch(matchId);
        if (!match) return json(res, 404, { error: 'Match not found' });
        const viewerId = url.searchParams.get('playerId') || null;
        if (match.phase === 'complete' && match.winner) {
          const winnerPlayer = match.players.find(p => p.id === match.winner);
          const loserPlayer = match.players.find(p => p.id !== match.winner);
          if (winnerPlayer && loserPlayer) {
            const already = getLeaderboard().find(e => e.matchId === matchId);
            if (!already) {
              addLeaderboardEntry({
                matchId,
                winner: winnerPlayer.handle,
                loser: loserPlayer.handle,
                completedAt: Date.now(),
              });
            }
          }
        }
        return json(res, 200, { state: publicState(match, viewerId) });
      }

      case 'matches_action': {
        const match = getMatch(matchId);
        if (!match) return json(res, 404, { error: 'Match not found' });
        const body = await readBody(req);
        const { playerId, action, amount } = body;
        if (!playerId || !action) return json(res, 400, { error: 'playerId and action required' });

        if (action === 'next-hand') {
          applyNextHand(match, playerId);
        } else {
          applyAction(match, playerId, action, amount);
        }
        setMatch(matchId, match);
        return json(res, 200, { state: publicState(match, playerId) });
      }

      default:
        return json(res, 404, { error: 'Not found' });
    }
  } catch (err) {
    return json(res, 400, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`SinoBros Poker API listening on http://localhost:${PORT}`);
});
