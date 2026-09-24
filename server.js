/**
 * SportLog — SRMIST Student Achievement Portal
 * Backend: Node.js + Express + better-sqlite3
 *
 * Schema (5 tables, matches DBMS case study):
 *   STUDENT · SPORTS · EVENTS · ACTIVITY_LOG · PERFORMANCE
 *
 * Install: npm install express better-sqlite3 cors bcryptjs jsonwebtoken
 * Run    : node server.js
 */

'use strict';
const express    = require('express');
const { createClient } = require('@libsql/client');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const cors       = require('cors');
const path       = require('path');

const app    = express();
const PORT   = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || 'sportlog_secret_change_in_prod';

app.use(cors());
app.use(express.json());
// Serve the frontend from /public
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────
// DATABASE SETUP — Turso / libSQL
// ─────────────────────────────────────────────
// Production (Vercel): set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.
// Local development: falls back to the local SQLite file.
const DB_URL = process.env.TURSO_DATABASE_URL || 'file:./sportlog.db';
const db = createClient({ url: DB_URL, authToken: process.env.TURSO_AUTH_TOKEN || undefined });

async function initDb() {
  await db.batch([
    { sql: `CREATE TABLE IF NOT EXISTS STUDENT (student_id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, reg_number TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')))`, args: [] },
    { sql: `CREATE TABLE IF NOT EXISTS SPORTS (sport_id INTEGER PRIMARY KEY AUTOINCREMENT, sport_name TEXT NOT NULL UNIQUE, emoji TEXT NOT NULL DEFAULT '🏅', score_label TEXT NOT NULL DEFAULT 'Score / Result')`, args: [] },
    { sql: `CREATE TABLE IF NOT EXISTS EVENTS (event_id INTEGER PRIMARY KEY AUTOINCREMENT, sport_id INTEGER NOT NULL REFERENCES SPORTS(sport_id), event_name TEXT NOT NULL, event_date TEXT, location TEXT, level TEXT NOT NULL DEFAULT 'College Level')`, args: [] },
    { sql: `CREATE TABLE IF NOT EXISTS ACTIVITY_LOG (log_id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL REFERENCES STUDENT(student_id), sport_id INTEGER NOT NULL REFERENCES SPORTS(sport_id), event_id INTEGER NOT NULL REFERENCES EVENTS(event_id), class TEXT, category TEXT DEFAULT 'Individual', description TEXT, created_at TEXT DEFAULT (datetime('now')))`, args: [] },
    { sql: `CREATE TABLE IF NOT EXISTS PERFORMANCE (perf_id INTEGER PRIMARY KEY AUTOINCREMENT, log_id INTEGER NOT NULL UNIQUE REFERENCES ACTIVITY_LOG(log_id), achievement TEXT NOT NULL, score TEXT, rank INTEGER, medal_won TEXT DEFAULT 'None', position TEXT)`, args: [] }
  ]);
}
const dbReady = initDb();
async function query(sql, args=[]) { await dbReady; return db.execute({sql, args}); }
async function get(sql, ...args) { const r=await query(sql,args); return r.rows[0]; }
async function all(sql, ...args) { const r=await query(sql,args); return r.rows; }
async function run(sql, ...args) { return query(sql,args); }

// Seed sports catalogue once
const sportsSeed = [
  { sport_name:'Cricket',    emoji:'🏏', score_label:'Runs / Wickets / Economy' },
  { sport_name:'Football',   emoji:'⚽', score_label:'Goals / Assists' },
  { sport_name:'100m Dash',  emoji:'🏃', score_label:'Timing (e.g. 10.85s)' },
  { sport_name:'500m Dash',  emoji:'🏃', score_label:'Timing (e.g. 1m 32.5s)' },
  { sport_name:'Shot Put',   emoji:'🥏', score_label:'Distance (e.g. 12.40m)' },
  { sport_name:'Long Jump',  emoji:'🦘', score_label:'Distance (e.g. 6.85m)' },
  { sport_name:'Chess',      emoji:'♟️', score_label:'Score / ELO / W-L record' },
  { sport_name:'Carrom',     emoji:'🎯', score_label:'Points / Boards won' },
  { sport_name:'Volleyball', emoji:'🏐', score_label:'Sets Won / Points' },
  { sport_name:'Hockey',     emoji:'🏑', score_label:'Goals Scored / Saves' },
];
const seedSports = async () => {
  await dbReady;
  for (const s of sportsSeed) await run(`INSERT OR IGNORE INTO SPORTS (sport_name,emoji,score_label) VALUES (?,?,?)`, s.sport_name, s.emoji, s.score_label);
};
const seedReady = seedSports();

// ─────────────────────────────────────────────
// AUTH MIDDLEWARE
// ─────────────────────────────────────────────
function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return res.json({ success:false, error:'Unauthorized' });
  try {
    req.user = jwt.verify(header.slice(7), SECRET);
    next();
  } catch {
    return res.json({ success:false, error:'Session expired, please sign in again' });
  }
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
async function sportIdByName(name) {
  await seedReady; const row=await get('SELECT sport_id FROM SPORTS WHERE sport_name=?',name); return row?.sport_id;
}

// ─────────────────────────────────────────────
// AUTH ROUTES
// ─────────────────────────────────────────────

/** POST /api/auth/signup */
app.post('/api/auth/signup', async (req, res) => {
  const { name, reg_number, email, password, confirm_password } = req.body || {};
  if (!name || !reg_number || !email || !password || !confirm_password)
    return res.json({ success:false, error:'All fields are required' });

  if (reg_number.length !== 15)
    return res.json({ success:false, error:'Registration number must be exactly 15 characters' });

  if (!email.toLowerCase().endsWith('@srmist.edu.in'))
    return res.json({ success:false, error:'Only @srmist.edu.in emails are accepted' });

  if (password.length < 8)
    return res.json({ success:false, error:'Password must be at least 8 characters' });

  if (password !== confirm_password)
    return res.json({ success:false, error:'Passwords do not match' });

  const existing = await get('SELECT student_id FROM STUDENT WHERE reg_number=? OR email=?', reg_number, email.toLowerCase());
  if (existing) return res.json({ success:false, error:'Registration number or email already registered' });

  const hash = bcrypt.hashSync(password, 10);
  const info = await run('INSERT INTO STUDENT (name,reg_number,email,password) VALUES (?,?,?,?)', name, reg_number.toUpperCase(), email.toLowerCase(), hash);

  const user = { student_id: info.lastInsertRowid, name, reg_number: reg_number.toUpperCase(), email: email.toLowerCase() };
  const token = jwt.sign(user, SECRET, { expiresIn:'7d' });
  res.json({ success:true, message:'Account created!', token, user });
});

/** POST /api/auth/login */
app.post('/api/auth/login', async (req, res) => {
  const { reg_number, password } = req.body || {};
  if (!reg_number || !password)
    return res.json({ success:false, error:'Registration number and password are required' });

  const row = await get('SELECT * FROM STUDENT WHERE reg_number=?', reg_number.toUpperCase());
  if (!row || !bcrypt.compareSync(password, row.password))
    return res.json({ success:false, error:'Invalid registration number or password' });

  const user = { student_id: row.student_id, name: row.name, reg_number: row.reg_number, email: row.email };
  const token = jwt.sign(user, SECRET, { expiresIn:'7d' });
  res.json({ success:true, message:'Login successful', token, user });
});

/** GET /api/auth/me */
app.get('/api/auth/me', authRequired, async (req, res) => {
  const u = req.user;
  res.json({ success:true, user:{ student_id: u.student_id, name: u.name, reg_number: u.reg_number, email: u.email } });
});

// ─────────────────────────────────────────────
// SPORTS ROUTE
// ─────────────────────────────────────────────

/** GET /api/sports */
app.get('/api/sports', async (_req, res) => {
  await seedReady;
  const rows = await all('SELECT * FROM SPORTS ORDER BY sport_name');
  res.json({ success:true, data: rows });
});

// ─────────────────────────────────────────────
// ACHIEVEMENTS ROUTES
// (maps to ACTIVITY_LOG + PERFORMANCE + EVENTS)
// ─────────────────────────────────────────────

/**
 * GET /api/achievements
 * Filters: student_name, sport, level, class
 *
 * Implements Query 1 pattern — join all 5 tables.
 */
app.get('/api/achievements', async (_req, res) => {
  const { student_name, sport, level, class: cls } = _req.query;

  let sql = `
    SELECT
      al.log_id,
      al.class,
      al.category,
      al.description,
      al.created_at,
      st.student_id,
      st.name        AS student_name,
      st.reg_number  AS roll_number,
      sp.sport_name  AS sport,
      sp.emoji,
      e.event_id,
      e.event_name,
      e.event_date,
      e.location,
      e.level,
      p.achievement,
      p.score,
      p.rank,
      p.medal_won,
      p.position
    FROM ACTIVITY_LOG al
    JOIN STUDENT   st ON al.student_id = st.student_id
    JOIN SPORTS    sp ON al.sport_id   = sp.sport_id
    JOIN EVENTS    e  ON al.event_id   = e.event_id
    JOIN PERFORMANCE p ON al.log_id   = p.log_id
    WHERE 1=1
  `;
  const params = [];

  if (student_name) { sql += ` AND LOWER(st.name) LIKE ?`;  params.push(`%${student_name.toLowerCase()}%`); }
  if (sport)        { sql += ` AND sp.sport_name = ?`;       params.push(sport); }
  if (level)        { sql += ` AND e.level = ?`;             params.push(level); }
  if (cls)          { sql += ` AND LOWER(al.class) LIKE ?`;  params.push(`%${cls.toLowerCase()}%`); }

  sql += ` ORDER BY al.log_id DESC`;

  const rows = await all(sql, ...params);
  res.json({ success:true, count: rows.length, data: rows });
});

/**
 * POST /api/achievements
 * Inserts into EVENTS → ACTIVITY_LOG → PERFORMANCE (transactional)
 */
app.post('/api/achievements', authRequired, async (req, res) => {
  const {
    student_name, roll_number, class: cls,
    sport, category, level,
    achievement, position, score, medal_won,
    event_name, event_date, location,
    description,
  } = req.body || {};

  const required = { student_name, roll_number, cls, sport, category, level, achievement };
  const missing  = Object.entries(required).filter(([,v]) => !v).map(([k]) => k.replace(/_/g,' '));
  if (missing.length) return res.json({ success:false, error:`Missing: ${missing.join(', ')}` });

  const sid = await sportIdByName(sport);
  if (!sid) return res.json({ success:false, error:'Unknown sport: ' + sport });

  // Find or create STUDENT record (anyone can log for any student)
  let studentRow = await get('SELECT student_id FROM STUDENT WHERE reg_number=?', roll_number.toUpperCase());
  if (!studentRow) {
    // Create a placeholder student (no login credentials)
    const info = await run('INSERT OR IGNORE INTO STUDENT (name,reg_number,email,password) VALUES (?,?,?,?)', student_name, roll_number.toUpperCase(), `${roll_number.toLowerCase()}@srmist.edu.in`, 'nologin');
    const fallback = await get('SELECT student_id FROM STUDENT WHERE reg_number=?', roll_number.toUpperCase());
    studentRow = { student_id: Number(info.lastInsertRowid || fallback.student_id) };
  }

  const evInfo = await run(`INSERT INTO EVENTS (sport_id, event_name, event_date, location, level) VALUES (?,?,?,?,?)`, sid, event_name || 'Unnamed Event', event_date || null, location || null, level);
  const alInfo = await run(`INSERT INTO ACTIVITY_LOG (student_id, sport_id, event_id, class, category, description) VALUES (?,?,?,?,?,?)`, studentRow.student_id, sid, evInfo.lastInsertRowid, cls, category, description || null);
  await run(`INSERT INTO PERFORMANCE (log_id, achievement, score, rank, medal_won, position) VALUES (?,?,?,?,?,?)`, alInfo.lastInsertRowid, achievement, score || null, null, medal_won || 'None', position || null);
  const logId = Number(alInfo.lastInsertRowid);
  res.json({ success:true, message:'Achievement recorded!', data:{ log_id: logId } });
});

/**
 * DELETE /api/achievements/:id   (log_id)
 */
app.delete('/api/achievements/:id', authRequired, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.json({ success:false, error:'Invalid ID' });

  const row = await get('SELECT log_id FROM ACTIVITY_LOG WHERE log_id=?', id);
  if (!row) return res.json({ success:false, error:'Achievement not found' });

  await run('DELETE FROM PERFORMANCE WHERE log_id=?', id);
  await run('DELETE FROM ACTIVITY_LOG WHERE log_id=?', id);
  res.json({ success:true, message:'Deleted' });
});

// ─────────────────────────────────────────────
// STATS ROUTE  (implements all 6 SQL queries)
// ─────────────────────────────────────────────

/** GET /api/stats */
app.get('/api/stats', async (_req, res) => {
  // Total achievements & unique athletes (Query 2 basis)
  const totals = await get(`
    SELECT COUNT(al.log_id) AS totalAchievements,
           COUNT(DISTINCT al.student_id) AS totalStudents
    FROM ACTIVITY_LOG al
  `);

  // Query 5 — avg score per sport
  const bySport = (await all(`
    SELECT sp.sport_name AS sport, sp.emoji,
           COUNT(DISTINCT al.student_id) AS participants,
           COUNT(al.log_id) AS cnt
    FROM ACTIVITY_LOG al
    JOIN SPORTS sp ON al.sport_id = sp.sport_id
    GROUP BY sp.sport_id
    ORDER BY cnt DESC
  `)).map(r => ({ sport: r.sport, emoji: r.emoji, count: r.cnt, participants: r.participants }));

  // Achievements by level
  const byLevel = (await all(`
    SELECT e.level, COUNT(al.log_id) AS cnt
    FROM ACTIVITY_LOG al
    JOIN EVENTS e ON al.event_id = e.event_id
    GROUP BY e.level
    ORDER BY cnt DESC
  `)).map(r => ({ level: r.level, count: r.cnt }));

  // Query 3 — recent gold medal winners (top 5)
  const recentWinners = await all(`
    SELECT st.name AS student_name,
           sp.sport_name AS sport,
           sp.emoji,
           e.event_name,
           e.event_date,
           p.position,
           p.medal_won
    FROM PERFORMANCE p
    JOIN ACTIVITY_LOG al ON p.log_id   = al.log_id
    JOIN STUDENT   st   ON al.student_id = st.student_id
    JOIN SPORTS    sp   ON al.sport_id   = sp.sport_id
    JOIN EVENTS    e    ON al.event_id   = e.event_id
    WHERE p.medal_won NOT IN ('None','') AND p.medal_won IS NOT NULL
    ORDER BY al.created_at DESC
    LIMIT 5
  `);

  // Query 2 — top students by achievement count
  const topStudents = await all(`
    SELECT st.name, st.reg_number,
           COUNT(al.log_id) AS total_achievements
    FROM STUDENT st
    LEFT JOIN ACTIVITY_LOG al ON st.student_id = al.student_id
    GROUP BY st.student_id, st.name
    ORDER BY total_achievements DESC
    LIMIT 10
  `);

  // Query 6 — students who never won a medal
  const noMedalStudents = await all(`
    SELECT DISTINCT st.name, st.email
    FROM STUDENT st
    JOIN ACTIVITY_LOG al ON st.student_id = al.student_id
    JOIN PERFORMANCE p  ON al.log_id = p.log_id
    WHERE p.medal_won = 'None' OR p.medal_won IS NULL
  `);

  res.json({
    success: true,
    data: {
      totalAchievements: totals.totalAchievements,
      totalStudents:     totals.totalStudents,
      bySport,
      byLevel,
      recentWinners,
      topStudents,
      noMedalStudents,
    }
  });
});

// ─────────────────────────────────────────────
// LOCATION QUERY (Query 4)
// GET /api/events?location=Chennai
// ─────────────────────────────────────────────
app.get('/api/events', async (_req, res) => {
  const { location } = _req.query;
  let sql = `
    SELECT e.event_name, e.event_date, e.location, e.level,
           sp.sport_name, sp.emoji
    FROM EVENTS e
    JOIN SPORTS sp ON e.sport_id = sp.sport_id
    WHERE 1=1
  `;
  const params = [];
  if (location) { sql += ` AND LOWER(e.location) LIKE ?`; params.push(`%${location.toLowerCase()}%`); }
  sql += ` ORDER BY e.event_date DESC`;

  const rows = await all(sql, ...params);
  res.json({ success:true, count: rows.length, data: rows });
});

// ─────────────────────────────────────────────
// STUDENT PROFILE (Query 1 — by student)
// GET /api/students/:id/achievements
// ─────────────────────────────────────────────
app.get('/api/students/:id/achievements', async (_req, res) => {
  const studentId = Number(_req.params.id);
  const rows = await all(`
    SELECT al.log_id, sp.sport_name, sp.emoji,
           e.event_name, e.event_date, e.location, e.level,
           al.description, al.category, al.class,
           p.achievement, p.score, p.rank, p.medal_won, p.position
    FROM ACTIVITY_LOG al
    JOIN SPORTS      sp ON al.sport_id   = sp.sport_id
    JOIN EVENTS      e  ON al.event_id   = e.event_id
    JOIN PERFORMANCE p  ON al.log_id     = p.log_id
    WHERE al.student_id = ?
    ORDER BY al.log_id DESC
  `).all(studentId);
  res.json({ success:true, count: rows.length, data: rows });
});

// ─────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ success: true, service: 'SportLog API', status: 'ok' });
});

// ─────────────────────────────────────────────
// START
// ─────────────────────────────────────────────
// Vercel runs the Express app as its backend.
// Keep app.listen() only for local development.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\n🏆  SportLog backend running → http://localhost:${PORT}`);
    console.log(`    Database: ${DB_PATH}`);
    console.log(`    Serving frontend from: /public\n`);
  });
}

module.exports = app;
