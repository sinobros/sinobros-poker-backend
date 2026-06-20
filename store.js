// In-memory store with optional JSON snapshot persistence

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = join(__dir, 'data', 'poker-state.json');

const state = {
  matches: {},         // matchId -> match object
  leaderboard: [],     // { matchId, winner, loser, completedAt }
};

// load snapshot if present
try {
  const raw = readFileSync(SNAPSHOT_PATH, 'utf8');
  const snap = JSON.parse(raw);
  Object.assign(state, snap);
} catch {
  // no snapshot yet — start fresh
}

export function getMatch(id) { return state.matches[id] || null; }
export function setMatch(id, match) { state.matches[id] = match; persist(); }
export function allMatches() { return Object.values(state.matches); }
export function getLeaderboard() { return state.leaderboard; }

export function addLeaderboardEntry(entry) {
  state.leaderboard.unshift(entry);
  if (state.leaderboard.length > 100) state.leaderboard.length = 100;
  persist();
}

function persist() {
  try {
    mkdirSync(join(__dir, 'data'), { recursive: true });
    writeFileSync(SNAPSHOT_PATH, JSON.stringify(state, null, 2));
  } catch {
    // non-fatal — in-memory still works
  }
}
