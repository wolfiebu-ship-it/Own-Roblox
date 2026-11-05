'use strict';
// Speicher: mit DATABASE_URL in einer Postgres-Datenbank (z. B. kostenlos bei Neon),
// ohne DATABASE_URL in einer Datei (gut zum Ausprobieren auf dem eigenen Computer).
const fs = require('fs');
const path = require('path');

const FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'klotzwelt.json');
let data = { users: {}, tokens: {} };
let pool = null;
let timer = null;
let saving = Promise.resolve();

async function load() {
  if (process.env.DATABASE_URL) {
    const { Pool } = require('pg');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === 'off' ? false : { rejectUnauthorized: false },
      max: 3
    });
    await pool.query('CREATE TABLE IF NOT EXISTS klotzwelt (id text PRIMARY KEY, data jsonb NOT NULL)');
    const r = await pool.query("SELECT data FROM klotzwelt WHERE id = 'main'");
    if (r.rows[0]) data = r.rows[0].data;
    console.log('Datenbank verbunden.');
  } else if (fs.existsSync(FILE)) {
    data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    console.log('Daten aus Datei geladen:', FILE);
  } else {
    console.log('Keine DATABASE_URL gesetzt: Daten werden in', FILE, 'gespeichert.');
  }
  data.users = data.users || {};
  data.tokens = data.tokens || {};
  data.bans = data.bans || {};
  return data;
}

async function write() {
  if (pool) {
    await pool.query("INSERT INTO klotzwelt (id, data) VALUES ('main', $1) ON CONFLICT (id) DO UPDATE SET data = $1", [data]);
  } else {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE + '.tmp', JSON.stringify(data));
    fs.renameSync(FILE + '.tmp', FILE);
  }
}

// Mehrere Änderungen kurz hintereinander werden zu einem Speichervorgang zusammengefasst
function save() {
  clearTimeout(timer);
  timer = setTimeout(flush, 1500);
}
function flush() {
  clearTimeout(timer);
  saving = saving.then(write).catch(e => console.error('Speichern fehlgeschlagen:', e.message));
  return saving;
}

module.exports = { load, save, flush, get data() { return data; } };
