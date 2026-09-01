/**
 * sql.js wrapper that mimics better-sqlite3 API
 * Pure JavaScript - no native modules, no segfaults
 */
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

let SQL = null;

async function initSqlEngine() {
  if (!SQL) {
    SQL = await initSqlJs();
  }
  return SQL;
}

class DatabaseWrapper {
  constructor(dbPath, options = {}) {
    this.dbPath = dbPath;
    this.readonly = options.readonly || false;
    this.db = null;
    this._closed = false;
  }

  async _init() {
    const sql = await initSqlEngine();
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new sql.Database(buffer);
    } else {
      this.db = new sql.Database();
    }
    return this;
  }

  _save() {
    if (!this.readonly && !this._closed && this.db) {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
    }
  }

  exec(sql) {
    this.db.run(sql);
    this._save();
  }

  run(sql, ...params) {
    this.db.run(sql, params.length > 0 ? params[0] : undefined);
    this._save();
  }

  prepare(sql) {
    const self = this;
    return {
      all(...params) {
        const stmt = self.db.prepare(sql);
        if (params.length > 0 && params[0] !== undefined) {
          stmt.bind(params[0]);
        }
        const results = [];
        while (stmt.step()) {
          results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
      },
      get(...params) {
        const stmt = self.db.prepare(sql);
        if (params.length > 0 && params[0] !== undefined) {
          stmt.bind(params[0]);
        }
        let result = null;
        if (stmt.step()) {
          result = stmt.getAsObject();
        }
        stmt.free();
        return result;
      },
      run(...params) {
        self.db.run(sql, params.length > 0 ? params[0] : undefined);
        self._save();
        return { changes: self.db.getRowsModified() };
      }
    };
  }

  pragma(key, value) {
    if (value !== undefined) {
      try {
        this.db.run(`PRAGMA ${key} = ${value}`);
      } catch (e) {
        // some pragmas may not be supported in sql.js
      }
    }
  }

  close() {
    if (!this._closed && this.db) {
      this._save();
      this.db.close();
      this._closed = true;
    }
  }
}

// Synchronous wrapper for compatibility
const DEFAULT_DB_PATH = path.join(__dirname, '../../data/jingcai.db');

function getDatabase(dbPath = DEFAULT_DB_PATH) {
  const wrapper = new DatabaseWrapper(dbPath);
  // sql.js init is async, but we need sync compatibility
  // Use a trick: init synchronously by reading the file
  const sql = SQL; // Must call initSqlEngine() first
  if (!sql) throw new Error('SQL engine not initialized. Call initDatabaseAsync() first.');

  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    wrapper.db = new sql.Database(buffer);
  } else {
    wrapper.db = new sql.Database();
  }
  return wrapper;
}

function initDatabase(dbPath = DEFAULT_DB_PATH) {
  const db = getDatabase(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS matches (
      match_id TEXT PRIMARY KEY,
      match_date DATE,
      match_time TIME,
      buy_deadline DATETIME,
      league_name TEXT,
      home_team TEXT,
      away_team TEXT,
      home_rank INTEGER,
      away_rank INTEGER,
      handicap INTEGER DEFAULT 0,
      status TEXT DEFAULT 'notstarted',
      home_score INTEGER,
      away_score INTEGER,
      flashscore_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS odds_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id TEXT REFERENCES matches(match_id),
      snapshot_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      sp_home REAL,
      sp_draw REAL,
      sp_away REAL,
      sp_handicap_home REAL,
      sp_handicap_draw REAL,
      sp_handicap_away REAL,
      sp_goals_0 REAL,
      sp_goals_1 REAL,
      sp_goals_2 REAL,
      sp_goals_3 REAL,
      sp_goals_4 REAL,
      sp_goals_5 REAL,
      sp_goals_6 REAL,
      sp_goals_7plus REAL,
      sp_scores_json TEXT,
      score_odds_json TEXT,
      goals_odds_json TEXT,
      half_odds_json TEXT
    );

    CREATE TABLE IF NOT EXISTS match_details (
      match_id TEXT PRIMARY KEY REFERENCES matches(match_id),
      home_form_json TEXT,
      away_form_json TEXT,
      h2h_json TEXT,
      home_stats_json TEXT,
      away_stats_json TEXT,
      standings_json TEXT,
      lineups_json TEXT,
      missing_players_json TEXT,
      weather TEXT,
      footballbin_prediction_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id TEXT REFERENCES matches(match_id),
      model_version TEXT,
      prob_home REAL,
      prob_draw REAL,
      prob_away REAL,
      prob_handicap_home REAL,
      prob_handicap_draw REAL,
      prob_handicap_away REAL,
      prob_goals_json TEXT,
      prob_scores_json TEXT,
      value_spf_json TEXT,
      value_hhspf_json TEXT,
      value_goals_json TEXT,
      value_scores_json TEXT,
      confidence REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS recommendations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rec_date DATE,
      rec_type TEXT,
      matches_json TEXT,
      total_odds REAL,
      stake REAL,
      expected_value REAL,
      result TEXT DEFAULT 'pending',
      actual_payout REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS model_versions (
      version TEXT PRIMARY KEY,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      features_json TEXT,
      hyperparams_json TEXT,
      accuracy REAL,
      log_loss REAL,
      roi REAL,
      brier_score REAL,
      is_active BOOLEAN DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS learning_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id TEXT,
      model_version TEXT,
      predicted_outcome TEXT,
      predicted_prob REAL,
      actual_outcome TEXT,
      was_correct BOOLEAN,
      odds_at_time REAL,
      profit_loss REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create indexes
  try { db.run('CREATE INDEX IF NOT EXISTS idx_matches_date ON matches(match_date)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_odds_match ON odds_snapshots(match_id)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_predictions_match ON predictions(match_id)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_recommendations_date ON recommendations(rec_date)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_learning_match ON learning_log(match_id)'); } catch(e) {}

  return db;
}

async function initDatabaseAsync(dbPath = DEFAULT_DB_PATH) {
  await initSqlEngine();
  return initDatabase(dbPath);
}

module.exports = { getDatabase, initDatabase, initDatabaseAsync, DEFAULT_DB_PATH };
