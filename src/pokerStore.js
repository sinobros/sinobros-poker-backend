const { readFileSync, writeFileSync, mkdirSync } = require('fs');
const path = require('path');

const SNAPSHOT_PATH = path.join(__dirname, '..', 'data', 'poker-state.json');

const state = {
  matches: {},
  leaderboard: [],
};

try {
  const raw = readFileSync(SNAPSHOT_PATH, 'utf8');
  const snap = JSON.parse(raw);
  Object.assign(state, snap);
} catch {
  // Start fresh when no snapshot exists yet.
}

function getMatch(id) {
  return state.matches[id] || null;
}

function setMatch(id, match) {
  state.matches[id] = match;
  persist();
}

function allMatches() {
  return Object.values(state.matches);
}

function getLeaderboard() {
  return state.leaderboard;
}

function addLeaderboardEntry(entry) {
  state.leaderboard.unshift(entry);
  if (state.leaderboard.length > 100) state.leaderboard.length = 100;
  persist();
}

function persist() {
  try {
    mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
    writeFileSync(SNAPSHOT_PATH, JSON.stringify(state, null, 2));
  } catch {
    // Non-fatal: in-memory state still works.
  }
}

module.exports = { getMatch, setMatch, allMatches, getLeaderboard, addLeaderboardEntry };
