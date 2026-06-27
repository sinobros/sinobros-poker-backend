const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'highscores.db');

let db;

async function init() {
  const SQL = await initSqlJs();

  db = fs.existsSync(DB_PATH)
    ? new SQL.Database(fs.readFileSync(DB_PATH))
    : new SQL.Database();

  db.run(`
    CREATE TABLE IF NOT EXISTS highscores (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      score      INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `);

  persist();
}

function persist() {
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function saveScore(name, score) {
  db.run('INSERT INTO highscores (name, score) VALUES (?, ?)', [name, score]);

  const lastId = db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0];

  const rank = db.exec(
    'SELECT COUNT(*) + 1 AS rank FROM highscores WHERE score > (SELECT score FROM highscores WHERE id = ?)',
    [lastId]
  )[0].values[0][0];

  const topTenRows = db.exec(
    'SELECT name, score FROM highscores ORDER BY score DESC, created_at ASC LIMIT 10'
  );
  const topTen = topTenRows.length
    ? topTenRows[0].values.map(([n, s]) => ({ name: n, score: s }))
    : [];

  persist();

  return { rank, topTen };
}

module.exports = { init, saveScore };
